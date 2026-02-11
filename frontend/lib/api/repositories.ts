// lib/api/repositories.ts
import { apiFetch } from "../api";

export interface Repository {
  id: string;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  url: string;
  default_branch: string;
  provider: "github" | "gitlab" | "bitbucket";
  status: "active" | "inactive" | "error";
  last_scan: string | null;
  created_at: string;
  updated_at: string;
  github_url?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  description: string | null;
  url: string;
  default_branch: string;
  updated_at: string;
  language: string | null;
  stars: number;
  forks: number;
  already_imported?: boolean;
}

export interface GitHubAccount {
  username: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
  public_repos: number;
}

export interface Provider {
  id: string;
  name: string;
  connected: boolean;
  connected_at?: string | null;
  coming_soon?: boolean;
  account?: GitHubAccount | null;
}

export interface RepositorySettings {
  auto_scan_enabled: boolean;
  scan_on_push: boolean;
  scan_on_pr: boolean;
  branch_filter: string[];
  excluded_branches: string[];
  default_scan_type: "quick" | "full";
  auto_create_issues: boolean;
  issue_severity_threshold: "critical" | "high" | "medium" | "low";
  issue_labels: string[];
  issue_assignees: string[];
}

export interface WebhookInfo {
  github_webhook_id: string | null;
  last_delivery_status: string | null;
  failure_count: number;
}

export interface RepositorySettingsResponse {
  settings: RepositorySettings;
  webhook_status: "active" | "inactive" | "failed" | null;
  webhook_info: WebhookInfo | null;
}

export interface ListRepositoriesResponse {
  repositories: Repository[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  pages: number;
}

export interface GetProvidersResponse {
  providers: Provider[];
}

export interface GetGitHubReposResponse {
  repositories: GitHubRepository[];
  total: number;
  already_imported: number;
}

export interface ImportRepositoriesResponse {
  success: boolean;
  imported: number;
  skipped: number;
  limit_reached: boolean;
  repository_count: number;
  limit: number;
  unlimited: boolean;
}

export const repositoriesApi = {
  /**
   * List repositories with filters and pagination
   */
  list: async (
    workspaceId: string,
    params?: {
      search?: string;
      provider?: "github" | "gitlab" | "bitbucket";
      private?: boolean;
      status?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<ListRepositoriesResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.set("search", params.search);
    if (params?.provider) queryParams.set("provider", params.provider);
    if (params?.private !== undefined) queryParams.set("private", String(params.private));
    if (params?.status) queryParams.set("status", params.status);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.limit) queryParams.set("limit", String(params.limit));

    const query = queryParams.toString();
    return apiFetch(`/workspaces/${workspaceId}/repositories${query ? `?${query}` : ""}`, { 
      requireAuth: true 
    });
  },

  /**
   * Get connected Git providers
   */
  getProviders: async (workspaceId: string): Promise<GetProvidersResponse> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/providers`, { 
      requireAuth: true 
    });
  },

  /**
   * Fetch available GitHub repositories for import
   */
  getGitHubRepos: async (workspaceId: string): Promise<GetGitHubReposResponse> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/github/repos`, { 
      requireAuth: true 
    });
  },

  /**
   * Import selected repositories
   */
  import: async (
    workspaceId: string,
    repositories: Array<{
      name: string;
      full_name: string;
      owner: string;
      private: boolean;
      url: string;
      default_branch?: string;
      description?: string | null;
    }>,
    provider: "github" | "gitlab" | "bitbucket" = "github"
  ): Promise<ImportRepositoriesResponse> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/import`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ repositories, provider }),
    });
  },

  /**
   * Sync repositories (re-fetch from provider)
   */
  sync: async (workspaceId: string): Promise<{ success: boolean; message: string }> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/sync`, {
      method: "POST",
      requireAuth: true,
    });
  },

  /**
   * Get single repository by ID
   */
  getById: async (workspaceId: string, id: string): Promise<Repository> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}`, { 
      requireAuth: true 
    });
  },

  /**
   * Update repository settings
   */
  update: async (
    workspaceId: string,
    id: string,
    updates: {
      name?: string;
      default_branch?: string;
      status?: "active" | "inactive" | "error";
    }
  ): Promise<Repository> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}`, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete/disconnect repository
   */
  delete: async (workspaceId: string, id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },

  /**
   * Get repository settings and webhook status
   */
  getSettings: async (
    workspaceId: string,
    id: string
  ): Promise<RepositorySettingsResponse> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}/settings`, {
      requireAuth: true,
    });
  },

  /**
   * Update repository settings (auto-scan, webhooks, etc.)
   */
  updateSettings: async (
    workspaceId: string,
    id: string,
    settings: Partial<RepositorySettings>
  ): Promise<{ success: boolean; settings: RepositorySettings }> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}/settings`, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(settings),
    });
  },

  /**
   * Register GitHub webhook for repository
   */
  registerWebhook: async (
    workspaceId: string,
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}/webhook/register`, {
      method: "POST",
      requireAuth: true,
    });
  },

  /**
   * Delete GitHub webhook for repository
   */
  deleteWebhook: async (
    workspaceId: string,
    id: string
  ): Promise<{ success: boolean }> => {
    return apiFetch(`/workspaces/${workspaceId}/repositories/${id}/webhook`, {
      method: "DELETE",
      requireAuth: true,
    });
  },
};