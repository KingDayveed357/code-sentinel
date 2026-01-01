// src/modules/integrations/github-app/data-service.ts
/**
 * GitHub App Data Service
 * 
 * Handles all GitHub data operations using installation tokens.
 * 
 * CRITICAL: All data fetching MUST use installation access tokens, never App JWT.
 */

import type { FastifyInstance } from 'fastify';
import { generateInstallationAccessToken } from './auth';

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
 * Fetch repositories accessible by GitHub App installation
 * 
 * WHY: This uses installation token (not App JWT) because:
 * - We're accessing org/user repositories
 * - Installation token is scoped to selected repos
 * - Has proper permissions granted during installation
 * 
 * @param fastify - Fastify instance
 * @param installationId - GitHub App installation ID
 * @returns List of repositories
 */
export async function fetchInstallationRepositories(
  fastify: FastifyInstance,
  installationId: number
): Promise<GitHubRepository[]> {
  // Generate short-lived installation token
  const accessToken = await generateInstallationAccessToken(fastify, installationId);

  try {
    // Fetch repositories using installation token
    const response = await fetch(
      'https://api.github.com/installation/repositories?per_page=100',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'CodeSentinel/1.0',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      fastify.log.error(
        {
          status: response.status,
          error: errorText,
          installationId,
        },
        'Failed to fetch installation repositories'
      );

      if (response.status === 401) {
        throw new Error('Installation token expired or invalid');
      } else if (response.status === 404) {
        throw new Error('Installation not found or was uninstalled');
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const repositories = data.repositories || [];

    fastify.log.info(
      { installationId, count: repositories.length },
      'Fetched installation repositories successfully'
    );

    return repositories.map((repo: any) => ({
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
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
    }));
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    fastify.log.error(
      { error, installationId },
      'Unexpected error fetching installation repositories'
    );
    throw new Error('Failed to fetch repositories from GitHub');
  }
}

/**
 * Fetch organization/user account details
 * 
 * @param fastify - Fastify instance
 * @param installationId - GitHub App installation ID
 * @returns Account details
 */
export async function fetchInstallationAccount(
  fastify: FastifyInstance,
  installationId: number
): Promise<{
  id: number;
  login: string;
  type: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
}> {
  const accessToken = await generateInstallationAccessToken(fastify, installationId);

  try {
    // Fetch authenticated app info to get account
    const response = await fetch('https://api.github.com/installation/repositories', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CodeSentinel/1.0',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    // For now, we get account from installation metadata
    // This is fetched separately because installation token doesn't give us /user
    // TODO: Store account info from installation callback metadata
    
    return {
      id: 0,
      login: 'unknown',
      type: 'Organization',
      avatar_url: '',
      name: null,
      email: null,
    };
  } catch (error) {
    fastify.log.error(
      { error, installationId },
      'Failed to fetch installation account'
    );
    throw error;
  }
}

/**
 * Check if installation token is valid
 * 
 * Useful for verifying installation is still active before operations
 * 
 * @param fastify - Fastify instance
 * @param installationId - Installation ID
 * @returns true if installation is active and accessible
 */
export async function verifyInstallationAccess(
  fastify: FastifyInstance,
  installationId: number
): Promise<boolean> {
  try {
    await generateInstallationAccessToken(fastify, installationId);
    return true;
  } catch (error) {
    fastify.log.warn(
      { error, installationId },
      'Installation verification failed'
    );
    return false;
  }
}