
// src/modules/integrations/github-app/controller.ts
/**
 * GitHub App Installation Controllers (FIXED)
 * 
 * CRITICAL FIXES:
 * 1. Uses secure signed state instead of plain workspace_id
 * 2. Fetches minimal installation metadata (not full details)
 * 3. Stores installation_id immediately without making unnecessary API calls
 * 4. Defers repository fetching until user requests it
 * 5. Proper error handling with user-safe messages
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../../env";
import { generateSecureState, verifySecureState } from "./state";
import { getInstallationMetadata } from "./auth";
import { upsertGitHubAppIntegration } from "../service";

/**
 * GET /api/integrations/github/app/install
 * 
 * Initiates GitHub App installation flow
 * 
 * SECURITY: Uses signed state token instead of plain workspace_id
 */
export async function initiateGitHubAppInstall(
  fastify: FastifyInstance,
  request: FastifyRequest<{
    Querystring: {
      workspace_id: string;
    };
  }>,
  reply: FastifyReply
) {
  const { workspace_id } = request.query;

  if (!workspace_id) {
    throw fastify.httpErrors.badRequest('workspace_id is required');
  }

  // Verify workspace exists and is a team workspace
  const { data: workspace } = await fastify.supabase
    .from('workspaces')
    .select('id, type, name')
    .eq('id', workspace_id)
    .single();

  if (!workspace) {
    throw fastify.httpErrors.notFound('Workspace not found');
  }

  if (workspace.type !== 'team') {
    throw fastify.httpErrors.badRequest(
      'GitHub App installation is only available for team workspaces. Personal workspaces use OAuth.'
    );
  }

  // Generate GitHub App installation URL
  const githubAppSlug = env.GITHUB_APP_SLUG;
  if (!githubAppSlug) {
    throw fastify.httpErrors.internalServerError('GitHub App not configured');
  }

  // ✅ FIX: Generate secure signed state token
  const secureState = generateSecureState(workspace_id);
  
  const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;
  const githubAppUrl = `${installUrl}?state=${encodeURIComponent(secureState)}`;
  
  fastify.log.info(
    { workspace_id, workspace_name: workspace.name },
    'Redirecting to GitHub App installation'
  );

  return reply.redirect(githubAppUrl);
}

/**
 * GET /api/integrations/github/app/callback
 * 
 * GitHub App installation callback (FIXED)
 * 
 * CRITICAL FIXES:
 * 1. Verifies signed state token (prevents tampering)
 * 2. Only fetches minimal installation metadata
 * 3. Stores installation_id immediately
 * 4. Does NOT fetch repositories here (lazy loading)
 * 5. Proper error handling and logging
 */
export async function handleGitHubAppCallback(
  fastify: FastifyInstance,
  request: FastifyRequest<{
    Querystring: {
      installation_id: string;
      setup_action: string;
      state: string;
    };
  }>,
  reply: FastifyReply
) {
  const { installation_id, setup_action, state } = request.query;

  fastify.log.info(
    { installation_id, setup_action },
    'Received GitHub App installation callback'
  );

  if (!installation_id || !state) {
    fastify.log.error(
      { installation_id, state },
      'Missing required callback parameters'
    );
    
    const errorUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=missing_params`;
    return reply.redirect(errorUrl);
  }

  try {
    // ✅ FIX 1: Verify signed state token
    let workspaceId: string;
    try {
      workspaceId = verifySecureState(state);
    } catch (error: any) {
      fastify.log.error(
        { error: error.message, state },
        'State verification failed'
      );
      
      const errorUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=invalid_state`;
      return reply.redirect(errorUrl);
    }

    // Verify workspace exists and is a team workspace
    const { data: workspace, error: workspaceError } = await fastify.supabase
      .from('workspaces')
      .select('id, type, name')
      .eq('id', workspaceId)
      .single();

    if (workspaceError || !workspace) {
      fastify.log.error(
        { error: workspaceError, workspaceId },
        'Failed to fetch workspace'
      );
      
      const errorUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=workspace_not_found`;
      return reply.redirect(errorUrl);
    }

    if (workspace.type !== 'team') {
      fastify.log.error(
        { workspaceId, type: workspace.type },
        'Invalid workspace type for GitHub App'
      );
      
      const errorUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=invalid_workspace`;
      return reply.redirect(errorUrl);
    }

    // ✅ FIX 2: Fetch ONLY basic installation metadata using App JWT
    // This is the ONLY place we need installation details during callback
    const installationMetadata = await getInstallationMetadata(
      fastify,
      parseInt(installation_id)
    );

    fastify.log.info(
      {
        workspaceId,
        workspaceName: workspace.name,
        installationId: installationMetadata.id,
        accountLogin: installationMetadata.account.login,
        accountType: installationMetadata.account.type,
      },
      'Fetched installation metadata'
    );

    // ✅ FIX 3: Store installation immediately (idempotent upsert)
    // No repository fetching here - that happens lazily when user requests it
    await upsertGitHubAppIntegration(fastify, workspaceId, {
      installation_id: installationMetadata.id,
      account_id: installationMetadata.account.id,
      account_login: installationMetadata.account.login,
      account_type: installationMetadata.account.type as 'User' | 'Organization',
      account_avatar_url: installationMetadata.account.avatar_url,
      metadata: {
        app_slug: installationMetadata.app_slug,
        repository_selection: installationMetadata.repository_selection,
        installed_at: installationMetadata.created_at,
        updated_at: installationMetadata.updated_at,
        setup_action,
      },
    });

    fastify.log.info(
      { workspaceId, installationId: installationMetadata.id },
      'GitHub App integration saved successfully'
    );

    // Redirect to integrations page with success
    const successUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?success=true&workspace_id=${workspaceId}`;
    return reply.redirect(successUrl);
  } catch (error: any) {
    // ✅ FIX 4: Proper error handling with specific messages
    fastify.log.error(
      {
        error: error.message,
        stack: error.stack,
        installation_id,
        state,
      },
      'GitHub App callback processing failed'
    );

    // User-safe error messages
    let errorCode = 'installation_failed';
    if (error.message?.includes('not found')) {
      errorCode = 'installation_not_found';
    } else if (error.message?.includes('authentication failed')) {
      errorCode = 'auth_failed';
    } else if (error.message?.includes('uninstalled')) {
      errorCode = 'app_uninstalled';
    }

    const errorUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=${errorCode}`;
    return reply.redirect(errorUrl);
  }
}