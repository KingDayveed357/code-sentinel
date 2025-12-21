// src/modules/onboarding/controller.ts (REFACTORED)
import type { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./service";
import { saveRepositoriesSchema, SaveRepositoriesInput } from "./schemas";

/**
 * GET /onboarding/steps
 */
export async function getOnboardingStepsController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const steps = await service.getOnboardingSteps();
    return reply.send(steps);
}

/**
 * GET /onboarding/status
 */
export async function getOnboardingStatusController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const status = await service.getOnboardingStatus(request.server, userId);

    return reply.send({
        status,
        user: request.profile,
    });
}

/**
 * GET /onboarding/repositories
 * Fetch user's GitHub repositories
 */
export async function getRepositoriesController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const repositories = await service.fetchGitHubRepositories(request.server, userId);

    return reply.send({ repositories });
}

/**
 * POST /onboarding/repositories
 * Save selected repositories during onboarding
 */
export async function saveRepositoriesController(
    request: FastifyRequest<{ Body: SaveRepositoriesInput }>,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const userPlan = request.profile!.plan;
    const { repositories, provider } = saveRepositoriesSchema.parse(request.body);

    const result = await service.saveRepositories(
        request.server,
        userId,
        userPlan,
        repositories,
        provider
    );

    return reply.send(result);
}

/**
 * POST /onboarding/complete
 */
export async function completeOnboardingController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

    const result = await service.completeOnboarding(request.server, userId);

    // Return updated user profile
    const { data: user } = await request.server.supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

    return reply.send({ ...result, user });
}