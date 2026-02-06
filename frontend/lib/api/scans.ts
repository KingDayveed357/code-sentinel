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
  async start(
    repoId: string,
    options: {
      branch?: string;
      scan_type?: "quick" | "full"; // ✅ FIX: Removed 'custom'
    } = {}
  ): Promise<StartScanResponse> {
    return apiFetch(`/scans/${repoId}/start`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({
        branch: options.branch || "main",
        scan_type: options.scan_type || "full",
      }),
    });
  },

  /**
   * Cancel a running scan
   * Route: DELETE /api/scans/run/:scanId
   */
  async cancel(scanId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch(`/scans/run/${scanId}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },

  /**
   * Export scan results
   * Route: GET /api/scans/run/:scanId/export
   */
  async exportResults(
    scanId: string,
    format: "json" | "csv" = "json"
  ): Promise<Blob> {
    const session = await getCurrentSession();

    if (!session?.access_token) {
      throw new Error("Authentication required - please log in again");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/scans/run/${scanId}/export?format=${format}`,
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
   * Get scan status (legacy - for backward compatibility)
   * Route: GET /api/scans/run/:scanId
   * @deprecated Use getById() instead
   */
  async getStatus(scanId: string): Promise<{
    scan: Scan;
    summary: ScanSummary;
  }> {
    return apiFetch(`/scans/run/${scanId}`, {
      requireAuth: true,
    });
  },

  /**
   * Get scan history for a repository (legacy - for backward compatibility)
   * Route: GET /api/scans/:repoId/history
   * @deprecated Use getAll() with workspace filter instead
   */
  async getHistory(
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
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    if (params.status) query.append("status", params.status);
    if (params.severity) query.append("severity", params.severity);

    return apiFetch(`/scans/${repoId}/history?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Get scan logs (legacy - for backward compatibility)
   * Route: GET /api/scans/run/:scanId/logs
   * @deprecated Logs are included in getById() response
   */
  async getLogs(scanId: string): Promise<{
    logs: Array<{
      id: string;
      created_at: string;
      level: "info" | "warning" | "error";
      message: string;
      details: any;
    }>;
  }> {
    return apiFetch(`/scans/run/${scanId}/logs`, {
      requireAuth: true,
    });
  },
};