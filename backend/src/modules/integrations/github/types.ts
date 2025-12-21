// src/modules/shared/github/types.ts

/**
 * Repository from GitHub API
 */
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
}

/**
 * Minimal repo info for import
 */
export interface RepositoryImportInput {
    name: string;
    full_name: string;
    owner: string;
    private: boolean;
    url: string;
    default_branch?: string;
    description?: string | null;
}

/**
 * Database repository record
 */
export interface DatabaseRepository {
    id: string;
    user_id: string;
    team_id: string | null;
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
}