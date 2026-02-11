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
 * GATEKEEPER: Require workspace context
 * Must be used after resolveWorkspace middleware
 */
export async function requireWorkspace(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.workspace) {
        throw request.server.httpErrors.badRequest('Workspace context required');
    }
}

/**
 * GATEKEEPER: Require specific role within the ACTIVE workspace
 * Usage: requireWorkspaceRole(["owner", "admin"])
 */
export function requireWorkspaceRole(allowedRoles: string[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.workspace) {
            throw request.server.httpErrors.badRequest('Workspace context required for role check');
        }

        const userRole = request.workspaceRole || 'viewer';

        if (!allowedRoles.includes(userRole)) {
            throw request.server.httpErrors.forbidden(
                `Access denied in this workspace. Required role: ${allowedRoles.join(" or ")}. Current role: ${userRole}`
            );
        }
    };
}

/**
 * GATEKEEPER: Require Team or Enterprise plan (Workspace Level)
 * Blocks Free plan users based on workspace plan
 */
export async function requireTeamPlan(
    request: FastifyRequest,
    reply: FastifyReply
) {
    // Check workspace plan first (Team/Enterprise workspaces)
    if (request.workspace) {
        const allowedPlans = ["Team", "Enterprise"];
        // Also check if personal workspace owner has a plan on their profile?
        // Ideally plan is unified on workspace object now.
        // Assuming workspace.plan is populated correctly.
        if (!allowedPlans.includes(request.workspace.plan) && !allowedPlans.includes(request.profile?.plan || 'Free')) {
             throw request.server.httpErrors.forbidden(
                `This feature requires a Team or Enterprise plan.`
            );
        }
        return;
    }
    
    // Fallback to user profile plan if no workspace context (legacy/global routes?)
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
 */
export async function requireEnterprisePlan(
    request: FastifyRequest,
    reply: FastifyReply
) {
     if (request.workspace) {
        if (request.workspace.plan !== "Enterprise" && request.profile?.plan !== "Enterprise") {
            throw request.server.httpErrors.forbidden(
                `This feature requires an Enterprise plan.`
            );
        }
        return;
    }

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
 * GATEKEEPER: Require specific role (System Global)
 * Usage: requireRole(["admin", "moderator"])
 * @deprecated Prefer requireWorkspaceRole for workspace-scoped actions
 */
export function requireRole(allowedRoles: string[]) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.profile) {
            throw request.server.httpErrors.unauthorized("User profile not found");
        }

        const userRole = request.profile.role || "user";

        if (!allowedRoles.includes(userRole)) {
            throw request.server.httpErrors.forbidden(
                `Access denied. Required system role: ${allowedRoles.join(" or ")}. Current role: ${userRole}`
            );
        }
    };
}