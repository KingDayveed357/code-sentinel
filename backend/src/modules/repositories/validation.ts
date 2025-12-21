// src/modules/shared/repositories/validation.ts
import type { FastifyInstance } from "fastify";

/**
 * Plan limits for repository imports
 */
const PLAN_LIMITS = {
    Free: 5,
    Dev: 20,
    Team: 100,
    Enterprise: Infinity,
} as const;

/**
 * Validate if user can import repositories based on their plan
 */
export async function validateRepositoryImport(
    fastify: FastifyInstance,
    userId: string,
    userPlan: string,
    requestedCount: number
): Promise<{
    allowed: boolean;
    allowed_count: number;
    current_count: number;
    limit: number;
    message: string;
}> {
    // Get user's current repo count
    const { count: currentCount, error } = await fastify.supabase
        .from("repositories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

    if (error) {
        fastify.log.error({ error, userId }, "Failed to count repositories");
        throw fastify.httpErrors.internalServerError(
            "Failed to validate repository import"
        );
    }

    const current = currentCount || 0;
    const limit = PLAN_LIMITS[userPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.Free;
    const remaining = limit - current;

    // Check if user has reached their limit
    if (remaining <= 0) {
        return {
            allowed: false,
            allowed_count: 0,
            current_count: current,
            limit,
            message: `Repository limit reached. ${userPlan} plan allows ${limit} repositories. Please upgrade your plan to import more.`,
        };
    }

    // Check if requested count exceeds remaining
    if (requestedCount > remaining) {
        return {
            allowed: true,
            allowed_count: remaining,
            current_count: current,
            limit,
            message: `You can only import ${remaining} more repositories. ${userPlan} plan allows ${limit} total repositories.`,
        };
    }

    // All good
    return {
        allowed: true,
        allowed_count: requestedCount,
        current_count: current,
        limit,
        message: "Import allowed",
    };
}

/**
 * Get repository limits for a user's plan
 */
export function getRepositoryLimits(userPlan: string): {
    limit: number;
    unlimited: boolean;
} {
    const limit = PLAN_LIMITS[userPlan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.Free;

    return {
        limit,
        unlimited: limit === Infinity,
    };
}