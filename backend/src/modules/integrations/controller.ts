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
import {
  getWorkspaceIntegrations,
  getWorkspaceIntegration,
  connectGitHubOAuth,
  upsertGitHubAppIntegration,
  disconnectIntegration,
  toSafeIntegration,
  type IntegrationProvider,
} from "./service";
import { getInstallationMetadata } from "./github-app/auth";
import { env } from "../../env";

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
      // Use centralized service logic
      const integration = await connectGitHubOAuth(fastify, workspaceId, userId, provider_token);

      // Return safe integration (no tokens)
      return reply.send({
        success: true,
        mode: 'oauth',
        integration: toSafeIntegration(integration),
        onboarding_step_completed: 'github_connected',
        message: 'GitHub connected successfully via OAuth',
      });
    } catch (error: any) {
      fastify.log.error({ error, userId, workspaceId }, 'Failed to connect GitHub OAuth');
      
      if (error.message?.includes('Invalid or expired') || error.statusCode === 401) {
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
