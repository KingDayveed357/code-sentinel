// src/modules/onboarding/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile } from "../../middleware/gatekeepers";
import { resolveWorkspace } from "../../middleware/workspace";

export default async function onboardingRoutes(fastify: FastifyInstance) {
    const basePreHandler = [verifyAuth, loadProfile, requireAuth, requireProfile];
    
    // Routes that interact with repos/integrations need workspace context
    const workspacePreHandler = [...basePreHandler, resolveWorkspace];

    // Get onboarding steps (no workspace needed)
    fastify.get("/steps", { preHandler: basePreHandler }, async (req, reply) =>
        controller.getOnboardingStepsController(req, reply)
    );

    // Get onboarding status (needs workspace for repo/integration checks)
    fastify.get("/status", { preHandler: workspacePreHandler }, async (req, reply) =>
        controller.getOnboardingStatusController(req, reply)
    );

    // Fetch GitHub repositories (needs workspace for integration)
    fastify.get("/repositories", { preHandler: workspacePreHandler }, async (req, reply) =>
        controller.getRepositoriesController(req, reply)
    );

    // Save selected repositories (needs workspace for import)
    fastify.post("/repositories", { preHandler: workspacePreHandler }, async (req, reply) =>
        controller.saveRepositoriesController(req, reply)
    );

    // Complete onboarding (no workspace needed - user-level action)
    fastify.post("/complete", { preHandler: basePreHandler }, async (req, reply) =>
        controller.completeOnboardingController(req, reply)
    );
}