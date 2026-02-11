// src/modules/repositories/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { resolveWorkspace } from "../../middleware/workspace";
import { requireAuth, requireProfile, requireOnboardingCompleted, requireWorkspace } from "../../middleware/gatekeepers";

export default async function repositoriesWorkspaceRoutes(fastify: FastifyInstance) {
    // Apply workspace middleware stack to all routes in this context
    fastify.addHook("preHandler", verifyAuth);
    fastify.addHook("preHandler", loadProfile);
    fastify.addHook("preHandler", requireAuth);
    fastify.addHook("preHandler", requireProfile);
    // fastify.addHook("preHandler", requireOnboardingCompleted); // Optional, depending on if we want strict onboarding
    fastify.addHook("preHandler", resolveWorkspace);
    fastify.addHook("preHandler", requireWorkspace);

    /**
     * GET /:workspaceId/repositories
     * List all repositories with pagination, search, and filters
     */
    fastify.get("/:workspaceId/repositories", async (req, reply) =>
        controller.listRepositoriesController(req, reply)
    );

    /**
     * GET /:workspaceId/repositories/providers
     * Get connected Git providers
     */
    fastify.get("/:workspaceId/repositories/providers", async (req, reply) =>
        controller.getProvidersController(req, reply)
    );

    /**
     * GET /:workspaceId/repositories/github/repos
     * Fetch available GitHub repositories for import
     */
    fastify.get("/:workspaceId/repositories/github/repos", async (req, reply) =>
        controller.getGitHubReposController(req, reply)
    );

    /**
     * POST /:workspaceId/repositories/import
     * Import selected repositories
     */
    fastify.post("/:workspaceId/repositories/import", async (req, reply) =>
        controller.importRepositoriesController(req, reply)
    );

    /**
     * POST /:workspaceId/repositories/sync
     * Re-sync repositories from GitHub
     */
    fastify.post("/:workspaceId/repositories/sync", async (req, reply) =>
        controller.syncRepositoriesController(req, reply)
    );

    /**
     * GET /:workspaceId/repositories/:id
     * Get single repository details
     */
    fastify.get("/:workspaceId/repositories/:id", async (req, reply) =>
        controller.getRepositoryController(req, reply)
    );

    /**
     * PATCH /:workspaceId/repositories/:id
     * Update repository settings
     */
    fastify.patch("/:workspaceId/repositories/:id", async (req, reply) =>
        controller.updateRepositoryController(req, reply)
    );

    /**
     * DELETE /:workspaceId/repositories/:id
     * Delete/disconnect repository
     */
    fastify.delete("/:workspaceId/repositories/:id", async (req, reply) =>
        controller.deleteRepositoryController(req, reply)
    );

     // ==========================================
    // NEW: Repository Settings & Webhook Routes
    // ==========================================

    /**
     * GET /:workspaceId/repositories/:id/settings
     * Get repository auto-scan settings and webhook status
     */
    fastify.get("/:workspaceId/repositories/:id/settings", controller.getRepositorySettingsController);

    /**
     * PATCH /:workspaceId/repositories/:id/settings
     * Update repository auto-scan settings
     */
    fastify.patch("/:workspaceId/repositories/:id/settings", controller.updateRepositorySettingsController);

    /**
     * POST /:workspaceId/repositories/:id/webhook/register
     * Register GitHub webhook for repository
     */
    fastify.post("/:workspaceId/repositories/:id/webhook/register", controller.registerWebhookController);

    /**
     * DELETE /:workspaceId/repositories/:id/webhook
     * Delete GitHub webhook for repository
     */
    fastify.delete("/:workspaceId/repositories/:id/webhook", controller.deleteWebhookController);
}