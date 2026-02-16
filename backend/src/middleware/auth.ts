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

    let attempts = 0;
    let data = null;
    let fetchError: any = null;

    // Retry logic for flaky connections
    while (attempts < 3) {
        try {
            const result = await request.server.supabase.auth.getUser(token);
            
            if (result.error) {
                // Check if it's a fetch error wrapped by Supabase or a 5xx error
                const isRetryable = 
                    result.error.status === 500 || 
                    result.error.status === 502 ||
                    result.error.status === 503 ||
                    result.error.status === 504 ||
                    (result.error.message && (
                        result.error.message.includes("fetch failed") || 
                        result.error.message.includes("timeout") ||
                        result.error.name === "AuthRetryableFetchError"
                    ));

                if (isRetryable) {
                    throw result.error; // Throw to trigger catch block retry
                }
                
                // Regular auth error (invalid token), don't retry
                fetchError = result.error;
                break; 
            }
            
            data = result.data;
            fetchError = null;
            break; // Success
            
        } catch (err: any) {
            fetchError = err;
            attempts++;
            
            // Only retry on network/timeout errors or 5xx
            const isNetworkError = 
                err.status >= 500 ||
                err.message?.includes("fetch failed") || 
                err.message?.includes("timeout") || 
                err.code === 'UND_ERR_CONNECT_TIMEOUT' ||
                err.name === 'AuthRetryableFetchError' ||
                (err.cause && (
                    err.cause.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                    err.cause.code === 'ECONNREFUSED' ||
                    err.cause.code === 'ETIMEDOUT'
                ));

            if (isNetworkError && attempts < 3) {
                const backoff = attempts * 500; 
                request.log.warn(
                    { err: err.message, attempt: attempts }, 
                    `Auth check failed, retrying in ${backoff}ms...`
                );
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            
            // Not a network error or max attempts reached
            break;
        }
    }

    if (fetchError || !data?.user) {
        // Log as error if it was a network failure, warn otherwise
        const logLevel = (fetchError?.status >= 500 || fetchError?.code) ? 'error' : 'warn';
        request.log[logLevel]({ error: fetchError }, "Token verification failed");
        return;
    }

    // Attach to request for downstream use
    request.supabaseUser = data.user;
    request.log.debug({ userId: data.user.id }, "User verified");
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
        request.user = data as UserProfile; // Convenience alias
        request.log.debug(
            { userId: data.id, plan: data.plan, onboarded: data.onboarding_completed },
            "Profile loaded"
        );
    } catch (error) {
        request.log.error({ error }, "Error loading profile");
    }
}