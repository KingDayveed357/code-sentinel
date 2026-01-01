// // src/modules/integrations/github-app/controller.ts
// /**
//  * GitHub App Installation Controllers
//  * 
//  * Handles GitHub App installation flow for team workspaces
//  */

// import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
// import { env } from "../../../env";

// /**
//  * GET /api/integrations/github/app/install
//  * 
//  * Initiates GitHub App installation flow
//  * Redirects user to GitHub to install the app
//  * 
//  * Query params:
//  * - workspace_id: Target team workspace ID
//  */
// export async function initiateGitHubAppInstall(
//   fastify: FastifyInstance,
//   request: FastifyRequest<{
//     Querystring: {
//       workspace_id: string;
//     };
//   }>,
//   reply: FastifyReply
// ) {
//   const { workspace_id } = request.query;

//   if (!workspace_id) {
//     throw fastify.httpErrors.badRequest('workspace_id is required');
//   }

//   // Verify workspace exists and is a team workspace
//   const { data: workspace } = await fastify.supabase
//     .from('workspaces')
//     .select('id, type, name')
//     .eq('id', workspace_id)
//     .single();

//   if (!workspace) {
//     throw fastify.httpErrors.notFound('Workspace not found');
//   }

//   if (workspace.type !== 'team') {
//     throw fastify.httpErrors.badRequest(
//       'GitHub App installation is only available for team workspaces. Personal workspaces use OAuth.'
//     );
//   }

//   // Generate GitHub App installation URL
//   const githubAppSlug = env.GITHUB_APP_SLUG;
//   if (!githubAppSlug) {
//     throw fastify.httpErrors.internalServerError('GitHub App not configured');
//   }

//   // State parameter contains workspace ID for callback
//   const callbackUrl = `${env.NEXT_PUBLIC_FRONTEND_URL}/integrations/github/app/callback`;
//   const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`;
  
//   // Redirect to GitHub App installation page
//   const githubAppUrl = `${installUrl}?state=${workspace_id}`;
  
//   fastify.log.info(
//     { workspace_id, workspace_name: workspace.name },
//     'Redirecting to GitHub App installation'
//   );

//   return reply.redirect(githubAppUrl);
// }

// /**
//  * GET /api/integrations/github/app/callback
//  * 
//  * GitHub App installation callback
//  * Called by GitHub after user installs the app
//  * 
//  * Query params:
//  * - installation_id: GitHub App installation ID
//  * - setup_action: 'install' or 'update'
//  * - state: workspace_id
//  */
// export async function handleGitHubAppCallback(
//   fastify: FastifyInstance,
//   request: FastifyRequest<{
//     Querystring: {
//       installation_id: string;
//       setup_action: string;
//       state: string;
//     };
//   }>,
//   reply: FastifyReply
// ) {
//   const { installation_id, setup_action, state: workspaceId } = request.query;

//   fastify.log.info(
//     { installation_id, workspaceId, setup_action },
//     'Processing GitHub App installation callback'
//   );

//   if (!installation_id || !workspaceId) {
//     const errorUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=missing_params`;
//     return reply.redirect(errorUrl);
//   }

//   try {
//     // Verify workspace exists and is a team workspace
//     const { data: workspace } = await fastify.supabase
//       .from('workspaces')
//       .select('id, type')
//       .eq('id', workspaceId)
//       .single();

//     if (!workspace || workspace.type !== 'team') {
//       const errorUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=invalid_workspace`;
//       return reply.redirect(errorUrl);
//     }

//     // Fetch installation details from GitHub
//     const installationDetails = await fetchGitHubAppInstallation(
//       fastify,
//       parseInt(installation_id)
//     );

//     // Create GitHub App integration
//     const { data: integration, error } = await fastify.supabase
//       .from('workspace_integrations')
//       .upsert(
//         {
//           workspace_id: workspaceId,
//           provider: 'github',
//           type: 'github_app',
//           github_app_installation_id: installationDetails.id,
//           github_app_account_id: installationDetails.account.id,
//           github_app_account_login: installationDetails.account.login,
//           github_app_account_type: installationDetails.account.type,
//           account_login: installationDetails.account.login,
//           account_avatar_url: installationDetails.account.avatar_url,
//           connected: true,
//           metadata: {
//             app_slug: installationDetails.app_slug,
//             target_type: installationDetails.target_type,
//             repository_selection: installationDetails.repository_selection,
//             installed_at: installationDetails.created_at,
//             setup_action,
//           },
//           connected_at: new Date().toISOString(),
//           updated_at: new Date().toISOString(),
//         },
//         { onConflict: 'workspace_id,provider' }
//       )
//       .select()
//       .single();

//     if (error || !integration) {
//       fastify.log.error({ error, workspaceId, installation_id }, 'Failed to save GitHub App integration');
//       const errorUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=save_failed&workspace_id=${workspaceId}`;
//       return reply.redirect(errorUrl);
//     }

//     fastify.log.info(
//       { workspaceId, installation_id, integration_id: integration.id },
//       'GitHub App integration saved successfully'
//     );

//     // Redirect to integrations page with success
//     const successUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?success=true&workspace_id=${workspaceId}`;
//     return reply.redirect(successUrl);
//   } catch (error: any) {
//     fastify.log.error({ error, installation_id, workspaceId }, 'GitHub App callback failed');
    
//     const errorUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=installation_failed&workspace_id=${workspaceId}`;
//     return reply.redirect(errorUrl);
//   }
// }

// /**
//  * Fetch GitHub App installation details
//  * 
//  * Requires GitHub App JWT authentication
//  */
// async function fetchGitHubAppInstallation(
//   fastify: FastifyInstance,
//   installationId: number
// ): Promise<{
//   id: number;
//   account: {
//     id: number;
//     login: string;
//     type: string;
//     avatar_url: string;
//   };
//   app_slug: string;
//   target_type: string;
//   repository_selection: string;
//   created_at: string;
// }> {
//   const appId = process.env.GITHUB_APP_ID;
//   const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

//   if (!appId || !privateKey) {
//     throw new Error('GitHub App credentials not configured');
//   }

//   try {
//     // Generate GitHub App JWT
//     const { createAppAuth } = await import('@octokit/auth-app');
//     const auth = createAppAuth({
//       appId,
//       privateKey: privateKey.replace(/\\n/g, '\n'),
//     });

//     const { token: appToken } = await auth({ type: 'app' });

//     // Fetch installation details
//     const response = await fetch(
//       `https://api.github.com/app/installations/${installationId}`,
//       {
//         headers: {
//           Authorization: `Bearer ${appToken}`,
//           Accept: 'application/vnd.github+json',
//           'User-Agent': 'CodeSentinel/1.0',
//         },
//       }
//     );

//     if (!response.ok) {
//       const errorText = await response.text();
//       fastify.log.error(
//         { status: response.status, error: errorText, installationId },
//         'Failed to fetch GitHub App installation'
//       );
//       throw new Error(`GitHub API error: ${response.status}`);
//     }

//     const data = await response.json();

//     return {
//       id: data.id,
//       account: {
//         id: data.account.id,
//         login: data.account.login,
//         type: data.account.type,
//         avatar_url: data.account.avatar_url,
//       },
//       app_slug: data.app_slug,
//       target_type: data.target_type,
//       repository_selection: data.repository_selection,
//       created_at: data.created_at,
//     };
//   } catch (error) {
//     fastify.log.error({ error, installationId }, 'Failed to fetch GitHub App installation');
    
//     throw error;
//   }
// }





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