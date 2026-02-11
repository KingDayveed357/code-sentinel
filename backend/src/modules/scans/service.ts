
import type { FastifyInstance } from "fastify";
import { ScansRepository } from "./repository";
import { EntitlementsService } from "../entitlements/service";
import { getProfile } from "../../scanners/scan-profiles";
import type { ScanFilters, ScanDetail, PaginatedScansResponse, ScanWithRepository } from "./types";

export class ScansService {
  constructor(
    private readonly repository: ScansRepository,
    private readonly fastify: FastifyInstance
  ) {}

  async startScan(
    workspaceId: string,
    userId: string,
    userPlan: string,
    repositoryId: string,
    branch: string,
    scanType: "quick" | "full"
  ): Promise<{ scan_id: string; status: string; message: string }> {
    const normalizedScanType = scanType || "full";
    const entitlements = new EntitlementsService(this.fastify);

    // Check monthly limit
    const monthlyLimitCheck = await entitlements.checkMonthlyLimit(workspaceId, userPlan);
    if (!monthlyLimitCheck.allowed) {
      throw this.fastify.httpErrors.forbidden(monthlyLimitCheck.message || 'Monthly scan limit reached');
    }

    // Validate repository
    const { data: repo, error: repoError } = await this.fastify.supabase
      .from("repositories")
      .select("id, full_name, status")
      .eq("id", repositoryId)
      .eq("workspace_id", workspaceId)
      .single();

    if (repoError || !repo) {
      throw this.fastify.httpErrors.notFound("Repository not found");
    }

    if (repo.status !== "active") {
      throw this.fastify.httpErrors.badRequest("Repository is not active");
    }

    // Check concurrent limit
    const concurrentLimit = this.getConcurrentScanLimit(userPlan);
    const runningScanCount = await this.repository.countRunningScans(workspaceId);

    if (runningScanCount >= concurrentLimit) {
      throw this.fastify.httpErrors.tooManyRequests(
        `Maximum ${concurrentLimit} concurrent scans allowed for ${userPlan} plan.`
      );
    }

    // Get profile
    const profile = getProfile(normalizedScanType);
    const enabledScanners = profile.enabledScanners;

    // Create scan record
    const scan = await this.repository.create({
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
    });

    // Track usage & enqueue
    await entitlements.trackScanStart(workspaceId, scan.id);

    await this.fastify.jobQueue.enqueue("scans", "process-scan", {
      scanId: scan.id,
      repositoryId,
      workspaceId,
      branch,
      scanType: normalizedScanType,
      enabledScanners,
    });

    return {
      scan_id: scan.id,
      status: "pending",
      message: "Scan initiated successfully",
    };
  }

  async getScans(workspaceId: string, filters: ScanFilters): Promise<PaginatedScansResponse> {
    const { data, count } = await this.repository.findAll(workspaceId, filters);

    const scans: ScanWithRepository[] = data.map((scan: any) => ({
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
        total: count,
        total_pages: Math.ceil(count / filters.limit),
        has_next: filters.page < Math.ceil(count / filters.limit),
        has_prev: filters.page > 1,
      },
    };
  }

  async getScanDetails(workspaceId: string, scanId: string): Promise<ScanDetail> {
    const scan = await this.repository.findById(scanId, workspaceId);
    if (!scan) {
      throw this.fastify.httpErrors.notFound(`Scan not found. ID: ${scanId}`);
    }

    // Fetch instances and logs
    const instances: any[] = await this.repository.getScanInstances(scanId).catch(() => []);
    const logs = await this.repository.getScanLogs(scanId).catch(() => []);

    // Process Scanner Breakdown
    const scannerBreakdown = {
      sast: { findings: 0, status: scan.sast_enabled ? "completed" : "disabled" },
      sca: { findings: 0, status: scan.sca_enabled ? "completed" : "disabled" },
      secrets: { findings: 0, status: scan.secrets_enabled ? "completed" : "disabled" },
      iac: { findings: 0, status: scan.iac_enabled ? "completed" : "disabled" },
      container: { findings: 0, status: scan.container_enabled ? "completed" : "disabled" },
    };

    const countSet = new Set<string>();
    instances.forEach((inst) => {
      const vuln = inst.vulnerabilities_unified;
      if (vuln && vuln.status === "open" && !countSet.has(vuln.id)) {
        if (vuln.scanner_type in scannerBreakdown) {
          scannerBreakdown[vuln.scanner_type as keyof typeof scannerBreakdown].findings++;
          countSet.add(vuln.id);
        }
      }
    });

    // Process Top Vulnerabilities
    const vulnerabilityMap = new Map<string, any>();
    instances.forEach((inst) => {
      const vuln = inst.vulnerabilities_unified;
      if (!vuln || vuln.status !== "open") return;

      if (!vulnerabilityMap.has(vuln.id)) {
        vulnerabilityMap.set(vuln.id, { ...vuln, instance_count: 0, instances: [] });
      }
      const v = vulnerabilityMap.get(vuln.id);
      v.instance_count++;
      v.instances.push({
        id: inst.id,
        file_path: inst.file_path || vuln.file_path,
        line_start: inst.line_start || vuln.line_start,
        package_name: inst.package_name,
        package_version: inst.package_version,
      });
    });

    const uniqueVulns = Array.from(vulnerabilityMap.values());
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

    uniqueVulns.sort((a, b) => {
      const aSev = severityOrder[a.severity as keyof typeof severityOrder] ?? 5;
      const bSev = severityOrder[b.severity as keyof typeof severityOrder] ?? 5;
      if (aSev !== bSev) return aSev - bSev;
      return (b.confidence || 0) - (a.confidence || 0);
    });

    return {
      ...scan,
      repository: Array.isArray(scan.repositories) ? scan.repositories[0] : scan.repositories,
      scanner_breakdown: scannerBreakdown,
      logs: logs,
      top_vulnerabilities: uniqueVulns.slice(0, 5),
    };
  }

  async getScanStats(workspaceId: string) {
    // This could also be moved to Repository if we want precise counting
    // For now, fetching all status is okay but inefficient for huge tables
    // Optimally: Repo should have countByStatus method
    const { data: scans } = await this.fastify.supabase
      .from("scans")
      .select("status")
      .eq("workspace_id", workspaceId);

    return {
      total: scans?.length || 0,
      running: scans?.filter((s) => s.status === "running").length || 0,
      completed: scans?.filter((s) => s.status === "completed").length || 0,
      failed: scans?.filter((s) => s.status === "failed").length || 0,
    };
  }

  async cancelScan(workspaceId: string, scanId: string): Promise<{ success: boolean; message: string }> {
    const scan = await this.repository.findById(scanId, workspaceId);
    if (!scan) throw this.fastify.httpErrors.notFound("Scan not found");

    if (scan.status === "completed" || scan.status === "failed") {
      throw this.fastify.httpErrors.badRequest("Cannot cancel completed or failed scan");
    }

    await this.repository.updateStatus(scanId, workspaceId, "cancelled", {
      completed_at: new Date().toISOString()
    });

    return { success: true, message: "Scan cancelled successfully" };
  }

  async exportScanResults(
    workspaceId: string,
    scanId: string,
    format: "json" | "csv"
  ): Promise<any> {
    const details = await this.getScanDetails(workspaceId, scanId);
    const instances = await this.repository.getScanInstances(scanId);

    const flatVulns = instances.map((inst) => ({
      ...inst.vulnerabilities_unified,
      file_path: inst.file_path,
      line_start: inst.line_start,
      detected_at: inst.detected_at, // assuming this exists in instances or vuln
    }));

    if (format === "json") {
      return {
        scan: details,
        vulnerabilities: flatVulns,
      };
    }

    if (format === "csv") {
      return this.convertToCSV(flatVulns);
    }
    
    throw this.fastify.httpErrors.badRequest("Invalid format");
  }

  private convertToCSV(vulnerabilities: any[]): string {
    if (vulnerabilities.length === 0) return "";
    const headers = ["Severity", "Type", "Title", "File", "Line", "Status", "Detected At"];
    const rows = vulnerabilities.map((v) => [
      v.severity,
      v.scanner_type,
      v.title,
      v.file_path || "",
      v.line_start || "",
      v.status,
      v.detected_at ? new Date(v.detected_at).toISOString() : "",
    ]);
    return [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell || ""}"`).join(",")),
    ].join("\n");
  }

  private getConcurrentScanLimit(plan: string): number {
    const limits: Record<string, number> = {
      Free: 3,
      Dev: 5,
      Team: 10,
      Enterprise: 50,
    };
    return limits[plan] || 1;
  }
}
