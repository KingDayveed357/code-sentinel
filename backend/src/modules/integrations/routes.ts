// src/modules/integrations/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import * as githubAppController from "./github-app/controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile, requireWorkspace } from "../../middleware/gatekeepers";
import { resolveWorkspace } from "../../middleware/workspace";

/**
 * Global integration routes (GitHub App callbacks, etc.)
 * Registered at /api/integrations
 */
export async function integrationsGlobalRoutes(fastify: FastifyInstance) {
    /**
     * GitHub App installation endpoint
     * Redirects to GitHub to install the app
     * Query params: workspace_id
     */
    fastify.get<{ Querystring: { workspace_id: string } }>(
        "/github/app/install",
        async (req, reply) => githubAppController.initiateGitHubAppInstall(fastify, req, reply)
    );

    /**
     * GitHub App installation callback
     * Called by GitHub after user installs the app
     */
    fastify.get<{ Querystring: { installation_id: string; setup_action: string; state: string } }>(
        "/github/app/callback",
        async (req, reply) => githubAppController.handleGitHubAppCallback(fastify, req, reply)
    );
}

/**
 * Workspace-scoped integration routes
 * Registered in workspaces module
 */
export async function integrationsWorkspaceRoutes(fastify: FastifyInstance) {
    const preHandler = [
        verifyAuth,
        loadProfile,
        requireAuth,
        requireProfile,
        resolveWorkspace,
        requireWorkspace
    ];

    // GET /api/workspaces/:workspaceId/integrations
    fastify.get(
        "/:workspaceId/integrations",
        { preHandler },
        async (req, reply) => controller.getIntegrationsController(fastify, req as any, reply)
    );

    // POST /api/workspaces/:workspaceId/integrations/github/connect
    fastify.post<{ Body: { provider_token?: string } }>(
        "/:workspaceId/integrations/github/connect",
        { preHandler },
        async (req, reply) => controller.connectGitHubController(fastify, req as any, reply)
    );

    // POST /api/workspaces/:workspaceId/integrations/:provider/disconnect
    fastify.post<{ Params: { workspaceId: string, provider: string } }>(
        "/:workspaceId/integrations/:provider/disconnect",
        { preHandler },
        async (req, reply) => controller.disconnectIntegrationController(fastify, req as any, reply)
    );
}