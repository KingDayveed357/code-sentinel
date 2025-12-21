// src/modules/auth/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile } from "../../middleware/gatekeepers";

export default async function authRoutes(fastify: FastifyInstance) {
    // Public route - initiate GitHub OAuth
    fastify.post("/oauth/github", async (req, reply) =>
        controller.githubOAuthController(fastify, req, reply)
    );

    // Public route - handle OAuth callback
    fastify.post(
        "/oauth/callback",
        {
            preHandler: [verifyAuth],
        },
        async (req, reply) => controller.oauthCallbackController(fastify, req, reply)
    );

    // Protected routes
    fastify.get(
        "/me",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.meController(fastify, req, reply)
    );

    fastify.post(
        "/onboarding/complete",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) =>
            controller.completeOnboardingController(fastify, req, reply)
    );

    fastify.delete(
        "/account",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.deleteAccountController(fastify, req, reply)
    );

    fastify.post(
        "/resync-github",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.resyncGitHubController(fastify, req, reply)
    );

     fastify.get(
        "/onboarding/state",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.getOnboardingStateController(fastify, req, reply)
    );

     // Skip onboarding step
    fastify.patch(
        "/onboarding/skip-step",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.skipOnboardingStepController(fastify, req, reply)
    );

    // Dismiss import banner
    fastify.post(
        "/onboarding/dismiss-banner",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.dismissImportBannerController(fastify, req, reply)
    );
}