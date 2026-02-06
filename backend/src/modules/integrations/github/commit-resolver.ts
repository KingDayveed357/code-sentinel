// src/modules/integrations/github/commit-resolver.ts
import type { FastifyInstance } from "fastify";
import { getWorkspaceIntegration } from "../service";

/**
 * Fetch commit hash for a specific branch
 * Replaces non-existent Supabase RPC function
 */
export async function getCommitHash(
  fastify: FastifyInstance,
  workspaceId: string,
  repoFullName: string,
  branch: string
): Promise<string> {
  const integration = await getWorkspaceIntegration(
    fastify,
    workspaceId,
    "github"
  );

  if (!integration || !integration.connected) {
    fastify.log.warn({ workspaceId, repoFullName }, "GitHub not connected, using 'unknown'");
    return "unknown";
  }

  try {
    const [owner, repo] = repoFullName.split("/");
    
    // Get access token (handles both OAuth and GitHub App)
    let accessToken: string;
    if (integration.type === "oauth") {
      if (!integration.oauth_access_token) {
        throw new Error("OAuth token missing");
      }
      accessToken = integration.oauth_access_token;
    } else if (integration.type === "github_app") {
      // Generate installation token
      const { generateInstallationAccessToken } = await import("../github-app/auth");
      if (!integration.github_app_installation_id) {
        throw new Error("GitHub App installation ID missing");
      }
      accessToken = await generateInstallationAccessToken(
        fastify,
        integration.github_app_installation_id
      );
    } else {
      throw new Error(`Invalid integration type: ${integration.type}`);
    }

    // Fetch branch details from GitHub API
    const authHeader = integration.type === "oauth" 
      ? `Bearer ${accessToken}` 
      : `token ${accessToken}`;
      
    const branchUrl = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`;
    
    const response = await fetch(branchUrl, {
      headers: {
        Authorization: authHeader,
        Accept: "application/vnd.github+json",
        "User-Agent": "CodeSentinel/1.0",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        fastify.log.warn({ repoFullName, branch }, "Branch not found, using 'unknown'");
        return "unknown";
      }
      if (response.status === 401) {
        fastify.log.warn({ repoFullName }, "GitHub token expired, using 'unknown'");
        return "unknown";
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const branchData = await response.json();
    const commitSha = branchData.commit?.sha;

    if (!commitSha) {
      fastify.log.warn({ repoFullName, branch }, "No commit SHA in response, using 'unknown'");
      return "unknown";
    }

    fastify.log.info({ repoFullName, branch, commitSha: commitSha.substring(0, 7) }, "Commit hash resolved");
    return commitSha;
  } catch (error: any) {
    fastify.log.error({ error: error.message, repoFullName, branch }, "Failed to fetch commit hash");
    return "unknown";
  }
}
