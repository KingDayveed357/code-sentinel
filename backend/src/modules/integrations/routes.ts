// src/modules/integrations/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import * as githubAppController from "./github-app/controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile } from "../../middleware/gatekeepers";
import { resolveWorkspace } from "../../middleware/workspace";

export default async function integrationsRoutes(fastify: FastifyInstance) {
   
    const fullPreHandler = [
        verifyAuth,
        loadProfile,
        requireAuth,
        requireProfile,
        resolveWorkspace,
    ];

    // Get all integrations for workspace
    fastify.get(
        "/",
        { preHandler: fullPreHandler },
        async (req, reply) => controller.getIntegrationsController(fastify, req, reply)
    );

    /**
     * Connect GitHub integration
     * 
     * Personal workspace: Accepts provider_token and creates OAuth integration
     * Team workspace: Returns GitHub App installation URL
     */
    fastify.post<{ Body: { provider_token?: string } }>(
        "/github/connect",
        { preHandler: fullPreHandler },
        async (req, reply) => controller.connectGitHubController(fastify, req, reply)
    );

    /**
     * GitHub App installation endpoint
     * 
     * Redirects to GitHub to install the app
     * Query params: workspace_id
     */
    fastify.get<{ Querystring: { workspace_id: string } }>(
        "/github/app/install",
        async (req, reply) => githubAppController.initiateGitHubAppInstall(fastify, req, reply)
    );

    /**
     * GitHub App installation callback
     * 
     * Called by GitHub after user installs the app
     * Query params: installation_id, setup_action, state (workspace_id)
     */
    fastify.get<{ Querystring: { installation_id: string; setup_action: string; state: string } }>(
        "/github/app/callback",
        async (req, reply) => githubAppController.handleGitHubAppCallback(fastify, req, reply)
    );

    /**
     * Disconnect integration from workspace
     */
    fastify.post<{ Params: { provider: string; } }>(
        "/:provider/disconnect",
        { preHandler: fullPreHandler },
        async (req, reply) => controller.disconnectIntegrationController(fastify, req, reply)
    );
}