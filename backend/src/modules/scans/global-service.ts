// src/modules/scans/global-service.ts
// Service layer for workspace-level scan operations

import type { FastifyInstance } from "fastify";

export interface Scan {
  id: string;
  repository_id: string;
  workspace_id: string;
  status: string;
  branch: string;
  commit_hash: string;
  scan_types: string[];
  findings_count: number;
  duration_seconds: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface ScanWithRepository extends Scan {
  repository: {
    id: string;
    name: string;
    full_name: string;
    github_url: string;
  };
}

export interface ScanFilters {
  status?: string;
  repository_id?: string;
  page: number;
  limit: number;
  sort?: "recent" | "oldest" | "duration";
}

export interface PaginatedScansResponse {
  data: ScanWithRepository[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface ScanDetail extends ScanWithRepository {
  scanner_breakdown: {
    sast: { findings: number; status: string; duration_seconds: number | null };
    sca: { findings: number; status: string; duration_seconds: number | null };
    secrets: { findings: number; status: string; duration_seconds: number | null };
    iac: { findings: number; status: string; duration_seconds: number | null };
    container: { findings: number; status: string; duration_seconds: number | null };
  };
  logs: string | null;
  top_vulnerabilities: any[];
}

/**
 * Get all scans for a workspace (global view)
 */
export async function getScansByWorkspace(
  fastify: FastifyInstance,
  workspaceId: string,
  filters: ScanFilters
): Promise<PaginatedScansResponse> {
  const offset = (filters.page - 1) * filters.limit;

  // Build query
  let query = fastify.supabase
    .from("scans")
    .select(
      `
      *,
      repositories:repository_id (
        id,
        name,
        full_name,
        url
      )
    `,
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId);

  // Apply filters
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.repository_id) {
    query = query.eq("repository_id", filters.repository_id);
  }

  // Apply sorting
  switch (filters.sort) {
    case "recent":
      query = query.order("created_at", { ascending: false });
      break;
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "duration":
      query = query.order("duration_seconds", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  // Apply pagination
  query = query.range(offset, offset + filters.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    fastify.log.error({ error, workspaceId, filters }, "Failed to fetch scans");
    throw fastify.httpErrors.internalServerError("Failed to fetch scans");
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / filters.limit);

  // Transform data to match expected format
  const scans: ScanWithRepository[] = (data || []).map((scan: any) => ({
    ...scan,
    repository: Array.isArray(scan.repositories)
      ? scan.repositories[0]
      : scan.repositories,
  }));

  return {
    data: scans,
    meta: {
      current_page: filters.page,
      per_page: filters.limit,
      total,
      total_pages: totalPages,
      has_next: filters.page < totalPages,
      has_prev: filters.page > 1,
    },
  };
}

/**
 * Get single scan details with scanner breakdown
 */
export async function getScanDetails(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string
): Promise<ScanDetail> {
  // Fetch scan with repository
  const { data: scan, error } = await fastify.supabase
    .from("scans")
    .select(
      `
      *,
      repositories:repository_id (
        id,
        name,
        full_name,
        url
      )
    `
    )
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !scan) {
    fastify.log.warn(
      { scanId, workspaceId, errorMessage: error?.message },
      "Scan not found"
    );
    throw fastify.httpErrors.notFound(`Scan not found. ID: ${scanId}`);
  }

  // Get scanner breakdown (count vulnerabilities by type)
  // ✅ CRITICAL FIX: Count UNIQUE vulnerabilities, NOT instances
  // Previous bug: Counted instances, so 1 vulnerability with 100 instances = 100 findings
  // Correct behavior: 1 vulnerability with 100 instances = 1 finding
  // 
  // ✅ DATA INTEGRITY: Query vulnerabilities_unified as source of truth
  // We join vulnerability_instances with vulnerabilities_unified to:
  // 1. Get unique vulnerability IDs for this scan
  // 2. Get the scanner_type from the unified vulnerability (not raw scanner tables)
  // 3. Filter by status (only count OPEN vulnerabilities for accurate scanner results)
  // 4. Ensure consistency with global vulnerabilities list
  // NEVER query raw scanner tables (vulnerabilities_sast, etc.) for user-facing data
  const scannerBreakdown = {
    sast: { findings: 0, status: "completed", duration_seconds: null },
    sca: { findings: 0, status: "completed", duration_seconds: null },
    secrets: { findings: 0, status: "completed", duration_seconds: null },
    iac: { findings: 0, status: "completed", duration_seconds: null },
    container: { findings: 0, status: "completed", duration_seconds: null },
  };

  // ✅ FIX: Get UNIQUE vulnerabilities for this scan (deduplicate by vulnerability_id)
  // Join with vulnerabilities_unified to filter by status and get scanner_type
  const { data: instances } = await fastify.supabase
    .from("vulnerability_instances")
    .select(
      `
      vulnerability_id,
      vulnerabilities_unified!inner (
        id,
        scanner_type,
        status
      )
    `
    )
    .eq("scan_id", scanId);

  if (instances) {
    // ✅ CRITICAL: Deduplicate by vulnerability_id to count unique vulnerabilities
    // Use a Set to track which vulnerabilities we've already counted
    const countedVulnerabilities = new Set<string>();
    
    instances.forEach((instance: any) => {
      const vuln = instance.vulnerabilities_unified;
      const vulnId = vuln?.id;
      
      // Only count each unique vulnerability once, and only if it's open
      if (vuln && vulnId && vuln.status === "open" && !countedVulnerabilities.has(vulnId)) {
        if (vuln.scanner_type in scannerBreakdown) {
          scannerBreakdown[vuln.scanner_type as keyof typeof scannerBreakdown].findings++;
          countedVulnerabilities.add(vulnId);
        }
      }
    });
  }

  // ✅ FIX: Intelligent prioritization for "What Should I Fix First?"
  // Step 1: Get ALL vulnerabilities for this scan with their instances
  // ✅ SOURCE OF TRUTH: Query through vulnerability_instances -> vulnerabilities_unified
  // ✅ CRITICAL: Deduplicate to show unique vulnerabilities with instance counts
  const { data: allVulnsForScan } = await fastify.supabase
    .from("vulnerability_instances")
    .select(
      `
      id,
      vulnerability_id,
      file_path,
      line_start,
      package_name,
      package_version,
      vulnerabilities_unified!inner (
        id,
        title,
        description,
        severity,
        file_path,
        line_start,
        cwe,
        confidence,
        status,
        scanner_type
      )
    `
    )
    .eq("scan_id", scanId);

  // ✅ DEDUPLICATE: Group instances by vulnerability_id to get unique vulnerabilities
  const vulnerabilityMap = new Map<string, any>();
  
  (allVulnsForScan || []).forEach((instance: any) => {
    const vuln = instance.vulnerabilities_unified;
    if (!vuln || vuln.status !== "open") return;
    
    const vulnId = vuln.id;
    if (!vulnerabilityMap.has(vulnId)) {
      // First time seeing this vulnerability - initialize with vulnerability data
      vulnerabilityMap.set(vulnId, {
        ...vuln,
        instance_count: 0,
        instances: [],
      });
    }
    
    // Add this instance to the vulnerability's instances array
    const vulnData = vulnerabilityMap.get(vulnId);
    vulnData.instance_count++;
    vulnData.instances.push({
      id: instance.id,
      file_path: instance.file_path || vuln.file_path,
      line_start: instance.line_start || vuln.line_start,
      package_name: instance.package_name,
      package_version: instance.package_version,
    });
  });

  // Convert map to array of unique vulnerabilities
  const uniqueVulnerabilities = Array.from(vulnerabilityMap.values());

  let topVulnerabilities: any[] = [];

  if (uniqueVulnerabilities.length > 0) {
    // ✅ CASE A: Very few vulnerabilities (1-3 total) - show them all
    if (uniqueVulnerabilities.length <= 3) {
      // Sort by severity (critical > high > medium > low > info)
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      topVulnerabilities = uniqueVulnerabilities
        .sort((a: any, b: any) => {
          const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 5;
          const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 5;
          if (aSev !== bSev) return aSev - bSev;
          // Secondary sort by confidence
          return (b.confidence || 0) - (a.confidence || 0);
        });
    }
    // ✅ CASE B: Many vulnerabilities - prioritize by severity
    else {
      // Sort by severity and confidence
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const sorted = uniqueVulnerabilities.sort((a: any, b: any) => {
        const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 5;
        const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 5;
        if (aSev !== bSev) return aSev - bSev;
        // Secondary sort by confidence
        return (b.confidence || 0) - (a.confidence || 0);
      });

      // Take top 5 highest severity
      topVulnerabilities = sorted.slice(0, 5);
    }
  }

  // Transform scan data
  const scanDetail: ScanDetail = {
    ...scan,
    repository: Array.isArray(scan.repositories)
      ? scan.repositories[0]
      : scan.repositories,
    scanner_breakdown: scannerBreakdown,
    logs: scan.logs || null,
    top_vulnerabilities: topVulnerabilities,
  };

  return scanDetail;
}

/**
 * Get scan statistics for workspace
 */
export async function getScanStats(
  fastify: FastifyInstance,
  workspaceId: string
) {
  const { data: scans } = await fastify.supabase
    .from("scans")
    .select("status")
    .eq("workspace_id", workspaceId);

  const stats = {
    total: scans?.length || 0,
    running: scans?.filter((s) => s.status === "running").length || 0,
    completed: scans?.filter((s) => s.status === "completed").length || 0,
    failed: scans?.filter((s) => s.status === "failed").length || 0,
  };

  return stats;
}
