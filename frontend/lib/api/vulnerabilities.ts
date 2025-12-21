// lib/api/vulnerabilities.ts - FIXED: Scan-based API calls
import { apiFetch } from "@/lib/api";

export interface VulnerabilitySAST {
  id: string;
  scan_id: string;
  user_id: string;
  repository_id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string | null;
  file_path: string;
  line_start: number | null;
  rule_id: string | null;
  code_snippet: string | null;
  cwe: string | null;
  ai_explanation: string | null;
  ai_patch: string | null;
  ai_remediation: string | null;
  status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed";
  detected_at: string;
  confidence: number | null;
  recommendation: string | null;
  reference: string[] | null;
  ai_risk_score: number | null;
  ai_business_impact: string | null;
}

export interface VulnerabilitySCA {
  id: string;
  scan_id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  package_name: string;
  package_version: string;
  fixed_version: string | null;
  ecosystem: string | null;
  cve: string | null;
  cwe: string[] | null;
  status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed";
  detected_at: string;
  ai_remediation: string | null;
  recommendation: string | null;
  reference: string[] | null;
  confidence: number;
}

export interface VulnerabilitySecrets {
  id: string;
  scan_id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  file_path: string;
  line_start: number | null;
  code_snippet: string | null;
  rule_id: string;
  secret_type: string | null;
  cwe: string[] | null;
  status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed";
  detected_at: string;
  ai_remediation: string | null;
  ai_business_impact: string | null;
  recommendation: string | null;
}

export interface VulnerabilityIaC {
  id: string;
  scan_id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  file_path: string;
  line_start: number | null;
  code_snippet: string | null;
  rule_id: string;
  type?: string | null;
  cwe: string[] | null;
  status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed";
  detected_at: string;
  ai_remediation: string | null;
  recommendation: string | null;
  reference: string[] | null;
}

export interface VulnerabilityContainer {
  id: string;
  scan_id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  image_name: string;
  package_name: string | null;
  installed_version: string | null;
  fixed_version: string | null;
  cve: string | null;
  cwe: string[] | null;
  status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed";
  detected_at: string;
  ai_remediation: string | null;
  recommendation: string | null;
  reference: string[] | null;
}

export type Vulnerability = VulnerabilitySAST | VulnerabilitySCA | VulnerabilitySecrets | VulnerabilityIaC | VulnerabilityContainer;

export const vulnerabilitiesApi = {
  /**
   * Get all vulnerabilities for a scan (across all types)
   */
  async getVulnerabilitiesByScan(
    scanId: string,
    params: {
      severity?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    vulnerabilities: Vulnerability[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 100), // Get all for report page
    });

    if (params.severity) query.append("severity", params.severity);
    if (params.status) query.append("status", params.status);
    if (params.search) query.append("search", params.search);

    return apiFetch(`/vulnerabilities/scan/${scanId}?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Get vulnerabilities by type for a scan
   */
  async getVulnerabilitiesByScanAndType(
    scanId: string,
    type: "sast" | "sca" | "secrets" | "iac" | "container",
    params: {
      severity?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    vulnerabilities: Vulnerability[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 100),
    });

    if (params.severity) query.append("severity", params.severity);
    if (params.status) query.append("status", params.status);
    if (params.search) query.append("search", params.search);

    return apiFetch(`/vulnerabilities/scan/${scanId}/${type}?${query}`, {
      requireAuth: true,
    });
  },

  /**
   * Get single vulnerability details
   */
  async getVulnerabilityDetails(
    id: string,
    type: "sast" | "sca" | "secrets" | "iac" | "container"
  ): Promise<Vulnerability> {
    return apiFetch(`/vulnerabilities/details/${type}/${id}`, {
      requireAuth: true,
    });
  },

  /**
   * Update vulnerability status
   */
  async updateStatus(
    id: string,
    type: "sast" | "sca" | "secrets" | "iac" | "container",
    status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed",
    note?: string
  ): Promise<Vulnerability> {
    return apiFetch(`/vulnerabilities/details/${type}/${id}`, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify({ status, note }),
    });
  },

  /**
   * Get repository-level statistics (all scans)
   */
  async getRepositoryStats(repoId: string): Promise<{
    total: number;
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
  }> {
    return apiFetch(`/vulnerabilities/repository/${repoId}/stats`, {
      requireAuth: true,
    });
  },
};