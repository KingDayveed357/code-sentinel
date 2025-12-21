// src/middleware/auth.ts
import type { FastifyRequest, FastifyReply } from "fastify";
import type { UserProfile } from "../types/fastify";

/**
 * Middleware: Extract and verify JWT token from Authorization header
 * Attaches supabaseUser to request if valid
 * Does NOT block request - gatekeepers handle that
 */
export async function verifyAuth(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        request.log.debug("No authorization header found");
        return; // Don't throw - let gatekeepers decide
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        request.log.debug("Invalid authorization header format");
        return;
    }

    try {
        const { data, error } = await request.server.supabase.auth.getUser(token);

        if (error || !data.user) {
            request.log.warn({ error }, "Token verification failed");
            return;
        }

        // Attach to request for downstream use
        request.supabaseUser = data.user;
        request.log.debug({ userId: data.user.id }, "User verified");
    } catch (error) {
        request.log.error({ error }, "Error verifying token");
        // Don't throw - let gatekeepers handle missing user
    }
}

/**
 * Middleware: Load user profile from public.users table
 * Requires verifyAuth to have run first
 * Attaches profile to request
 */
export async function loadProfile(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.supabaseUser) {
        request.log.debug("No supabaseUser found, skipping profile load");
        return; // Can't load profile without user
    }

    try {
        const { data, error } = await request.server.supabase
            .from("users")
            .select("*")
            .eq("id", request.supabaseUser.id)
            .single();

        if (error || !data) {
            request.log.warn(
                { error, userId: request.supabaseUser.id },
                "Failed to load user profile"
            );
            return;
        }

        // Attach to request
        request.profile = data as UserProfile;
        request.log.debug(
            { userId: data.id, plan: data.plan, onboarded: data.onboarding_completed },
            "Profile loaded"
        );
    } catch (error) {
        request.log.error({ error }, "Error loading profile");
    }
}