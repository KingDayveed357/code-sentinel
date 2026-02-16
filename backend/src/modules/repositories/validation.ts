// src/modules/shared/repositories/validation.ts
import type { FastifyInstance } from "fastify";
import { PLAN_LIMITS } from "../entitlements/limits";

/**
 * Plan limits for repository imports
 */
import { EntitlementsService } from "../entitlements/service";

/**
 * Validate if user can import repositories based on their plan
 */
export async function validateRepositoryImport(
    fastify: FastifyInstance,
    workspaceId: string,
    requestedCount: number
): Promise<{
    allowed: boolean;
    allowed_count: number;
    current_count: number;
    limit: number;
    message: string;
}> {
    const entitlements = new EntitlementsService(fastify);
    
    // Fetch plan for error messages
    const plan = await entitlements.getWorkspacePlan(workspaceId);

    // Use EntitlementsService to check limits (it handles workspace_id vs user_id resolution)
    // We pass 0 as requested count initially to just get status, OR pass actual count
    const { current, limit, remaining, unlimited, allowed } = await entitlements.checkRepositoryLimit(
        workspaceId,
        requestedCount
    );

    // Calculate allowed count for partial imports
    let allowedCount = requestedCount;
    let isAllowed = allowed;
    let message = "Import allowed";

    if (!unlimited) {
        if (remaining <= 0) {
            isAllowed = false;
            allowedCount = 0;
            message = `Repository limit reached. ${plan} plan allows ${limit} repositories. Please upgrade your plan to import more.`;
        } else if (remaining < requestedCount) {
            // Partial import allowed
            isAllowed = true;
            allowedCount = remaining;
            message = `You can only import ${remaining} more repositories. ${plan} plan allows ${limit} total repositories.`;
        }
    }

    return {
        allowed: isAllowed,
        allowed_count: allowedCount,
        current_count: current,
        limit,
        message,
    };
}

/**
 * Get repository limits for a user's plan
 */
export function getRepositoryLimits(plan: string): {
    limit: number;
    unlimited: boolean;
} {
    const limit = (PLAN_LIMITS as any)[plan] ? (PLAN_LIMITS as any)[plan].repositories : PLAN_LIMITS.Free.repositories;

    return {
        limit,
        unlimited: limit === Infinity,
    };
}