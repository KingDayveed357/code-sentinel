// src/modules/integrations/github/service.ts

import type { FastifyInstance } from 'fastify';
import { getIntegration } from "../service"

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
 * Fetch GitHub repositories
 * 
 * ✅ FIXED: Missing integration is now 412 Precondition Failed (product state)
 * 
 * @param workspaceId - Workspace ID for fetching integration token
 */
export async function fetchGitHubRepositories(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<GitHubRepository[]> {
  const integration = await getIntegration(fastify, workspaceId, 'github');

  // ✅ CRITICAL FIX: Missing GitHub integration is NOT an auth error
  // It's a product state - user needs to connect GitHub first
  if (!integration || !integration.access_token) {
    throw fastify.httpErrors.preconditionFailed(
      'GitHub integration not connected. Please connect your GitHub account first.'
    );
  }

  if (!integration.connected) {
    throw fastify.httpErrors.preconditionFailed(
      'GitHub integration disconnected. Please reconnect your account.'
    );
  }

  try {
    const response = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator',
      {
        headers: {
          Authorization: `token ${integration.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired - this IS an auth error
        throw fastify.httpErrors.unauthorized(
          'GitHub token expired. Please reconnect your account.'
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
      default_branch: repo.default_branch || 'main',
      updated_at: repo.updated_at,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
    }));
  } catch (err: any) {
    fastify.log.error({ err, workspaceId }, 'Failed to fetch GitHub repositories');

    if (err.statusCode) {
      throw err;
    }

    throw fastify.httpErrors.internalServerError(
      'Failed to fetch repositories from GitHub. Please try again.'
    );
  }
}

/**
 * Get GitHub account info
 * @param workspaceId - Workspace ID for fetching integration token
 */
export async function getGitHubAccountInfo(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<{
  username: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
  public_repos: number;
}> {
  const integration = await getIntegration(fastify, workspaceId, 'github');

  if (!integration || !integration.access_token) {
    throw fastify.httpErrors.preconditionFailed('GitHub integration not connected');
  }

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${integration.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const user = await response.json();

    return {
      username: user.login,
      avatar_url: user.avatar_url,
      name: user.name,
      email: user.email,
      public_repos: user.public_repos,
    };
  } catch (err) {
    fastify.log.error({ err, workspaceId }, 'Failed to fetch GitHub account info');
    throw fastify.httpErrors.internalServerError(
      'Failed to fetch GitHub account information'
    );
  }
}

/**
 * Fetch repository code from GitHub
 */
export interface RepoFile {
  path: string;
  content: string;
  language: string | null;
}

/**
 * Fetch repository code from GitHub
 * @param workspaceId - Workspace ID for fetching integration token
 */
export async function fetchRepositoryCode(
  fastify: FastifyInstance,
  workspaceId: string,
  repoFullName: string,
  branch: string = 'main'
): Promise<RepoFile[]> {
  const integration = await getIntegration(fastify, workspaceId, 'github');

  if (!integration || !integration.access_token) {
    throw new Error('GitHub integration not found');
  }

  const token = integration.access_token;
  const [owner, repo] = repoFullName.split('/');

  // Fetch repository tree
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

  const treeResponse = await fetch(treeUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!treeResponse.ok) {
    throw new Error(`GitHub API error: ${treeResponse.status}`);
  }

  const treeData = await treeResponse.json();

  // Filter only code files
  const codeExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.php',
    '.c', '.cpp', '.cs', '.swift', '.kt', '.rs', '.scala', '.sql',
    '.sh', '.yaml', '.yml', '.json', '.tf', '.hcl',
  ]);

  const codeFiles = treeData.tree.filter((item: any) => {
    if (item.type !== 'blob') return false;
    
    // Exclude large files (>1MB)
    if (item.size && item.size > 1024 * 1024) return false;
    
    const ext = item.path.substring(item.path.lastIndexOf('.'));
    return codeExtensions.has(ext);
  });

  // Fetch file contents in batches
  const files: RepoFile[] = [];
  const batchSize = 10;

  for (let i = 0; i < codeFiles.length; i += batchSize) {
    const batch = codeFiles.slice(i, i + batchSize);

    const batchPromises = batch.map(async (file: any) => {
      try {
        const contentResponse = await fetch(file.url, {
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3.raw',
          },
        });

        if (!contentResponse.ok) {
          fastify.log.warn({ path: file.path }, 'Failed to fetch file');
          return null;
        }

        const content = await contentResponse.text();
        const language = detectLanguage(file.path);

        return { path: file.path, content, language };
      } catch (err) {
        fastify.log.error({ err, path: file.path }, 'Error fetching file');
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    files.push(...(batchResults.filter((f) => f !== null) as RepoFile[]));
  }

  return files;
}

function detectLanguage(filePath: string): string | null {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  const languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rb': 'ruby',
    '.php': 'php',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.rs': 'rust',
    '.scala': 'scala',
    '.sql': 'sql',
    '.sh': 'bash',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.tf': 'terraform',
    '.hcl': 'terraform',
  };

  return languageMap[ext] || null;
}