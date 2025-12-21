// lib/api/github-issues.ts - GitHub Issues API Client
import { apiFetch } from "../api";

export interface CreateIssueResponse {
  success: boolean;
  issue_url?: string;
  issue_number?: number;
  github_issue_url?: string;
  github_issue_number?: number;

  error?: string;
  message?: string;
}

export interface GitHubIssue {
  id: string;
  vulnerability_id: string;
  vulnerability_type: string;
  github_issue_id: number;
  github_issue_number: number;
  github_issue_url: string;
  title: string;
  issue_status: "open" | "closed";
  created_at: string;
}

export const githubIssuesApi = {
  /**
   * Create GitHub issue for a vulnerability
   */
  createIssue: async (
    vulnerabilityId: string,
    type: "sast" | "sca" | "secrets" | "iac" | "container"
  ): Promise<CreateIssueResponse> => {
    return apiFetch(`/vulnerabilities/${type}/${vulnerabilityId}/create-issue`, {
      method: "POST",
      requireAuth: true,
    });
  },

  /**
   * Get GitHub issues for a scan
   */
  getIssuesForScan: async (scanId: string): Promise<{ issues: GitHubIssue[] }> => {
    return apiFetch(`/github-issues/scan/${scanId}`, {
      requireAuth: true,
    });
  },

  /**
   * Close a GitHub issue
   */
  closeIssue: async (issueId: string): Promise<{ success: boolean }> => {
    return apiFetch(`/github-issues/${issueId}/close`, {
      method: "POST",
      requireAuth: true,
    });
  },
};