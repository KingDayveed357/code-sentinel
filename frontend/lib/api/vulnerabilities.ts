// lib/api/vulnerabilities.ts
// ✅ REFACTORED: Uses global workspace-scoped routes
// No more nested project/scan routes - vulnerabilities are workspace-level

import { apiFetch } from "@/lib/api";

// ============================================================================
// TYPES
// ============================================================================

export interface Vulnerability {
  id: string;
  workspace_id: string;
  repository_id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  scanner_type: "sast" | "sca" | "secrets" | "iac" | "container";
  status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed" | "ignored";
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  rule_id: string;
  cwe: string | null;
  cve: string | null;
  confidence: number;
  first_detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  assigned_to: string | null;
  triage_note: string | null;
  ai_explanation: {
    summary: string;
    why_it_matters: string;
    annotated_code: string | null;
    step_by_step_fix: string[];
    false_positive_indicators: string[];
    generated_at: string;
    model_version: string;
  } | null;
  risk_context: {
    public_facing: boolean;
    auth_required: boolean;
    framework: string | null;
    exploit_likelihood: "high" | "medium" | "low";
  } | null;
  scanner_metadata: any;
}

export interface VulnerabilityDetail extends Vulnerability {
  instances: Array<{
    id: string;
    scan_id: string;
    detected_at: string;
    scan: {
      id: string;
      created_at: string;
      branch: string;
      commit_hash: string;
    };
  }>;
  instance_count: number;
  instances_page?: number;
  instances_total_pages?: number;
  related_issues: Array<{
    id: string;
    title: string;
    severity: string;
  }>;
}

export interface VulnerabilityStats {
  total: number;
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  by_status: {
    open: number;
    in_review: number;
    accepted: number;
    false_positive: number;
    wont_fix: number;
    fixed: number;
    ignored: number;
  };
  by_scanner_type: {
    sast: number;
    sca: number;
    secrets: number;
    iac: number;
    container: number;
  };
  verified_findings: {
    likely_exploitable_percent: number;
    likely_false_positive_percent: number;
  };
}

// ============================================================================
// API CLIENT
// ============================================================================

export const vulnerabilitiesApi = {
  /**
   * Get all vulnerabilities for workspace (global view)
   * Route: GET /api/workspaces/:workspaceId/vulnerabilities
   */
  async getAll(
    workspaceId: string,
    params: {
      page?: number;
      limit?: number;
      severity?: string[];
      status?: string;
      scanner_type?: string;
      assigned_to?: string;
      search?: string;
      sort?: "severity" | "recent" | "oldest" | "confidence";
    } = {}
  ): Promise<{
    data: Vulnerability[];
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

    if (params.severity && params.severity.length > 0) {
      params.severity.forEach((sev) => query.append("severity", sev));
    }
    if (params.status) query.append("status", params.status);
    if (params.scanner_type) query.append("scanner_type", params.scanner_type);
    if (params.assigned_to) query.append("assigned_to", params.assigned_to);
    if (params.search) query.append("search", params.search);
    if (params.sort) query.append("sort", params.sort);

    return apiFetch(`/workspaces/${workspaceId}/vulnerabilities?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Get vulnerability statistics for workspace
   * Route: GET /api/workspaces/:workspaceId/vulnerabilities/stats
   */
  async getStats(workspaceId: string): Promise<VulnerabilityStats> {
    return apiFetch(`/workspaces/${workspaceId}/vulnerabilities/stats`, {
      requireAuth: true,
    });
  },

  /**
   * Get single vulnerability details
   * Route: GET /api/workspaces/:workspaceId/vulnerabilities/:vulnId
   */
  async getById(
    workspaceId: string,
    vulnId: string,
    includes: string[] = ["instances", "ai_explanation", "risk_context", "related_issues"],
    instancesPage: number = 1,
    instancesLimit: number = 20
  ): Promise<VulnerabilityDetail> {
    const query = new URLSearchParams();
    includes.forEach((inc) => query.append("include", inc));
    
    // Add pagination parameters for instances
    if (includes.includes("instances")) {
      query.append("instances_page", String(instancesPage));
      query.append("instances_limit", String(instancesLimit));
    }

    return apiFetch(
      `/workspaces/${workspaceId}/vulnerabilities/${vulnId}?${query}`,
      {
        requireAuth: true,
      }
    );
  },

  /**
   * Update vulnerability status
   * Route: PATCH /api/workspaces/:workspaceId/vulnerabilities/:vulnId/status
   */
  async updateStatus(
    workspaceId: string,
    vulnId: string,
    status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed" | "ignored",
    note?: string
  ): Promise<Vulnerability> {
    return apiFetch(
      `/workspaces/${workspaceId}/vulnerabilities/${vulnId}/status`,
      {
        method: "PATCH",
        requireAuth: true,
        body: JSON.stringify({ status, note }),
      }
    );
  },

  /**
   * Assign vulnerability to user
   * Route: PATCH /api/workspaces/:workspaceId/vulnerabilities/:vulnId/assign
   */
  async assign(
    workspaceId: string,
    vulnId: string,
    assignedTo: string | null
  ): Promise<Vulnerability> {
    return apiFetch(
      `/workspaces/${workspaceId}/vulnerabilities/${vulnId}/assign`,
      {
        method: "PATCH",
        requireAuth: true,
        body: JSON.stringify({ assigned_to: assignedTo }),
      }
    );
  },

  /**
   * Generate or regenerate AI explanation
   * Route: POST /api/workspaces/:workspaceId/vulnerabilities/:vulnId/ai-explain
   */
  async generateAIExplanation(
    workspaceId: string,
    vulnId: string,
    regenerate: boolean = false
  ): Promise<Vulnerability> {
    return apiFetch(
      `/workspaces/${workspaceId}/vulnerabilities/${vulnId}/ai-explain`,
      {
        method: "POST",
        requireAuth: true,
        body: JSON.stringify({ regenerate }),
      }
    );
  },

  /**
   * Get vulnerabilities for a specific scan (filtered view)
   * Route: GET /api/workspaces/:workspaceId/vulnerabilities?scan_id=:scanId
   * Note: This uses the same endpoint with a filter
   */
  /**
   * Get vulnerabilities by scan
   * Route: GET /api/workspaces/:workspaceId/vulnerabilities?scan_id=:scanId
   */
  async getByScan(
    workspaceId: string,
    scanId: string,
    params: {
      page?: number;
      limit?: number;
      severity?: string[];
      status?: string;
    } = {}
  ): Promise<{
    vulnerabilities: Vulnerability[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = new URLSearchParams({
      scan_id: scanId,
      page: String(params.page || 1),
      limit: String(params.limit || 15),
    });

    if (params.severity && params.severity.length > 0) {
      params.severity.forEach((sev) => query.append("severity", sev));
    }
    if (params.status) query.append("status", params.status);

    const response: any = await apiFetch(`/workspaces/${workspaceId}/vulnerabilities?${query}`, {
      requireAuth: true,
    });
    
    // Adapt response to expected interface
    return {
        vulnerabilities: response.data || [],
        total: response.meta?.total || 0,
        page: response.meta?.current_page || 1,
        pages: response.meta?.total_pages || 1
    };
  },

  /**
   * Get vulnerabilities by scan (legacy - for backward compatibility)
   * Route: GET /api/vulnerabilities/scan/:scanId
   * @deprecated Use getByScan() instead
   */
  // async getVulnerabilitiesByScan(
  //   scanId: string,
  //   params: {
  //     severity?: string;
  //     status?: string;
  //     search?: string;
  //     page?: number;
  //     limit?: number;
  //   } = {}
  // ): Promise<{
  //   vulnerabilities: any[];
  //   total: number;
  //   page: number;
  //   pages: number;
  // }> {
  //   const query = new URLSearchParams({
  //     page: String(params.page || 1),
  //     limit: String(params.limit || 100),
  //   });

  //   if (params.severity) query.append("severity", params.severity);
  //   if (params.status) query.append("status", params.status);
  //   if (params.search) query.append("search", params.search);

  //   return apiFetch(`/vulnerabilities/scan/${scanId}?${query}`, {
  //     requireAuth: true,
  //   });
  // },
};