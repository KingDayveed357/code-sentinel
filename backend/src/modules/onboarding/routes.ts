// src/modules/onboarding/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile } from "../../middleware/gatekeepers";

export default async function onboardingRoutes(fastify: FastifyInstance) {
    const preHandler = [verifyAuth, loadProfile, requireAuth, requireProfile];

    // Get onboarding steps
    fastify.get("/steps", { preHandler }, async (req, reply) =>
        controller.getOnboardingStepsController(req, reply)
    );

    // Get onboarding status
    fastify.get("/status", { preHandler }, async (req, reply) =>
        controller.getOnboardingStatusController(req, reply)
    );

    // Fetch GitHub repositories
    fastify.get("/repositories", { preHandler }, async (req, reply) =>
        controller.getRepositoriesController(req, reply)
    );

    // Save selected repositories
    fastify.post("/repositories", { preHandler }, async (req, reply) =>
        controller.saveRepositoriesController(req, reply)
    );

    // Complete onboarding
    fastify.post("/complete", { preHandler }, async (req, reply) =>
        controller.completeOnboardingController(req, reply)
    );
}