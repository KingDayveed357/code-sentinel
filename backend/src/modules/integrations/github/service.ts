// src/modules/integrations/github/service.ts

import type { FastifyInstance } from "fastify";
import { getWorkspaceIntegration } from "../service";
import { generateInstallationAccessToken } from "../github-app/auth";
import { fetchInstallationRepositories } from "../github-app/data-service";
import type { GitHubRepository } from "./types";

export interface GitHubAccount {
  username: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
  public_repos: number;
}

/**
 * Get GitHub access token for workspace (UPDATED)
 *
 * Personal workspace: Returns OAuth token
 * Team workspace: Generates GitHub App installation token
 *
 * @throws {Error} If integration not found or token missing
 */
async function getGitHubToken(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<string> {
  const integration = await getWorkspaceIntegration(
    fastify,
    workspaceId,
    "github"
  );

  if (!integration || !integration.connected) {
    throw fastify.httpErrors.preconditionFailed(
      "GitHub integration not connected. Please connect GitHub for this workspace."
    );
  }

  // Personal workspace: OAuth token
  if (integration.type === "oauth") {
    if (!integration.oauth_access_token) {
      throw fastify.httpErrors.unauthorized("GitHub OAuth token missing");
    }
    return integration.oauth_access_token;
  }

  // ✅ FIX: Team workspace - generate installation token
  if (integration.type === "github_app") {
    if (!integration.github_app_installation_id) {
      throw fastify.httpErrors.internalServerError(
        "GitHub App installation ID missing"
      );
    }

    // Generate short-lived installation token (1 hour)
    return await generateInstallationAccessToken(
      fastify,
      integration.github_app_installation_id
    );
  }

  throw fastify.httpErrors.internalServerError("Invalid integration type");
}

export async function fetchGitHubRepositories(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<GitHubRepository[]> {
  const integration = await getWorkspaceIntegration(
    fastify,
    workspaceId,
    "github"
  );

  if (!integration || !integration.connected) {
    throw fastify.httpErrors.preconditionFailed(
      "GitHub integration not connected. Please connect GitHub for this workspace."
    );
  }

  try {
    // ✅ FIX: Team workspace uses GitHub App data service
    if (integration.type === "github_app") {
      if (!integration.github_app_installation_id) {
        throw fastify.httpErrors.internalServerError(
          "GitHub App installation ID missing"
        );
      }

      // Use dedicated GitHub App repository fetcher
      return await fetchInstallationRepositories(
        fastify,
        integration.github_app_installation_id
      );
    }

    // Personal workspace: OAuth token (unchanged)
    if (integration.type === "oauth") {
      if (!integration.oauth_access_token) {
        throw fastify.httpErrors.unauthorized("GitHub OAuth token missing");
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
          // ✅ FIX: Mark integration as disconnected when token expires
          await fastify.supabase
            .from("workspace_integrations")
            .update({ connected: false, oauth_access_token: null })
            .eq("id", integration.id);

          throw fastify.httpErrors.unauthorized(
            "GitHub token expired. Please reconnect your account."
          );
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

    throw fastify.httpErrors.internalServerError("Invalid integration type");
  } catch (err: any) {
    fastify.log.error(
      { err, workspaceId },
      "Failed to fetch GitHub repositories"
    );

    if (err.statusCode) {
      throw err;
    }

    throw fastify.httpErrors.internalServerError(
      "Failed to fetch repositories from GitHub. Please try again."
    );
  }
}

/**
 * Get GitHub account info for workspace (UPDATED)
 */
export async function getGitHubAccountInfo(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<GitHubAccount> {
  const integration = await getWorkspaceIntegration(
    fastify,
    workspaceId,
    "github"
  );

  if (!integration || !integration.connected) {
    throw fastify.httpErrors.preconditionFailed(
      "GitHub integration not connected"
    );
  }

  // ✅ FIX: Team workspace - use stored account info from integration
  if (integration.type === "github_app") {
    return {
      username: integration.account_login,
      avatar_url: integration.account_avatar_url || "",
      name: integration.github_app_account_login,
      email: null, // GitHub App doesn't expose email
      public_repos: 0, // Not applicable for GitHub App
    };
  }

  // Personal workspace: OAuth (unchanged)
  if (integration.type === "oauth") {
    const accessToken = integration.oauth_access_token;
    if (!accessToken) {
      throw fastify.httpErrors.unauthorized("GitHub OAuth token missing");
    }

    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "CodeSentinel/1.0",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw fastify.httpErrors.unauthorized("GitHub token expired");
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const user = await response.json();

      return {
        username: user.login,
        avatar_url: user.avatar_url,
        name: user.name,
        email: user.email,
        public_repos: user.public_repos || 0,
      };
    } catch (err: any) {
      fastify.log.error(
        { err, workspaceId },
        "Failed to fetch GitHub account info"
      );

      if (err.statusCode) {
        throw err;
      }

      throw fastify.httpErrors.internalServerError(
        "Failed to fetch GitHub account information"
      );
    }
  }

  throw fastify.httpErrors.internalServerError("Invalid integration type");
}

/**
 * Check if repositories are already imported
 */
export async function markAlreadyImported(
  fastify: FastifyInstance,
  workspaceId: string,
  repositories: GitHubRepository[]
): Promise<GitHubRepository[]> {
  const { data: importedRepos } = await fastify.supabase
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
 * Fetch repository contents (UPDATED)
 */
export async function fetchRepositoryCode(
  fastify: FastifyInstance,
  workspaceId: string,
  repoFullName: string,
  branch: string = "main"
): Promise<Array<{ path: string; content: string; language: string | null }>> {
  const integration = await getWorkspaceIntegration(
    fastify,
    workspaceId,
    "github"
  );

  if (!integration || !integration.connected) {
    throw fastify.httpErrors.preconditionFailed(
      "GitHub integration not connected. Please connect GitHub for this workspace."
    );
  }

  const accessToken = await getGitHubToken(fastify, workspaceId);
  const [owner, repo] = repoFullName.split("/");

  // ✅ FIX: Use correct Authorization header format based on token type
  // OAuth tokens use "Bearer", GitHub App tokens use "token"
  const authHeader =
    integration.type === "oauth"
      ? `Bearer ${accessToken}`
      : `token ${accessToken}`;

  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const treeResponse = await fetch(treeUrl, {
    headers: {
      Authorization: authHeader,
      Accept: "application/vnd.github+json",
      "User-Agent": "CodeSentinel/1.0",
    },
  });

  if (!treeResponse.ok) {
    if (treeResponse.status === 401) {
      // ✅ FIX: Mark integration as disconnected when token expires
      await fastify.supabase
        .from("workspace_integrations")
        .update({ connected: false, oauth_access_token: null })
        .eq("id", integration.id);

      throw fastify.httpErrors.unauthorized(
        "GitHub token expired. Please reconnect your account."
      );
    }
    
    // ✅ FIX: Handle empty repository (409 Conflict)
    if (treeResponse.status === 409) {
      throw fastify.httpErrors.preconditionFailed(
        "This repository is empty. Add code or commits before running a security scan."
      );
    }
    
    // ✅ FIX: Handle repository not found or branch not found
    if (treeResponse.status === 404) {
      throw fastify.httpErrors.notFound(
        `Repository or branch '${branch}' not found. Please check the repository exists and the branch name is correct.`
      );
    }
    
    throw new Error(`GitHub API error: ${treeResponse.status}`);
  }

  const treeData = await treeResponse.json();

  const codeExtensions = new Set([
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".java",
    ".go",
    ".rb",
    ".php",
    ".c",
    ".cpp",
    ".cs",
    ".swift",
    ".kt",
    ".rs",
    ".scala",
    ".sql",
    ".sh",
    ".yaml",
    ".yml",
    ".json",
    ".tf",
    ".hcl",
  ]);

  const codeFiles = treeData.tree.filter((item: any) => {
    if (item.type !== "blob") return false;
    if (item.size && item.size > 1024 * 1024) return false;

    const ext = item.path.substring(item.path.lastIndexOf("."));
    return codeExtensions.has(ext);
  });

  const files: Array<{
    path: string;
    content: string;
    language: string | null;
  }> = [];
  const batchSize = 10;

  for (let i = 0; i < codeFiles.length; i += batchSize) {
    const batch = codeFiles.slice(i, i + batchSize);

    const batchPromises = batch.map(async (file: any) => {
      try {
        const contentResponse = await fetch(file.url, {
          headers: {
            Authorization: authHeader,
            Accept: "application/vnd.github.v3.raw",
            "User-Agent": "CodeSentinel/1.0",
          },
        });

        if (!contentResponse.ok) {
          if (contentResponse.status === 401) {
            // ✅ FIX: Mark integration as disconnected when token expires
            await fastify.supabase
              .from("workspace_integrations")
              .update({ connected: false, oauth_access_token: null })
              .eq("id", integration.id);

            throw fastify.httpErrors.unauthorized(
              "GitHub token expired. Please reconnect your account."
            );
          }
          fastify.log.warn(
            { path: file.path, status: contentResponse.status },
            "Failed to fetch file"
          );
          return null;
        }

        const content = await contentResponse.text();
        const language = detectLanguage(file.path);

        return { path: file.path, content, language };
      } catch (err) {
        fastify.log.error({ err, path: file.path }, "Error fetching file");
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    files.push(...(batchResults.filter((f) => f !== null) as any[]));
  }

  return files;
}

function detectLanguage(filePath: string): string | null {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  const languageMap: Record<string, string> = {
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".java": "java",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".rs": "rust",
    ".scala": "scala",
    ".sql": "sql",
    ".sh": "bash",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".tf": "terraform",
    ".hcl": "terraform",
  };

  return languageMap[ext] || null;
}
