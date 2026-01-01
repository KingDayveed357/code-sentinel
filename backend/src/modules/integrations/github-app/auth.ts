// src/modules/integrations/github-app/auth.ts
/**
 * GitHub App Authentication Service
 * 
 * Handles GitHub App JWT generation and installation token management.
 * 
 * CRITICAL: GitHub App has TWO types of authentication:
 * 1. App JWT: Used for app-level operations (list installations, get app info)
 * 2. Installation Token: Used for repository/org/user operations (read repos, create PRs, etc.)
 * 
 * We MUST use installation tokens for all data access operations.
 */

import type { FastifyInstance } from 'fastify';
import { createAppAuth } from '@octokit/auth-app';
import { getGithubAppPrivateKey } from './private-key';
import { env } from '../../../env';

/**
 * Generate GitHub App JWT (for app-level operations only)
 * 
 * DO NOT use this token for installation-scoped operations.
 * App JWTs are only valid for:
 * - Listing installations
 * - Getting app metadata
 * - Creating installation access tokens
 * 
 * @returns App-level JWT token
 */
export async function generateGitHubAppJWT(fastify: FastifyInstance): Promise<string> {
  const appId = env.GITHUB_APP_ID;
  const privateKey = getGithubAppPrivateKey();

  if (!appId || !privateKey) {
    const error = new Error('GitHub App credentials not configured');
    fastify.log.error('Missing GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY_PATH');
    throw error;
  }

  try {
    const auth = createAppAuth({
      appId,
      privateKey,
    });

    const { token } = await auth({ type: 'app' });
    
    fastify.log.debug({ appId }, 'Generated GitHub App JWT successfully');
    return token;
  } catch (error) {
    fastify.log.error({ error, appId }, 'Failed to generate GitHub App JWT');
    throw new Error('Failed to authenticate GitHub App');
  }
}

/**
 * Generate installation access token
 * 
 * CRITICAL: This is the CORRECT token to use for all repository operations.
 * Installation tokens:
 * - Expire after 1 hour (short-lived, more secure)
 * - Are scoped to the installation (org/user + selected repos)
 * - Have the permissions granted during app installation
 * 
 * @param fastify - Fastify instance
 * @param installationId - GitHub App installation ID
 * @returns Installation access token (valid for 1 hour)
 */
export async function generateInstallationAccessToken(
  fastify: FastifyInstance,
  installationId: number
): Promise<string> {
  const appId = env.GITHUB_APP_ID;
  const privateKey = getGithubAppPrivateKey();

  if (!appId || !privateKey) {
    throw new Error('GitHub App credentials not configured');
  }

  try {
    const auth = createAppAuth({
      appId,
      privateKey,
    });

    // This generates a short-lived installation token (1 hour)
    const { token } = await auth({
      type: 'installation',
      installationId,
    });

    fastify.log.debug(
      { installationId },
      'Generated installation access token successfully'
    );

    return token;
  } catch (error: any) {
    fastify.log.error(
      { error, installationId, status: error.status },
      'Failed to generate installation access token'
    );

    // Handle specific GitHub errors
    if (error.status === 404) {
      throw new Error('GitHub App installation not found or was uninstalled');
    } else if (error.status === 401) {
      throw new Error('GitHub App authentication failed - check credentials');
    }

    throw new Error('Failed to generate installation access token');
  }
}

/**
 * Get installation metadata using App JWT
 * 
 * This is one of the RARE cases where App JWT is correct.
 * Used only during installation callback to get basic installation info.
 * 
 * WHY: Installation details endpoint requires App JWT, not installation token.
 * 
 * @param fastify - Fastify instance
 * @param installationId - Installation ID from callback
 * @returns Installation metadata
 */
export async function getInstallationMetadata(
  fastify: FastifyInstance,
  installationId: number
): Promise<{
  id: number;
  account: {
    id: number;
    login: string;
    type: string;
    avatar_url: string;
  };
  app_slug: string;
  repository_selection: 'selected' | 'all';
  created_at: string;
  updated_at: string;
}> {
  const appJWT = await generateGitHubAppJWT(fastify);

  try {
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${appJWT}`,
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
        'Failed to fetch installation metadata from GitHub'
      );

      if (response.status === 404) {
        throw new Error('Installation not found - it may have been uninstalled');
      } else if (response.status === 401) {
        throw new Error('GitHub App authentication failed');
      }

      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();

    fastify.log.info(
      {
        installationId,
        accountLogin: data.account.login,
        accountType: data.account.type,
      },
      'Fetched installation metadata successfully'
    );

    return {
      id: data.id,
      account: {
        id: data.account.id,
        login: data.account.login,
        type: data.account.type,
        avatar_url: data.account.avatar_url,
      },
      app_slug: data.app_slug,
      repository_selection: data.repository_selection,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    
    fastify.log.error({ error, installationId }, 'Unexpected error fetching installation metadata');
    throw new Error('Failed to fetch installation details from GitHub');
  }
}