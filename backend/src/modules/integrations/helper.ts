// src/modules/integrations/helper.ts
/**
 * Workspace Integration Helper
 * 
 * CRITICAL: Only creates OAuth integrations for PERSONAL workspaces
 * Team workspaces use GitHub App and are created via explicit installation
 */

import type { FastifyInstance } from 'fastify';

/**
 * Verify GitHub OAuth token with GitHub API
 * 
 * @param token - GitHub access token
 * @returns GitHub user info
 */
export async function verifyGitHubToken(token: string): Promise<{
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
}> {
  if (!token) {
    throw new Error('GitHub token is missing');
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CodeSentinel/1.0',
    },
  });

  if (!response.ok) {
    throw new Error('Invalid or expired GitHub token');
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
 * ✅ CRITICAL INVARIANT ENFORCER
 * 
 * Ensures GitHub OAuth integration exists for PERSONAL workspace if user has completed OAuth.
 * 
 * IMPORTANT: This ONLY creates OAuth integrations for personal workspaces.
 * Team workspaces require explicit GitHub App installation.
 * 
 * This function is idempotent and safe to call multiple times:
 * - If integration exists → no-op
 * - If OAuth token exists but integration doesn't → create OAuth integration
 * - If no OAuth token → no-op
 * - If team workspace → no-op (GitHub App required)
 * 
 * @param fastify - Fastify instance
 * @param userId - User ID who owns the workspace
 * @param workspaceId - Workspace ID where integration should exist
 */
export async function ensureGitHubIntegration(
  fastify: FastifyInstance,
  userId: string,
  workspaceId: string
): Promise<void> {
  try {
    // Step 0: Get workspace type
    const { data: workspace } = await fastify.supabase
      .from('workspaces')
      .select('type')
      .eq('id', workspaceId)
      .single();

    if (!workspace) {
      fastify.log.warn({ userId, workspaceId }, 'Workspace not found');
      return;
    }

    // ✅ CRITICAL: Only handle personal workspaces
    // Team workspaces use GitHub App installation, not OAuth
    if (workspace.type !== 'personal') {
      fastify.log.debug(
        { userId, workspaceId, type: workspace.type },
        'Skipping ensureGitHubIntegration for non-personal workspace'
      );
      return;
    }

    // Step 1: Check if OAuth integration already exists
    const { data: existingIntegration } = await fastify.supabase
      .from('workspace_integrations')
      .select('id, connected, type')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'github')
      .maybeSingle();

    if (existingIntegration?.connected && existingIntegration.type === 'oauth') {
      fastify.log.debug(
        { userId, workspaceId },
        'OAuth integration already exists for personal workspace'
      );
      return;
    }

    // Step 2: Check if user has completed GitHub OAuth
    const { data: authData } = await fastify.supabase.auth.admin.getUserById(userId);
    
    if (!authData || !authData.user) {
      fastify.log.warn({ userId }, 'Failed to get user data');
      return;
    }
    
    const githubToken = authData.user.user_metadata?.github_provider_token as string | undefined;
    
    if (!githubToken) {
      fastify.log.debug(
        { userId, workspaceId },
        'No GitHub OAuth token found - user has not signed in with GitHub'
      );
      return;
    }

    // Step 3: Validate token with GitHub API
    let githubUser;
    try {
      githubUser = await verifyGitHubToken(githubToken);
    } catch (error: any) {
      fastify.log.warn(
        { userId, workspaceId, error: error.message },
        'GitHub token validation failed - will not create OAuth integration'
      );
      
      // Clear invalid token from user metadata
      await fastify.supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...authData.user.user_metadata,
          github_provider_token: null,
        },
      });
      
      return;
    }

    // Step 4: Create OAuth integration for personal workspace (idempotent upsert)
    const { data: integration, error } = await fastify.supabase
      .from('workspace_integrations')
      .upsert(
        {
          workspace_id: workspaceId,
          provider: 'github',
          type: 'oauth', // Personal workspaces use OAuth
          oauth_user_id: githubUser.id,
          oauth_access_token: githubToken,
          account_login: githubUser.login,
          account_avatar_url: githubUser.avatar_url,
          account_email: githubUser.email,
          connected: true,
          metadata: {
            name: githubUser.name,
            github_id: githubUser.id,
          },
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'workspace_id,provider',
        }
      )
      .select()
      .single();

    if (error) {
      fastify.log.error(
        { error, userId, workspaceId },
        'Failed to create OAuth integration for personal workspace'
      );
      throw error;
    }

    fastify.log.info(
      { userId, workspaceId, integrationId: integration.id },
      'OAuth integration created successfully for personal workspace'
    );

    // Step 5: Update user's onboarding state
    const { data: currentUser } = await fastify.supabase
      .from('users')
      .select('onboarding_state')
      .eq('id', userId)
      .single();

    const currentState = currentUser?.onboarding_state || {};
    
    await fastify.supabase
      .from('users')
      .upsert(
        {
          id: userId,
          onboarding_state: {
            ...currentState,
            github_connected: true,
            workspace_created: true,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

  } catch (error) {
    // Log error but don't throw - we don't want to block requests
    fastify.log.error(
      { error, userId, workspaceId },
      'ensureGitHubIntegration failed'
    );
  }
}

/**
 * Get GitHub OAuth token from user metadata
 * 
 * Used for personal workspaces only
 * 
 * @param fastify - Fastify instance
 * @param userId - User ID
 * @returns GitHub access token or null
 */
export async function getGitHubTokenFromMetadata(
  fastify: FastifyInstance,
  userId: string
): Promise<string | null> {
  try {
    const { data: { user } } = await fastify.supabase.auth.admin.getUserById(userId);
    return (user?.user_metadata?.github_provider_token as string) || null;
  } catch (error) {
    fastify.log.error({ error, userId }, 'Failed to get GitHub token from metadata');
    return null;
  }
}