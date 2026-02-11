
import type { FastifyBaseLogger, FastifyInstance, FastifyTypeProviderDefault, RawServerDefault } from "fastify";
import { IntegrationsRepository } from "../repository";
import { generateInstallationAccessToken } from "../github-app/auth";
import { fetchInstallationRepositories } from "../github-app/data-service";
import type { GitHubRepository } from "./types";
import { IncomingMessage, ServerResponse } from "http";

export interface GitHubAccount {
  username: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
  public_repos: number;
}

export class GitHubService {
  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly fastify: FastifyInstance
  ) {}

  /**
   * Verify GitHub OAuth token
   */
  async verifyToken(token: string): Promise<{
    id: number;
    login: string;
    email: string | null;
    avatar_url: string;
    name: string | null;
  }> {
    if (!token) throw new Error("GitHub token is missing");

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "CodeSentinel/1.0",
      },
    });

    if (!response.ok) {
      throw new Error("Invalid or expired GitHub token");
    }

    const data = await response.json();
    return {
      id: data.id,
      login: data.login,
      email: data.email,
      avatar_url: data.avatar_url,
      name: data.name,
    };
  }

  /**
   * Get GitHub access token for workspace
   */
  async getToken(workspaceId: string): Promise<string> {
    const integration = await this.repository.findByWorkspaceAndProvider(workspaceId, "github");

    if (!integration || !integration.connected) {
      throw this.fastify.httpErrors.preconditionFailed(
        "GitHub integration not connected. Please connect GitHub for this workspace."
      );
    }

    // Personal workspace: OAuth token
    if (integration.type === "oauth") {
      if (!integration.oauth_access_token) {
        throw this.fastify.httpErrors.unauthorized("GitHub OAuth token missing");
      }
      return integration.oauth_access_token;
    }

    // Team workspace: GitHub App
    if (integration.type === "github_app") {
      if (!integration.github_app_installation_id) {
        throw this.fastify.httpErrors.internalServerError("GitHub App installation ID missing");
      }
      return await generateInstallationAccessToken(this.fastify, integration.github_app_installation_id);
    }

    throw this.fastify.httpErrors.internalServerError("Invalid integration type");
  }

  async fetchRepositories(workspaceId: string): Promise<GitHubRepository[]> {
    const integration = await this.repository.findByWorkspaceAndProvider(workspaceId, "github");

    if (!integration || !integration.connected) {
      throw this.fastify.httpErrors.preconditionFailed(
        "GitHub integration not connected. Please connect GitHub for this workspace."
      );
    }

    try {
      if (integration.type === "github_app") {
        if (!integration.github_app_installation_id) {
          throw this.fastify.httpErrors.internalServerError("GitHub App installation ID missing");
        }
        return await fetchInstallationRepositories(this.fastify, integration.github_app_installation_id);
      }

      if (integration.type === "oauth") {
        if (!integration.oauth_access_token) {
          throw this.fastify.httpErrors.unauthorized("GitHub OAuth token missing");
        }

        const response = await fetch(
          "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
          {
            headers: {
              Authorization: `Bearer ${integration.oauth_access_token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "CodeSentinel/1.0",
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
             // Invalidate token
             await this.repository.disconnect(workspaceId, 'github'); // Or just clear token
             throw this.fastify.httpErrors.unauthorized("GitHub token expired. Please reconnect your account.");
          }
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const repos = await response.json();
        return repos.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner.login,
          private: repo.private,
          description: repo.description,
          url: repo.html_url,
          default_branch: repo.default_branch || "main",
          updated_at: repo.updated_at,
          language: repo.language,
          stars: repo.stargazers_count || 0,
          forks: repo.forks_count || 0,
        }));
      }

      throw this.fastify.httpErrors.internalServerError("Invalid integration type");
    } catch (err: any) {
      this.fastify.log.error({ err, workspaceId }, "Failed to fetch GitHub repositories");
      if (err.statusCode) throw err;
      throw this.fastify.httpErrors.internalServerError("Failed to fetch repositories from GitHub");
    }
  }

    /**
   * Check if repositories are already imported
   */
  async markAlreadyImported(
    workspaceId: string,
    repositories: GitHubRepository[]
  ): Promise<(GitHubRepository & { already_imported: boolean })[]> {
    const { data: importedRepos } = await this.fastify.supabase
      .from("repositories")
      .select("full_name")
      .eq("workspace_id", workspaceId)
      .eq("provider", "github")
      .eq("status", "active");

    const importedSet = new Set((importedRepos || []).map((r) => r.full_name));

    return repositories.map((repo) => ({
      ...repo,
      already_imported: importedSet.has(repo.full_name),
    }));
  }

  /**
   * Get GitHub account info for workspace
   */
  async getGitHubAccountInfo(workspaceId: string): Promise<GitHubAccount | null> {
    try {
      const token = await this.getToken(workspaceId);
      const accountData = await this.verifyToken(token);
      
      return {
        username: accountData.login,
        avatar_url: accountData.avatar_url,
        name: accountData.name,
        email: accountData.email,
        public_repos: 0, // Will be populated from actual repos count
      };
    } catch (err) {
      this.fastify.log.warn({ err, workspaceId }, "Failed to fetch GitHub account info");
      return null;
    }
  }
}
