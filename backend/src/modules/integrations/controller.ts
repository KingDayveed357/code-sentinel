// src/modules/integrations/controller.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { disconnectIntegration, getUserIntegrations } from "./service";

/**
 * GET /api/integrations - Get all user integrations
 */
export async function getIntegrationsController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const integrations = await getUserIntegrations(fastify, userId);
    
    return reply.send({ integrations });
}

/**
 * POST /api/integrations/:provider/disconnect - Disconnect integration
 */
export async function disconnectIntegrationController(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Params: { provider: string } }>,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const { provider } = request.params;

    if (!["github", "gitlab", "bitbucket", "slack"].includes(provider)) {
        throw fastify.httpErrors.badRequest("Invalid provider");
    }

    // Check if user has other connected providers
    const integrations = await getUserIntegrations(fastify, userId);
    const connectedProviders = integrations.filter(i => i.connected);

    // Don't allow disconnecting the only provider (would lock user out)
    if (connectedProviders.length === 1 && connectedProviders[0].provider === provider) {
        throw fastify.httpErrors.badRequest(
            "Cannot disconnect your only authentication provider. This would lock you out of your account."
        );
    }

    await disconnectIntegration(fastify, userId, provider as any);

    // If disconnecting GitHub, also sign out the user
    if (provider === "github") {
        fastify.log.info({ userId }, "GitHub disconnected, user will be signed out");
    }

    return reply.send({ 
        success: true, 
        message: `${provider} disconnected successfully`,
        requiresSignOut: provider === "github"
    });
}