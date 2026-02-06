// src/modules/workspaces/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile, requireOnboardingCompleted } from "../../middleware/gatekeepers";
import { scansGlobalRoutes } from "../scans/global-routes";
import { vulnerabilitiesUnifiedRoutes } from "../vulnerabilities-unified/routes";

export default async function workspacesRoutes(fastify: FastifyInstance) {
    const preHandler = [
        verifyAuth,
        loadProfile,
        requireAuth,
        requireProfile,
        // requireOnboardingCompleted,
    ];

    /**
     * GET /api/workspaces
     * List all workspaces accessible to the current user
     */
    fastify.get("/", { preHandler }, controller.listWorkspacesController);
    fastify.post('/bootstrap', { preHandler }, (req, reply) => 
        controller.bootstrapWorkspaceController(fastify, req, reply));

    /**
     * Register workspace-scoped routes for scans and vulnerabilities
     * These provide endpoints like:
     * - GET /api/workspaces/:workspaceId/scans
     * - GET /api/workspaces/:workspaceId/vulnerabilities
     */
    fastify.register(scansGlobalRoutes);
    fastify.register(vulnerabilitiesUnifiedRoutes);
}

