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
  list: async (params?: {
    search?: string;
    provider?: "github" | "gitlab" | "bitbucket";
    private?: boolean;
    status?: 
      | "active" | "inactive" | "error"  // Repository statuses
      | "completed" | "running" | "normalizing" | "ai_enriching" | "failed" | "pending" | "cancelled" | "never_scanned";  // Scan statuses
    page?: number;
    limit?: number;
  }): Promise<ListRepositoriesResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.set("search", params.search);
    if (params?.provider) queryParams.set("provider", params.provider);
    if (params?.private !== undefined) queryParams.set("private", String(params.private));
    if (params?.status) queryParams.set("status", params.status);
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.limit) queryParams.set("limit", String(params.limit));

    const query = queryParams.toString();
    return apiFetch(`/repositories${query ? `?${query}` : ""}`, { requireAuth: true });
  },

  /**
   * Get connected Git providers
   */
  getProviders: async (): Promise<GetProvidersResponse> => {
    return apiFetch("/repositories/providers", { requireAuth: true });
  },

  /**
   * Fetch available GitHub repositories for import
   */
  getGitHubRepos: async (): Promise<GetGitHubReposResponse> => {
    return apiFetch("/repositories/github/repos", { requireAuth: true });
  },

  /**
   * Import selected repositories
   */
  import: async (
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
    return apiFetch("/repositories/import", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ repositories, provider }),
    });
  },

  /**
   * Sync repositories (re-fetch from provider)
   */
  sync: async (): Promise<{ success: boolean; message: string }> => {
    return apiFetch("/repositories/sync", {
      method: "POST",
      requireAuth: true,
    });
  },

  /**
   * Get single repository by ID
   */
  getById: async (id: string): Promise<Repository> => {
    return apiFetch(`/repositories/${id}`, { requireAuth: true });
  },

  /**
   * Update repository settings
   */
  update: async (
    id: string,
    updates: {
      name?: string;
      default_branch?: string;
      status?: "active" | "inactive" | "error";
    }
  ): Promise<Repository> => {
    return apiFetch(`/repositories/${id}`, {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete/disconnect repository
   */
  delete: async (id: string): Promise<{ success: boolean }> => {
    return apiFetch(`/repositories/${id}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },
};