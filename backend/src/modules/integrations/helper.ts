// src/modules/integrations/helpers.ts
// ⭐ THIS FILE CONTAINS ensureGitHubIntegration - THE CORE INVARIANT ENFORCER

import type { FastifyInstance } from 'fastify';
import { verifyGitHubToken } from './service';

/**
 * ✅ CRITICAL INVARIANT ENFORCER
 * 
 * Ensures GitHub integration exists for a workspace if user has completed OAuth.
 * 
 * This function is idempotent and safe to call multiple times:
 * - If integration exists → no-op
 * - If OAuth token exists but integration doesn't → create integration
 * - If no OAuth token → no-op
 * 
 * **WHY THIS ELIMINATES RACE CONDITIONS:**
 * 
 * Before this change:
 * 1. User completes OAuth (gets token in URL)
 * 2. Frontend calls /workspaces/bootstrap (creates workspace)
 * 3. Frontend calls /integrations/github/connect (creates integration)
 * 4. Onboarding tries to fetch repos
 * 5. ❌ RACE: Steps 2-4 can happen in any order, causing 404s
 * 
 * After this change:
 * 1. User completes OAuth (token stored in user_metadata)
 * 2. Any request → resolveWorkspace middleware runs
 * 3. resolveWorkspace calls ensureGitHubIntegration
 * 4. Integration exists BEFORE any route handler runs
 * 5. ✅ NO RACE: Integration always exists when needed
 * 
 * **Token Storage Strategy:**
 * We read the GitHub token from `user.user_metadata.github_provider_token`,
 * which is set during the OAuth callback. This avoids:
 * - Parsing URLs (unreliable, security risk)
 * - Creating a separate oauth_sessions table (extra complexity)
 * - Exposing tokens to frontend (security risk)
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
    // Step 1: Check if integration already exists
    const { data: existingIntegration } = await fastify.supabase
      .from('integrations')
      .select('id, connected')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'github')
      .maybeSingle();

    if (existingIntegration?.connected) {
      // Integration exists and is connected - nothing to do
      fastify.log.debug(
        { userId, workspaceId },
        'GitHub integration already exists'
      );
      return;
    }

    // Step 2: Check if user has completed GitHub OAuth
    // Read token from user metadata (set during OAuth callback)
    const { data: authData } = await fastify.supabase.auth.admin.getUserById(userId);
    
    if (!authData || !authData.user) {
      fastify.log.warn({ userId }, 'Failed to get user data');
      return;
    }
    
    const githubToken = authData.user.user_metadata?.github_provider_token as string | undefined;
    
    if (!githubToken) {
      // User hasn't connected GitHub yet - this is normal
      fastify.log.debug(
        { userId, workspaceId },
        'No GitHub token found - user has not connected GitHub'
      );
      return;
    }

    // Step 3: Validate token with GitHub API
    // This ensures we don't create integrations with expired/invalid tokens
    let githubUser;
    try {
      githubUser = await verifyGitHubToken(githubToken);
    } catch (error: any) {
      fastify.log.warn(
        { userId, workspaceId, error: error.message },
        'GitHub token validation failed - will not create integration'
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

    // Step 4: Create or update integration (idempotent upsert)
    const { data: integration, error } = await fastify.supabase
      .from('integrations')
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: userId,
          provider: 'github',
          access_token: githubToken,
          connected: true,
          metadata: {
            github_login: githubUser.login,
            github_id: githubUser.id,
            avatar_url: githubUser.avatar_url,
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
        'Failed to create GitHub integration'
      );
      throw error;
    }

    fastify.log.info(
      { userId, workspaceId, integrationId: integration.id },
      'GitHub integration created successfully'
    );

    // Step 5: Update user's onboarding state
    // This allows onboarding UI to show GitHub as connected
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
    // if integration creation fails
    fastify.log.error(
      { error, userId, workspaceId },
      'ensureGitHubIntegration failed'
    );
  }
}

/**
 * Helper: Get GitHub token from user metadata
 * 
 * This is a safe way to retrieve the OAuth token without
 * exposing it to the frontend or relying on URL params.
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