// lib/api/scans.ts
// ✅ REFACTORED: Uses global workspace-scoped routes
// No more nested project routes - scans are workspace-level

import { apiFetch } from "@/lib/api";
import { getCurrentSession } from "@/lib/supabase-client";

// TYPES
export interface Scan {
  id: string;
  workspace_id: string;
  repository_id: string;
  branch: string;
  commit_hash: string | null;
  scan_type: "quick" | "full"; 
  status: "pending" | "running" | "normalizing" | "completed" | "failed" | "cancelled";
  vulnerabilities_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  progress_percentage?: number | null; 
  progress_stage?: string | null;
  repository: {
    id: string;
    name: string;
    full_name: string;
    github_url: string;
  };
}

export interface ScanDetail extends Scan {
  scanner_breakdown: {
    sast: { findings: number; duration: number; status: string };
    sca: { findings: number; duration: number; status: string };
    secrets: { findings: number; duration: number; status: string };
    iac: { findings: number; duration: number; status: string };
  };
  top_vulnerabilities: Array<{
    id: string;
    severity: string;
    title: string;
    file_path: string;
    cwe: string | null;
    confidence: number;
    status: string;
  }>;
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
}

export interface ScanStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
}

export interface StartScanResponse {
  scan_id: string;
  status: string;
  message: string;
}

export interface ScanSummary {
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
}

export interface ScanLog {
  id: string;
  created_at: string;
  level: "info" | "warning" | "error";
  message: string;
  details: any;
}

// ============================================================================
// API CLIENT
// ============================================================================

export const scansApi = {
  /**
   * Get all scans for workspace (global view)
   * Route: GET /api/workspaces/:workspaceId/scans
   */
  async getAll(
    workspaceId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      sort?: "recent" | "oldest";
    } = {}
  ): Promise<{
    data: Scan[];
    meta: {
      current_page: number;
      per_page: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  }> {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 15),
    });

    if (params.status) query.append("status", params.status);
    if (params.sort) query.append("sort", params.sort);

    return apiFetch(`/workspaces/${workspaceId}/scans?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Get scan statistics for workspace
   * Route: GET /api/workspaces/:workspaceId/scans/stats
   */
  async getStats(workspaceId: string): Promise<ScanStats> {
    return apiFetch(`/workspaces/${workspaceId}/scans/stats`, {
      requireAuth: true,
    });
  },

  /**
   * Get single scan details
   * Route: GET /api/workspaces/:workspaceId/scans/:scanId
   */
  async getById(workspaceId: string, scanId: string): Promise<ScanDetail> {
    return apiFetch(`/workspaces/${workspaceId}/scans/${scanId}`, {
      requireAuth: true,
    });
  },

  /**
   * Start a new scan (still repository-scoped)
   * Route: POST /api/scans/:repoId/start
   */
  /**
   * Start a new scan (workspace-scoped)
   * Route: POST /api/workspaces/:workspaceId/scans
   */
  async start(
    workspaceId: string,
    repoId: string,
    options: {
      branch?: string;
      scan_type?: "quick" | "full";
    } = {}
  ): Promise<StartScanResponse> {
    return apiFetch(`/workspaces/${workspaceId}/scans`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({
        repositoryId: repoId,
        branch: options.branch || "main",
        scanType: options.scan_type || "full",
      }),
    });
  },

  /**
   * Cancel a running scan
   * Route: POST /api/workspaces/:workspaceId/scans/:scanId/cancel
   */
  async cancel(workspaceId: string, scanId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch(`/workspaces/${workspaceId}/scans/${scanId}/cancel`, {
      method: "POST",
      requireAuth: true,
    });
  },

  /**
   * Export scan results
   * Route: GET /api/workspaces/:workspaceId/scans/:scanId/export
   */
  async exportResults(
    workspaceId: string,
    scanId: string,
    format: "json" | "csv" = "json"
  ): Promise<Blob> {
    const session = await getCurrentSession();

    if (!session?.access_token) {
      throw new Error("Authentication required - please log in again");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/workspaces/${workspaceId}/scans/${scanId}/export?format=${format}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: format === "json" ? "application/json" : "text/csv",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response
        .text()
        .catch(() => `Export failed: ${response.status}`);
      throw new Error(errorText || `Failed to export scan results: ${response.status}`);
    }

    return response.blob();
  },

  /**
   * Get scan status
   * Route: GET /api/workspaces/:workspaceId/scans/:scanId
   */
  async getStatus(workspaceId: string, scanId: string): Promise<{
    scan: Scan;
    summary: ScanSummary;
  }> {
     // Reuse getById as it returns scan details which include status
     const detail = await this.getById(workspaceId, scanId);
     return {
        scan: detail,
        summary: {
            total_issues: detail.vulnerabilities_found,
            by_type: detail.scanner_breakdown ? {
                sast: detail.scanner_breakdown.sast?.findings || 0,
                sca: detail.scanner_breakdown.sca?.findings || 0,
                secrets: detail.scanner_breakdown.secrets?.findings || 0,
                iac: detail.scanner_breakdown.iac?.findings || 0,
                container: 0
            } : { sast:0, sca:0, secrets:0, iac:0, container:0 },
            by_severity: {
                critical: detail.critical_count,
                high: detail.high_count,
                medium: detail.medium_count,
                low: detail.low_count,
                info: detail.info_count
            }
        }
     }
  },

  /**
   * Get scan history for a repository
   * Route: GET /api/workspaces/:workspaceId/scans?repository_id=:repoId
   */
  async getHistory(
    workspaceId: string,
    repoId: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      severity?: string;
    } = {}
  ): Promise<{
    scans: Scan[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = new URLSearchParams({
      repository_id: repoId,
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    if (params.status) query.append("status", params.status);
    if (params.severity) query.append("severity", params.severity);

    const response: any = await apiFetch(`/workspaces/${workspaceId}/scans?${query.toString()}`, {
      requireAuth: true,
    });
    
    return {
        scans: response.data || [],
        total: response.meta?.total || 0,
        page: response.meta?.current_page || 1,
        pages: response.meta?.total_pages || 1
    };
  },

  /**
   * Get scan logs
   * Route: GET /api/workspaces/:workspaceId/scans/:scanId
   */
  async getLogs(workspaceId: string, scanId: string): Promise<{
    logs: Array<{
      id: string;
      created_at: string;
      level: "info" | "warning" | "error";
      message: string;
      details: any;
    }>;
  }> {
    const detail = await this.getById(workspaceId, scanId);
    return {
        logs: (detail.logs || []).map((l: any, i: number) => ({
            id: String(i),
            created_at: l.created_at || l.timestamp,
            level: l.level as "info" | "warning" | "error",
            message: l.message,
            details: null
        }))
    };
  },

};