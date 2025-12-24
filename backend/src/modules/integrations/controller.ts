// src/modules/integrations/controller.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { disconnectIntegration, getUserIntegrations, upsertIntegration } from "./service";
import { verifyGitHubToken } from "./service";

/**
 * GET /api/integrations - Get all user integrations
 */
export async function getIntegrationsController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const integrations = await getUserIntegrations(fastify, workspaceId);
    
    return reply.send({ integrations });
}

/**
 * POST /api/integrations/github/connect - Connect GitHub integration
 * 
 * ✅ NEW ENDPOINT: Proper workspace-scoped GitHub integration creation
 * 
 * This is where integration persistence happens (NOT in OAuth callback)
 * 
 * Pre-conditions (enforced by middleware):
 * - User authenticated
 * - User profile loaded
 * - Personal workspace exists (resolveWorkspace)
 * 
 * Body:
 * - provider_token: GitHub access token from OAuth flow
 */
export async function connectGitHubController(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Body: { provider_token: string } }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const workspaceId = request.workspace!.id;
  const { provider_token } = request.body;

  // 1. Validate token with GitHub API
  const githubUser = await verifyGitHubToken(provider_token);
  
  // 2. Upsert integration (idempotent)
  const { data: integration, error } = await fastify.supabase
    .from('integrations')
    .upsert({
      workspace_id: workspaceId,
      provider: 'github',
      access_token: provider_token,
      connected: true,
      metadata: { github_login: githubUser.login },
      connected_at: new Date().toISOString(),
    }, {
      onConflict: 'workspace_id,provider',
    })
    .select()
    .single();

  if (error) {
    throw fastify.httpErrors.internalServerError('Failed to save integration');
  }

  // 3. Update onboarding state
  await fastify.supabase
    .from('users')
    .update({
      onboarding_state: fastify.supabase.rpc('jsonb_set', {
        target: 'onboarding_state',
        path: '{github_connected}',
        value: 'true'
      })
    })
    .eq('id', userId);

  return reply.send({
    success: true,
    integration,
    onboarding_step_completed: 'github_connected',
  });
}
/**
 * POST /api/integrations/:provider/disconnect - Disconnect integration
 */
export async function disconnectIntegrationController(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { provider } = request.params;

    if (!["github", "gitlab", "bitbucket", "slack"].includes(provider)) {
        throw fastify.httpErrors.badRequest("Invalid provider");
    }

    // Check if user has other connected providers
    const integrations = await getUserIntegrations(fastify, workspaceId);
    const connectedProviders = integrations.filter(i => i.connected);

    // Don't allow disconnecting the only provider (would lock user out)
    if (connectedProviders.length === 1 && connectedProviders[0].provider === provider) {
        throw fastify.httpErrors.badRequest(
            "Cannot disconnect your only authentication provider. This would lock you out of your account."
        );
    }

    await disconnectIntegration(fastify, workspaceId, provider as any);

    // If disconnecting GitHub, also sign out the user
    if (provider === "github") {
        fastify.log.info({ workspaceId }, "GitHub disconnected, user will be signed out");
    }

    return reply.send({ 
        success: true, 
        message: `${provider} disconnected successfully`,
        requiresSignOut: provider === "github"
    });
}