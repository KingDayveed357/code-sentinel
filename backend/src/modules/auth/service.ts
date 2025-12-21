// src/modules/auth/service.ts
import type { FastifyInstance } from "fastify";
import type { User } from "../../deprecated code/auth/models";
import type { SignUpInput, SignInInput, ForgotPasswordInput, ResetPasswordInput } from "../../deprecated code/auth/schemas";
// @ts-ignore
import crypto from "crypto";

/**
 * Verify JWT token and get Supabase user
 */
export async function verifyTokenAndGetUser(fastify: FastifyInstance, token: string) {
    const { data, error } = await fastify.supabase.auth.getUser(token);
    if (error || !data.user) {
        throw fastify.httpErrors.unauthorized("Invalid or expired token");
    }
    return data.user;
}

/**
 * Check if user exists in public.users
 */
async function userExists(fastify: FastifyInstance, id: string): Promise<boolean> {
    const { data, error } = await fastify.supabase
        .from("users")
        .select("id")
        .eq("id", id)
        .single();

    return !!data && !error;
}

/**
 * Sync user from auth.users to public.users table
 * IMPORTANT: Only creates NEW users, doesn't override existing ones
 */
// src/modules/auth/service.ts - Update syncUser
export async function syncUser(
    fastify: FastifyInstance,
    supabaseUser: any,
    isNewSignup: boolean = false
): Promise<User> {
    const { id, email, user_metadata } = supabaseUser;

    fastify.log.info({ supabaseUser }, "Incoming supabaseUser");

    // Check if user exists using SERVICE ROLE
    const exists = await userExists(fastify, id);
    fastify.log.info({ exists }, "User existence check result");

    if (exists && !isNewSignup) {
        fastify.log.info(`User ${id} exists, returning profile`);
        return getUserById(fastify, id);
    }

    const userData = {
        id,
        email: email ?? null,
        full_name: user_metadata?.full_name ?? user_metadata?.name ?? null,
        avatar_url: user_metadata?.avatar_url ?? user_metadata?.picture ?? null,
        plan: "Free",
        onboarding_completed: false,
    };

    fastify.log.info({ userData }, "Prepared userData for upsert");

    // ✅ CRITICAL: Use service role client for upsert
    // This bypasses RLS completely
    const { data, error } = await fastify.supabase
        .from("users")
        .upsert(userData, {
            onConflict: "id",
            ignoreDuplicates: false
        });

    fastify.log.info({ data, error }, "Supabase upsert response");

    if (error) {
        fastify.log.error(
            {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                supabaseUser,
                userData
            },
            "Failed to sync user"
        );

        throw fastify.httpErrors.internalServerError("Failed to sync user");
    }

    return getUserById(fastify, id);
}


/**
 * Get user by ID from public.users
 */
export async function getUserById(fastify: FastifyInstance, id: string): Promise<User> {
    const { data, error } = await fastify.supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !data) {
        throw fastify.httpErrors.notFound("User not found");
    }

    return data as User;
}

/**
 * Sign up new user (creates auth.users entry via Supabase)
 */
export async function signUp(fastify: FastifyInstance, input: SignUpInput) {
    const { email, password, fullName } = input;

    const { data, error } = await fastify.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm in development
        user_metadata: { full_name: fullName },
    });

    if (error) {
        fastify.log.error(error, "Sign up failed");
        throw fastify.httpErrors.badRequest(error.message);
    }

    if (!data.user) {
        throw fastify.httpErrors.internalServerError("User creation failed");
    }

    // Sync to public.users - mark as NEW signup
    const user = await syncUser(fastify, data.user, true);

    return { user, session: null };
}

/**
 * Sign in user (generates session via Supabase)
 */
export async function signIn(fastify: FastifyInstance, input: SignInInput) {
    const { email, password } = input;

    const { data, error } = await fastify.supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        throw fastify.httpErrors.unauthorized("Invalid credentials");
    }

    if (!data.user || !data.session) {
        throw fastify.httpErrors.unauthorized("Sign in failed");
    }

    // Ensure user exists in public.users (don't reset onboarding for existing users)
    const user = await syncUser(fastify, data.user, false);

    return { user, session: data.session };
}

/**
 * Request password reset (sends email via Supabase)
 */
export async function requestPasswordReset(fastify: FastifyInstance, input: ForgotPasswordInput) {
    const { email } = input;

    // Generate custom reset token for tracking
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Get user by email
    const { data: userData } = await fastify.supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

    if (userData?.id) {
        // Store token in DB for tracking
        await fastify.supabase.from("password_reset_tokens").insert({
            user_id: userData.id,
            token,
            expires_at: expiresAt.toISOString(),
        });
    }

    // Send reset email via Supabase (always returns success to prevent email enumeration)
    const redirectTo = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/reset-password`;
    await fastify.supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    });

    return { message: "If an account exists, a password reset email has been sent" };
}

/**
 * Reset password using token from email
 */
export async function resetPassword(fastify: FastifyInstance, input: ResetPasswordInput) {
    const { token, password } = input;

    // Verify token hasn't been used and hasn't expired
    const { data: tokenData, error: tokenError } = await fastify.supabase
        .from("password_reset_tokens")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

    if (tokenError || !tokenData) {
        throw fastify.httpErrors.badRequest("Invalid or expired reset token");
    }

    // Update password via Supabase admin
    const { error: updateError } = await fastify.supabase.auth.admin.updateUserById(
        tokenData.user_id,
        { password }
    );

    if (updateError) {
        fastify.log.error(updateError, "Password update failed");
        throw fastify.httpErrors.internalServerError("Password reset failed");
    }

    // Mark token as used
    await fastify.supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("token", token);

    return { message: "Password reset successful" };
}

/**
 * Complete onboarding
 */
export async function completeOnboarding(fastify: FastifyInstance, userId: string, plan?: string) {
    const { error } = await fastify.supabase
        .from("users")
        .update({
            onboarding_completed: true,
            plan: plan ?? "Free",
        })
        .eq("id", userId);

    if (error) {
        fastify.log.error(error, "Failed to complete onboarding");
        throw fastify.httpErrors.internalServerError("Failed to complete onboarding");
    }

    return getUserById(fastify, userId);
}