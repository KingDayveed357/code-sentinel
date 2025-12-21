// src/modules/auth/controller.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../env";

/**
 * POST /api/auth/oauth/github - GitHub OAuth signin
 * This is the ONLY authentication method now
 */
export async function githubOAuthController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const redirectTo = `${env.NEXT_PUBLIC_FRONTEND_URL}/oauth/callback`;

    const { data, error } = await fastify.supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
            redirectTo,
            skipBrowserRedirect: false,
            scopes: "repo read:user user:email",
        },
    });

    if (error) {
        fastify.log.error(error, "GitHub OAuth failed");
        throw fastify.httpErrors.badRequest(error.message);
    }

    return reply.send({ url: data.url });
}

/**
 * POST /api/auth/oauth/callback - Handle OAuth callback
 * Receives the provider_token from the frontend and creates user/integration records
 */
export async function oauthCallbackController(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Body: { provider_token: string } }>,
    reply: FastifyReply
) {
    try {
        const userId = request.supabaseUser?.id;

        if (!userId) {
            fastify.log.error("No supabaseUser found in request after verifyAuth");
            throw fastify.httpErrors.unauthorized("Authentication required");
        }

        const { provider_token: providerToken } = request.body;

        if (!providerToken) {
            fastify.log.error({ userId }, "No provider token in request body");
            throw fastify.httpErrors.badRequest("GitHub access token is required");
        }

        const githubResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `token ${providerToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        if (!githubResponse.ok) {
            const errorText = await githubResponse.text();
            fastify.log.error(
                { status: githubResponse.status, errorText, userId },
                "GitHub API error"
            );
            throw fastify.httpErrors.badRequest("Failed to verify GitHub access token");
        }

        const githubUser = await githubResponse.json();

        fastify.log.info(
            { userId, githubId: githubUser.id, githubLogin: githubUser.login },
            "GitHub user fetched successfully"
        );

        const authHeader = request.headers.authorization;
        if (!authHeader) {
            throw fastify.httpErrors.unauthorized("No authorization header");
        }

        const accessToken = authHeader.substring(7);
        const {
            data: { user: authUser },
            error: userError,
        } = await fastify.supabase.auth.getUser(accessToken);

        if (userError || !authUser) {
            fastify.log.error({ userError }, "Failed to get user from Supabase");
            throw fastify.httpErrors.unauthorized("Invalid session");
        }

        const { data: existingProfile } = await fastify.supabase
            .from("users")
            .select("onboarding_completed")
            .eq("id", userId)
            .single();

        const isNewUser = !existingProfile;

        const { error: profileError } = await fastify.supabase
            .from("users")
            .upsert(
                {
                    id: userId,
                    email: authUser.email,
                    full_name: githubUser.name || githubUser.login,
                    avatar_url: githubUser.avatar_url,
                    plan: "Free",
                    onboarding_completed: isNewUser ? false : existingProfile.onboarding_completed,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "id",
                }
            );

        if (profileError) {
            fastify.log.error({ profileError, userId }, "Failed to create/update user profile");
            throw fastify.httpErrors.internalServerError("Failed to create user profile");
        }

        fastify.log.info({ userId }, "User profile created/updated");

        const { error: integrationError } = await fastify.supabase
            .from("integrations")
            .upsert(
                {
                    user_id: userId,
                    provider: "github",
                    access_token: providerToken,
                    refresh_token: null,
                    connected: true,
                    connected_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "user_id,provider",
                }
            );

        if (integrationError) {
            fastify.log.error(
                { integrationError, userId },
                "Failed to create/update GitHub integration"
            );
            throw fastify.httpErrors.internalServerError("Failed to save GitHub integration");
        }

        fastify.log.info({ userId, githubLogin: githubUser.login }, "GitHub integration saved");

        return reply.send({
            success: true,
            user: {
                id: userId,
                email: authUser.email,
                full_name: githubUser.name || githubUser.login,
                avatar_url: githubUser.avatar_url,
                plan: "Free",
                onboarding_completed: false,
            },
        });
    } catch (error) {
        fastify.log.error({ error }, "OAuth callback processing failed");

        if (error && typeof error === "object" && "statusCode" in error) {
            throw error;
        }

        throw fastify.httpErrors.internalServerError("OAuth callback processing failed");
    }
}

/**
 * GET /api/auth/me - Get current user profile
 */
export async function meController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    return reply.send({
        user: request.profile,
    });
}

/**
 * POST /api/auth/onboarding/complete - Complete onboarding
 */
export async function completeOnboardingController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

    const { error } = await fastify.supabase
        .from("users")
        .update({
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

    if (error) {
        fastify.log.error({ error, userId }, "Failed to complete onboarding");
        throw fastify.httpErrors.internalServerError("Failed to complete onboarding");
    }

    const { data: user } = await fastify.supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

    return reply.send({ success: true, user });
}

/**
 * DELETE /api/auth/account - Delete user account
 */
export async function deleteAccountController(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Body: { username: string } }>,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const { username } = request.body;

    // Verify username matches
    const { data: user } = await fastify.supabase
        .from("users")
        .select("full_name, email")
        .eq("id", userId)
        .single();

    if (!user) {
        throw fastify.httpErrors.notFound("User not found");
    }

    // Username should match the GitHub username or full name
    const userIdentifier = user.full_name || user.email?.split("@")[0] || "";
    if (username !== userIdentifier) {
        throw fastify.httpErrors.badRequest("Username does not match");
    }

    // Delete integrations first (foreign key constraint)
    const { error: integrationsError } = await fastify.supabase
        .from("integrations")
        .delete()
        .eq("user_id", userId);

    if (integrationsError) {
        fastify.log.error({ integrationsError, userId }, "Failed to delete integrations");
        throw fastify.httpErrors.internalServerError("Failed to delete account data");
    }

    // Delete user profile
    const { error: profileError } = await fastify.supabase
        .from("users")
        .delete()
        .eq("id", userId);

    if (profileError) {
        fastify.log.error({ profileError, userId }, "Failed to delete user profile");
        throw fastify.httpErrors.internalServerError("Failed to delete account");
    }

    // Delete from Supabase Auth
    const authHeader = request.headers.authorization;
    if (authHeader) {
        const accessToken = authHeader.substring(7);
        await fastify.supabase.auth.admin.deleteUser(userId);
    }

    fastify.log.info({ userId }, "User account deleted successfully");

    return reply.send({ success: true, message: "Account deleted successfully" });
}

/**
 * POST /api/auth/resync-github - Re-sync GitHub data
 */
export async function resyncGitHubController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

    // Get GitHub integration
    const { data: integration } = await fastify.supabase
        .from("integrations")
        .select("access_token")
        .eq("user_id", userId)
        .eq("provider", "github")
        .single();

    if (!integration?.access_token) {
        throw fastify.httpErrors.badRequest("GitHub integration not found");
    }

    // Fetch latest GitHub data
    const githubResponse = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `token ${integration.access_token}`,
            Accept: "application/vnd.github.v3+json",
        },
    });

    if (!githubResponse.ok) {
        throw fastify.httpErrors.badRequest("Failed to fetch GitHub data");
    }

    const githubUser = await githubResponse.json();

    // Update user profile
    const { error } = await fastify.supabase
        .from("users")
        .update({
            full_name: githubUser.name || githubUser.login,
            avatar_url: githubUser.avatar_url,
            updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

    if (error) {
        fastify.log.error({ error, userId }, "Failed to update user profile");
        throw fastify.httpErrors.internalServerError("Failed to re-sync GitHub data");
    }

    const { data: updatedUser } = await fastify.supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

    return reply.send({ success: true, user: updatedUser });
}


export async function skipOnboardingStepController(
    fastify: FastifyInstance,
    request: FastifyRequest<{ Body: { step: string } }>,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const { step } = request.body;

    if (!step || typeof step !== 'string') {
        throw fastify.httpErrors.badRequest('Step name is required');
    }

    // Get current onboarding state
    const { data: user } = await fastify.supabase
        .from('users')
        .select('onboarding_state')
        .eq('id', userId)
        .single();

    const currentState = user?.onboarding_state || {
        steps_completed: [],
        steps_skipped: [],
        banner_dismissed: false,
        last_updated: null,
    };

    // Add step to skipped list if not already there
    const stepsSkipped = Array.isArray(currentState.steps_skipped) 
        ? currentState.steps_skipped 
        : [];
    
    if (!stepsSkipped.includes(step)) {
        stepsSkipped.push(step);
    }

    // Update onboarding state
    const { error } = await fastify.supabase
        .from('users')
        .update({
            onboarding_state: {
                ...currentState,
                steps_skipped: stepsSkipped,
                last_updated: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) {
        fastify.log.error({ error, userId, step }, 'Failed to update onboarding state');
        throw fastify.httpErrors.internalServerError('Failed to update onboarding state');
    }

    fastify.log.info({ userId, step }, 'Onboarding step marked as skipped');

    return reply.send({ 
        success: true, 
        step,
        message: 'Step marked as skipped' 
    });
}

/**
 * GET /api/auth/onboarding/state - Get onboarding state and banner visibility
 */
export async function getOnboardingStateController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

    // Get user's onboarding state
    const { data: user } = await fastify.supabase
        .from('users')
        .select('onboarding_completed, onboarding_state')
        .eq('id', userId)
        .single();

    if (!user) {
        throw fastify.httpErrors.notFound('User not found');
    }

    const state = user.onboarding_state || {
        steps_completed: [],
        steps_skipped: [],
        banner_dismissed: false,
        last_updated: null,
    };

    // Check if user has any active repositories
    const { count: repoCount } = await fastify.supabase
        .from('repositories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active');

    // Calculate if banner should show
    const shouldShowBanner = 
        user.onboarding_completed === true &&
        Array.isArray(state.steps_skipped) &&
        state.steps_skipped.includes('import_repos') &&
        !state.banner_dismissed &&
        (repoCount || 0) === 0;

    return reply.send({
        onboarding_completed: user.onboarding_completed,
        steps_completed: state.steps_completed || [],
        steps_skipped: state.steps_skipped || [],
        banner_dismissed: state.banner_dismissed || false,
        should_show_import_banner: shouldShowBanner,
        repository_count: repoCount || 0,
    });
}

/**
 * POST /api/auth/onboarding/dismiss-banner - Dismiss import banner
 */
export async function dismissImportBannerController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

    // Get current state
    const { data: user } = await fastify.supabase
        .from('users')
        .select('onboarding_state')
        .eq('id', userId)
        .single();

    const currentState = user?.onboarding_state || {
        steps_completed: [],
        steps_skipped: [],
        banner_dismissed: false,
    };

    // Update banner_dismissed flag
    const { error } = await fastify.supabase
        .from('users')
        .update({
            onboarding_state: {
                ...currentState,
                banner_dismissed: true,
                last_updated: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

    if (error) {
        fastify.log.error({ error, userId }, 'Failed to dismiss banner');
        throw fastify.httpErrors.internalServerError('Failed to dismiss banner');
    }

    fastify.log.info({ userId }, 'Import banner dismissed');

    return reply.send({ 
        success: true,
        message: 'Banner dismissed' 
    });
}