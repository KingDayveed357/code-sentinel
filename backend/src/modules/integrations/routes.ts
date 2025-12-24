// src/modules/integrations/routes.ts

import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile } from "../../middleware/gatekeepers";
import { resolveWorkspace } from "../../middleware/workspace";

export default async function integrationsRoutes(fastify: FastifyInstance) {
    // All integration routes require workspace context
    const fullPreHandler = [
        verifyAuth,
        loadProfile,
        requireAuth,
        requireProfile,
        resolveWorkspace, // ✅ CRITICAL: Workspace MUST exist before any integration operations
    ];

    // Get all integrations
    fastify.get(
        "/",
        { preHandler: fullPreHandler },
        async (req, reply) => controller.getIntegrationsController(fastify, req, reply)
    );

    // ✅ NEW: Connect GitHub integration
    // This is where integration creation happens (NOT in OAuth callback)
    fastify.post(
        "/github/connect",
        { preHandler: fullPreHandler },
        async (req, reply) => controller.connectGitHubController(fastify, req, reply)
    );


    // Disconnect integration
    fastify.post(
        "/:provider/disconnect",
        { preHandler: fullPreHandler },
        async (req, reply) => controller.disconnectIntegrationController(fastify, req, reply)
    );
}