// src/modules/scans/service.ts
import type { FastifyInstance } from "fastify";
import type { ScanRun } from "./types";
import { EntitlementsService } from "../entitlements/service";
import { SCAN_PROFILES, getProfile } from "../../scanners/scan-profiles";

export async function startScan(
  fastify: FastifyInstance,
  workspaceId: string,
  userId: string,
  userPlan: string,
  repositoryId: string,
  branch: string,
  scanType: "quick" | "full"
): Promise<{ scan_id: string; status: string; message: string }> {
  const normalizedScanType = scanType || 'full';
  
  const entitlements = new EntitlementsService(fastify);

  // ✅ FIX: Check monthly limit only (concurrent checked separately below)
  const monthlyLimitCheck = await entitlements.checkMonthlyLimit(workspaceId, userPlan);

  if (!monthlyLimitCheck.allowed) {
    throw fastify.httpErrors.forbidden({
      code: "MONTHLY_SCAN_LIMIT_REACHED",
      current: monthlyLimitCheck.current,
      limit: monthlyLimitCheck.limit,
      message: monthlyLimitCheck.message,
      upgrade_url: "/dashboard/billing",
    });
  }

  // Validate repository
  const { data: repo, error: repoError } = await fastify.supabase
    .from("repositories")
    .select("id, full_name, status")
    .eq("id", repositoryId)
    .eq("workspace_id", workspaceId)
    .single();

  if (repoError || !repo) {
    throw fastify.httpErrors.notFound("Repository not found");
  }

  if (repo.status !== "active") {
    throw fastify.httpErrors.badRequest("Repository is not active");
  }

  // ✅ FIX: Single source of truth for concurrent scans - direct database query
  // This prevents issues where usage_tracking.concurrent_scans gets out of sync
  const concurrentLimit = getConcurrentScanLimit(userPlan);

  const { count: runningScanCount } = await fastify.supabase
    .from("scans")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "running", "normalizing", "ai_enriching"]);

  if ((runningScanCount || 0) >= concurrentLimit) {
    throw fastify.httpErrors.tooManyRequests({
      code: "CONCURRENT_SCAN_LIMIT_REACHED",
      current: runningScanCount,
      limit: concurrentLimit,
      message: `Maximum ${concurrentLimit} concurrent scans allowed for ${userPlan} plan. Currently running: ${runningScanCount}`,
      upgrade_url: "/dashboard/billing",
    });
  }

  // ✅ FIX: Use actual scan profiles with real differences
  const profile = getProfile(normalizedScanType);
  const enabledScanners = profile.enabledScanners;

  // Create scan record
  const { data: scan, error: scanError } = await fastify.supabase
    .from("scans")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      repository_id: repositoryId,
      branch,
      scan_type: normalizedScanType,
      status: "pending",
      progress_percentage: 0,
      progress_stage: "Queued",
      sast_enabled: enabledScanners.sast,
      sca_enabled: enabledScanners.sca,
      secrets_enabled: enabledScanners.secrets,
      iac_enabled: enabledScanners.iac,
      container_enabled: enabledScanners.container,
    })
    .select()
    .single();

  if (scanError || !scan) {
    fastify.log.error({ scanError }, "Failed to create scan");
    throw fastify.httpErrors.internalServerError("Failed to create scan");
  }

  //  Track usage IMMEDIATELY (before enqueue to avoid race)
  await entitlements.trackScanStart(workspaceId, scan.id);
  // Enqueue scan job
  await fastify.jobQueue.enqueue("scans", "process-scan", {
    scanId: scan.id,
    repositoryId,
    workspaceId,
    branch,
    scanType: normalizedScanType,
    enabledScanners,
  });

  fastify.log.info({ scanId: scan.id }, "Scan job enqueued");

  return {
    scan_id: scan.id,
    status: "pending",
    message: "Scan initiated successfully",
  };
}

export async function getScanLogs(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string
): Promise<{
  logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    message: string;
    details: any;
  }>;
}> {
  // Verify scan belongs to user
  const { data: scan } = await fastify.supabase
    .from("scans")
    .select("id")
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!scan) {
    throw fastify.httpErrors.notFound("Scan not found");
  }

  const { data: logs, error } = await fastify.supabase
    .from("scan_logs")
    .select("*")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });

  if (error) {
    fastify.log.error({ error, scanId }, "Failed to fetch scan logs");
    throw fastify.httpErrors.internalServerError("Failed to fetch scan logs");
  }

  return { logs: logs || [] };
}

// Progress is tracked directly in the scans table via progress_percentage and progress_stage fields
// No separate progress events table needed - frontend polls the scan detail endpoint

export async function getScanHistory(
  fastify: FastifyInstance,
  workspaceId: string,
  repositoryId: string,
  page: number,
  limit: number,
  status?: string,
  severity?: string
): Promise<{
  scans: ScanRun[];
  total: number;
  page: number;
  pages: number;
}> {
  const offset = (page - 1) * limit;

  // ✅ TRUST FIX: Build query with filters
  let query = fastify.supabase
    .from("scans")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("repository_id", repositoryId);

  // Apply status filter
  if (status) {
    query = query.eq("status", status);
  }

  // Apply severity filter (scans with any vulnerabilities of that severity)
  if (severity) {
    switch (severity) {
      case "critical":
        query = query.gt("critical_count", 0);
        break;
      case "high":
        query = query.gt("high_count", 0);
        break;
      case "medium":
        query = query.gt("medium_count", 0);
        break;
      case "low":
        query = query.gt("low_count", 0);
        break;
    }
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    fastify.log.error({ error, repositoryId }, "Failed to fetch scan history");
    throw fastify.httpErrors.internalServerError(
      "Failed to fetch scan history"
    );
  }

  return {
    scans: (data as ScanRun[]) || [],
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / limit),
  };
}

export async function getScanStatus(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string
): Promise<{
  scan: ScanRun;
  summary: {
    total_issues: number;
    by_type: {
      sast: number;
      sca: number;
      secrets: number;
      iac: number;
      container: number;
    };
    by_severity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
  };
}> {
  const { data: scan, error: scanError } = await fastify.supabase
    .from("scans")
    .select("*")
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .single();

  if (scanError || !scan) {
    throw fastify.httpErrors.notFound("Scan not found");
  }

  // Count vulnerabilities by type
  const [sastCount, scaCount, secretsCount, iacCount, containerCount] =
    await Promise.all([
      countVulnerabilities(fastify, scanId, "vulnerabilities_sast"),
      countVulnerabilities(fastify, scanId, "vulnerabilities_sca"),
      countVulnerabilities(fastify, scanId, "vulnerabilities_secrets"),
      countVulnerabilities(fastify, scanId, "vulnerabilities_iac"),
      countVulnerabilities(fastify, scanId, "vulnerabilities_container"),
    ]);

  const summary = {
    total_issues: scan.vulnerabilities_found || 0,
    by_type: {
      sast: sastCount,
      sca: scaCount,
      secrets: secretsCount,
      iac: iacCount,
      container: containerCount,
    },
    by_severity: {
      critical: scan.critical_count || 0,
      high: scan.high_count || 0,
      medium: scan.medium_count || 0,
      low: scan.low_count || 0,
      info: scan.info_count || 0,
    },
  };

  return {
    scan: scan as ScanRun,
    summary,
  };
}

export async function exportScanResults(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string,
  format: "json" | "csv" | "pdf"
): Promise<any> {
  const { scan, summary } = await getScanStatus(fastify, workspaceId, scanId);
  // Fetch all vulnerabilities
  const [sast, sca, secrets, iac, container] = await Promise.all([
    getVulnerabilitiesForExport(fastify, scanId, "vulnerabilities_sast"),
    getVulnerabilitiesForExport(fastify, scanId, "vulnerabilities_sca"),
    getVulnerabilitiesForExport(fastify, scanId, "vulnerabilities_secrets"),
    getVulnerabilitiesForExport(fastify, scanId, "vulnerabilities_iac"),
    getVulnerabilitiesForExport(fastify, scanId, "vulnerabilities_container"),
  ]);

  const allVulns = [...sast, ...sca, ...secrets, ...iac, ...container];

  if (format === "json") {
    return {
      scan: {
        id: scan.id,
        repository_id: scan.repository_id,
        branch: scan.branch,
        status: scan.status,
        created_at: scan.created_at,
        completed_at: scan.completed_at,
      },
      summary,
      vulnerabilities: allVulns,
    };
  }

  if (format === "csv") {
    const csv = convertToCSV(allVulns);
    return csv;
  }

  // PDF format would require additional library
  throw fastify.httpErrors.notImplemented("PDF export not yet implemented");
}

export async function cancelScan(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string
): Promise<{ success: boolean; message: string }> {
  const { data: scan, error } = await fastify.supabase
    .from("scans")
    .select("status")
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !scan) {
    throw fastify.httpErrors.notFound("Scan not found");
  }

  if (scan.status === "completed" || scan.status === "failed") {
    throw fastify.httpErrors.badRequest(
      "Cannot cancel completed or failed scan"
    );
  }

  await fastify.supabase
    .from("scans")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", scanId);

  return {
    success: true,
    message: "Scan cancelled successfully",
  };
}

async function countVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  table: string
): Promise<number> {
  const { count } = await fastify.supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("scan_id", scanId);

  return count || 0;
}

async function getVulnerabilitiesForExport(
  fastify: FastifyInstance,
  scanId: string,
  table: string
): Promise<any[]> {
  const { data } = await fastify.supabase
    .from(table)
    .select("*")
    .eq("scan_id", scanId);

  return data || [];
}

function convertToCSV(vulnerabilities: any[]): string {
  if (vulnerabilities.length === 0) return "";

  const headers = [
    "Severity",
    "Type",
    "Title",
    "File",
    "Line",
    "Status",
    "Detected At",
  ];

  const rows = vulnerabilities.map((v) => [
    v.severity,
    v.type,
    v.title,
    v.file_path || v.file || "",
    v.line_start || v.line || "",
    v.status,
    new Date(v.detected_at).toISOString(),
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  return csv;
}

function getConcurrentScanLimit(plan: string): number {
  const limits: Record<string, number> = {
    Free: 5,
    Dev: 3,
    Team: 20,
    Enterprise: 50,
  };
  return limits[plan] || 1;
}
