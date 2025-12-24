// src/modules/workspaces/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile, requireOnboardingCompleted } from "../../middleware/gatekeepers";

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
}

