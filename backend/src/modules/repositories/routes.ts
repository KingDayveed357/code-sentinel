// src/modules/repositories/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { resolveWorkspace } from "../../middleware/workspace";
import { requireAuth, requireProfile, requireOnboardingCompleted } from "../../middleware/gatekeepers";

export default async function repositoriesRoutes(fastify: FastifyInstance) {
    // All routes require auth, profile, and completed onboarding
    const preHandler = [
        verifyAuth,
        loadProfile,
        requireAuth,
        requireProfile,
        requireOnboardingCompleted,
        resolveWorkspace
    ];

    /**
     * GET /repositories
     * List all repositories with pagination, search, and filters
     */
    fastify.get("/", { preHandler }, async (req, reply) =>
        controller.listRepositoriesController(req, reply)
    );

    /**
     * GET /repositories/providers
     * Get connected Git providers
     */
    fastify.get("/providers", { preHandler }, async (req, reply) =>
        controller.getProvidersController(req, reply)
    );

    /**
     * GET /repositories/github/repos
     * Fetch available GitHub repositories for import
     */
    fastify.get("/github/repos", { preHandler }, async (req, reply) =>
        controller.getGitHubReposController(req, reply)
    );

    /**
     * POST /repositories/import
     * Import selected repositories
     */
    fastify.post("/import", { preHandler }, async (req, reply) =>
        controller.importRepositoriesController(req, reply)
    );

    /**
     * POST /repositories/sync
     * Re-sync repositories from GitHub
     */
    fastify.post("/sync", { preHandler }, async (req, reply) =>
        controller.syncRepositoriesController(req, reply)
    );

    /**
     * GET /repositories/:id
     * Get single repository details
     */
    fastify.get("/:id", { preHandler }, async (req, reply) =>
        controller.getRepositoryController(req, reply)
    );

    /**
     * PATCH /repositories/:id
     * Update repository settings
     */
    fastify.patch("/:id", { preHandler }, async (req, reply) =>
        controller.updateRepositoryController(req, reply)
    );

    /**
     * DELETE /repositories/:id
     * Delete/disconnect repository
     */
    fastify.delete("/:id", { preHandler }, async (req, reply) =>
        controller.deleteRepositoryController(req, reply)
    );

     // ==========================================
    // NEW: Repository Settings & Webhook Routes
    // ==========================================

    /**
     * GET /repositories/:id/settings
     * Get repository auto-scan settings and webhook status
     */
    fastify.get("/:id/settings", { preHandler }, controller.getRepositorySettingsController);

    /**
     * PATCH /repositories/:id/settings
     * Update repository auto-scan settings
     */
    fastify.patch("/:id/settings", { preHandler }, controller.updateRepositorySettingsController);

    /**
     * POST /repositories/:id/webhook/register
     * Register GitHub webhook for repository
     */
    fastify.post("/:id/webhook/register", { preHandler }, controller.registerWebhookController);

    /**
     * DELETE /repositories/:id/webhook
     * Delete GitHub webhook for repository
     */
    fastify.delete("/:id/webhook", { preHandler }, controller.deleteWebhookController);
}