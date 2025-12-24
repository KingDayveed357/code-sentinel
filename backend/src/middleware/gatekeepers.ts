// src/middleware/gatekeepers.ts
import type { FastifyRequest, FastifyReply } from "fastify";


/**
 * GATEKEEPER: Require authentication
 * Blocks request if no valid user found by verifyAuth
 */
export async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.supabaseUser) {
        throw request.server.httpErrors.unauthorized("Authentication required");
    }
}

/**
 * GATEKEEPER: Require user profile loaded
 * Blocks request if profile not loaded by loadProfile
 */
export async function requireProfile(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.profile) {
        throw request.server.httpErrors.unauthorized(
            "User profile not found. Please complete registration."
        );
    }
}

/**
 * GATEKEEPER: Block authenticated users from accessing auth routes
 * (e.g., logged-in users shouldn't access /signup or /signin)
 */
export async function blockAuthRoutesIfLoggedIn(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (request.supabaseUser && request.profile) {
        throw request.server.httpErrors.forbidden(
            "Already authenticated. Please log out first."
        );
    }
}

/**
 * GATEKEEPER: Require onboarding completed
 * Blocks if user hasn't finished onboarding
 */
export async function requireOnboardingCompleted(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.profile) {
        throw request.server.httpErrors.unauthorized("User profile not found");
    }

    if (!request.profile.onboarding_completed) {
        throw request.server.httpErrors.forbidden(
            "Please complete onboarding first"
        );
    }
}

/**
 * GATEKEEPER: Require onboarding incomplete
 * Blocks if user has already completed onboarding
 */
export async function requireOnboardingIncomplete(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.profile) {
        throw request.server.httpErrors.unauthorized("User profile not found");
    }

    if (request.profile.onboarding_completed) {
        throw request.server.httpErrors.forbidden(
            "Onboarding already completed"
        );
    }
}

/**
 * GATEKEEPER: Require Team or Enterprise plan
 * Blocks Free plan users
 */
export async function requireTeamPlan(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.profile) {
        throw request.server.httpErrors.unauthorized("User profile not found");
    }

    const allowedPlans = ["Team", "Enterprise"];

    if (!allowedPlans.includes(request.profile.plan)) {
        throw request.server.httpErrors.forbidden(
            `This feature requires a Team or Enterprise plan. Current plan: ${request.profile.plan}`
        );
    }
}

/**
 * GATEKEEPER: Require Enterprise plan only
 * Blocks Free and Team plan users
 */
export async function requireEnterprisePlan(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.profile) {
        throw request.server.httpErrors.unauthorized("User profile not found");
    }

    if (request.profile.plan !== "Enterprise") {
        throw request.server.httpErrors.forbidden(
            `This feature requires an Enterprise plan. Current plan: ${request.profile.plan}`
        );
    }
}

/**
 * GATEKEEPER: Require specific plan (flexible)
 * Usage: requirePlan(["Team", "Enterprise"])
 */
export function requirePlan(allowedPlans: string[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.profile) {
            throw request.server.httpErrors.unauthorized("User profile not found");
        }

        if (!allowedPlans.includes(request.profile.plan)) {
            throw request.server.httpErrors.forbidden(
                `Access denied. Required plan: ${allowedPlans.join(" or ")}. Current plan: ${request.profile.plan}`
            );
        }
    };
}

/**
 * GATEKEEPER: Require specific role (if using roles)
 * Usage: requireRole(["admin", "moderator"])
 */
export function requireRole(allowedRoles: string[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.profile) {
            throw request.server.httpErrors.unauthorized("User profile not found");
        }

        const userRole = request.profile.role || "user";

        if (!allowedRoles.includes(userRole)) {
            throw request.server.httpErrors.forbidden(
                `Access denied. Required role: ${allowedRoles.join(" or ")}. Current role: ${userRole}`
            );
        }
    };
}


export async function requireWorkspace(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.workspace) {
        throw request.server.httpErrors.badRequest('Workspace context required');
    }
}


// export async function requireFeature(feature: string) {
//   return async (request, reply) => {
//     const hasAccess = await entitlements.hasFeature(
//       request.profile.plan, 
//       feature
//     );
    
//     if (!hasAccess) {
//       throw request.server.httpErrors.forbidden({
//         code: 'FEATURE_NOT_AVAILABLE',
//         feature,
//         required_plan: entitlements.getMinimumPlanFor(feature)
//       });
//     }
//   };
// }