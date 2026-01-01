// src/modules/integrations/controller.ts
/**
 * Integration Controller - Workspace-Aware
 * 
 * CRITICAL: Personal vs Team workspace integration flows
 * 
 * Personal Workspace:
 * - User signs in with GitHub OAuth during onboarding
 * - OAuth token stored in user metadata
 * - ensureGitHubIntegration creates OAuth integration automatically
 * - POST /connect is NOT used for personal workspaces
 * 
 * Team Workspace:
 * - User manually connects via GitHub App
 * - POST /connect returns GitHub App installation URL
 * - GitHub App callback creates integration
 * - Token generated per-request via GitHub App
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { verifyGitHubToken } from "./helper";
import {
  getWorkspaceIntegrations,
  getWorkspaceIntegration,
  upsertOAuthIntegration,
  upsertGitHubAppIntegration,
  disconnectIntegration,
  toSafeIntegration,
  updateOnboardingState,
  type IntegrationProvider,
} from "./service";
import { env } from "../../env";
import { getGithubAppPrivateKey } from "./github-app/private-key";
/**
 * GET /api/integrations
 * Get all integrations for current workspace
 */
const API_URL = 'http://127.0.0.1:8000/api';

export async function getIntegrationsController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const workspaceId = request.workspace!.id;
  
  const integrations = await getWorkspaceIntegrations(fastify, workspaceId);
  
  // Strip sensitive tokens before sending to client
  const safeIntegrations = integrations.map(toSafeIntegration);
  
  return reply.send({ 
    success: true,
    integrations: safeIntegrations 
  });
}

/**
 * POST /api/integrations/github/connect
 * 
 * WORKSPACE-AWARE BEHAVIOR:
 * 
 * Personal Workspace:
 * - Accepts provider_token from OAuth callback
 * - Creates OAuth integration
 * - Used during onboarding when user signs in with GitHub
 * 
 * Team Workspace:
 * - Returns GitHub App installation URL
 * - User redirects to install GitHub App
 * - Integration created via webhook callback
 */
export async function connectGitHubController(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Body: { provider_token?: string } }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const workspaceId = request.workspace!.id;
  const workspaceType = request.workspace!.type;
  const { provider_token } = request.body || {};

  fastify.log.info({ workspaceId, workspaceType }, 'Connecting GitHub integration');

  // PERSONAL WORKSPACE: OAuth Integration
  if (workspaceType === 'personal') {
    if (!provider_token) {
      throw fastify.httpErrors.badRequest(
        'provider_token required for personal workspace GitHub integration'
      );
    }

    try {
      // 1. Validate token with GitHub API
      fastify.log.info({ userId, workspaceId }, 'Validating GitHub OAuth token');
      const githubUser = await verifyGitHubToken(provider_token);
      
      // 2. Create OAuth integration in workspace
      const integration = await upsertOAuthIntegration(
        fastify, 
        workspaceId, 
        'github',
        {
          oauth_user_id: githubUser.id,
          oauth_access_token: provider_token,
          account_login: githubUser.login,
          account_avatar_url: githubUser.avatar_url,
          account_email: githubUser.email || 'EMAIL_NOT_PUBLIC',
          metadata: {
            name: githubUser.name,
            github_id: githubUser.id,
          },
        }
      );

      // 3. Update user onboarding state
      await updateOnboardingState(fastify, userId, {
        github_connected: true,
        workspace_created: true,
      });

      // 4. Return safe integration (no tokens)
      return reply.send({
        success: true,
        mode: 'oauth',
        integration: toSafeIntegration(integration),
        onboarding_step_completed: 'github_connected',
        message: 'GitHub connected successfully via OAuth',
      });
    } catch (error: any) {
      fastify.log.error({ error, userId, workspaceId }, 'Failed to connect GitHub OAuth');
      
      if (error.message?.includes('Invalid or expired')) {
        throw fastify.httpErrors.unauthorized('GitHub token is invalid or expired');
      }
      
      throw fastify.httpErrors.internalServerError(
        error.message || 'Failed to connect GitHub integration'
      );
    }
  }

  // TEAM WORKSPACE: GitHub App Integration
  if (workspaceType === 'team') {
    // Check if already connected
    const existing = await getWorkspaceIntegration(fastify, workspaceId, 'github');
    
    if (existing?.connected) {
      return reply.send({
        success: true,
        mode: 'github_app',
        status: 'already_connected',
        integration: toSafeIntegration(existing),
        message: 'GitHub App already installed for this workspace',
      });
    }

    // Generate GitHub App installation URL
    const githubAppSlug = env.GITHUB_APP_SLUG;
    if (!githubAppSlug) {
      throw fastify.httpErrors.internalServerError('GitHub App not configured');
    }

    // Redirect to GitHub App install endpoint (which then redirects to GitHub)
    const installUrl = `${API_URL}/integrations/github/app/install?workspace_id=${workspaceId}`;

    return reply.send({
      success: true,
      mode: 'github_app',
      status: 'requires_installation',
      install_url: installUrl,
      message: 'Redirect user to install GitHub App',
    });
  }

  throw fastify.httpErrors.badRequest('Invalid workspace type');
}

/**
 * GET /api/integrations/github/app/callback
 * 
 * GitHub App installation callback
 * Called by GitHub after user installs the app
 * 
 * Query params:
 * - installation_id: GitHub App installation ID
 * - setup_action: 'install' or 'update'
 * - state: workspace_id
 */
export async function githubAppCallbackController(
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
  const { installation_id, setup_action, state: workspaceId } = request.query;

  if (!installation_id || !workspaceId) {
    throw fastify.httpErrors.badRequest('Missing required parameters');
  }

  fastify.log.info(
    { installation_id, workspaceId, setup_action },
    'Processing GitHub App installation'
  );

  try {
    // Verify workspace exists and is a team workspace
    const { data: workspace } = await fastify.supabase
      .from('workspaces')
      .select('id, type')
      .eq('id', workspaceId)
      .single();

    if (!workspace || workspace.type !== 'team') {
      throw fastify.httpErrors.badRequest('Invalid workspace or not a team workspace');
    }

    // Fetch installation details from GitHub (requires GitHub App authentication)
    const installationDetails = await fetchGitHubAppInstallation(
      fastify,
      parseInt(installation_id)
    );

    // Create GitHub App integration
    await upsertGitHubAppIntegration(fastify, workspaceId, {
      installation_id: installationDetails.id,
      account_id: installationDetails.account.id,
      account_login: installationDetails.account.login,
      account_type: installationDetails.account.type as 'User' | 'Organization',
      account_avatar_url: installationDetails.account.avatar_url,
      metadata: {
        app_slug: installationDetails.app_slug,
        target_type: installationDetails.target_type,
        repository_selection: installationDetails.repository_selection,
        created_at: installationDetails.created_at,
      },
    });

    // Redirect to integrations page with success
    const redirectUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?success=true&workspace_id=${workspaceId}`;
    return reply.redirect(redirectUrl);
  } catch (error: any) {
    fastify.log.error({ error, installation_id, workspaceId }, 'GitHub App callback failed');
    
    const errorUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/dashboard/integrations/github?error=installation_failed&workspace_id=${workspaceId}`;
    return reply.redirect(errorUrl);
  }
}

/**
 * POST /api/integrations/:provider/disconnect
 * 
 * Disconnect integration from workspace
 * 
 * Personal workspace + GitHub: Prevents disconnecting if it's the only auth method
 * Team workspace: Just disconnects the integration
 */
export async function disconnectIntegrationController(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply
) {
  const workspaceId = request.workspace!.id;
  const workspaceType = request.workspace!.type;
  const { provider } = request.params;

  // Validate provider
  const validProviders: IntegrationProvider[] = ['github', 'gitlab', 'bitbucket', 'slack'];
  if (!validProviders.includes(provider as IntegrationProvider)) {
    throw fastify.httpErrors.badRequest('Invalid provider');
  }

  // For personal workspaces, prevent disconnecting the only auth method
  if (workspaceType === 'personal' && provider === 'github') {
    const integrations = await getWorkspaceIntegrations(fastify, workspaceId);
    const connectedProviders = integrations.filter(i => i.connected);

    if (connectedProviders.length === 1 && connectedProviders[0].provider === provider) {
      throw fastify.httpErrors.badRequest(
        'Cannot disconnect your only authentication provider. This would lock you out of your account.'
      );
    }
  }

  // Disconnect the integration
  await disconnectIntegration(fastify, workspaceId, provider as IntegrationProvider);

  // For personal workspaces disconnecting GitHub = sign out required
  const requiresSignOut = workspaceType === 'personal' && provider === 'github';

  return reply.send({ 
    success: true, 
    message: `${provider} disconnected successfully`,
    requiresSignOut,
  });
}

/**
 * Helper: Fetch GitHub App installation details
 * 
 * Requires GitHub App JWT authentication
 */
async function fetchGitHubAppInstallation(
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
  target_type: string;
  repository_selection: string;
  created_at: string;
}> {
  const appId = env.GITHUB_APP_ID;
  const privateKey = getGithubAppPrivateKey();

  if (!appId || !privateKey) {
    throw new Error('GitHub App credentials not configured');
  }

  // Generate GitHub App JWT
  const { createAppAuth } = await import('@octokit/auth-app');
  const auth = createAppAuth({
    appId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  });

  const { token: appToken } = await auth({ type: 'app' });

  // Fetch installation details
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CodeSentinel/1.0',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    id: data.id,
    account: {
      id: data.account.id,
      login: data.account.login,
      type: data.account.type,
      avatar_url: data.account.avatar_url,
    },
    app_slug: data.app_slug,
    target_type: data.target_type,
    repository_selection: data.repository_selection,
    created_at: data.created_at,
  };
}