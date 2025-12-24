// // src/modules/auth/controller.ts (NOTE I don't have an auth service this controller also does the work of a service but using best practices you can separate concerns and update with workspace context ). 
// import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
// import { env } from "../../env";

// /**
//  * POST /api/auth/oauth/github - GitHub OAuth signin
//  * This is the ONLY authentication method now
//  */
// export async function githubOAuthController(
//     fastify: FastifyInstance,
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     const redirectTo = `${env.NEXT_PUBLIC_FRONTEND_URL}/oauth/callback`;

//     const { data, error } = await fastify.supabase.auth.signInWithOAuth({
//         provider: "github",
//         options: {
//             redirectTo,
//             skipBrowserRedirect: false,
//             scopes: "repo read:user user:email",
//         },
//     });

//     if (error) {
//         fastify.log.error(error, "GitHub OAuth failed");
//         throw fastify.httpErrors.badRequest(error.message);
//     }

//     return reply.send({ url: data.url });
// }

// /**
//  * POST /api/auth/oauth/callback - Handle OAuth callback
//  * Receives the provider_token from the frontend and creates user/integration records
//  */
// export async function oauthCallbackController(
//     fastify: FastifyInstance,
//     request: FastifyRequest<{ Body: { provider_token: string } }>,
//     reply: FastifyReply
// ) {
//     try {
//         const userId = request.supabaseUser?.id;

//         if (!userId) {
//             fastify.log.error("No supabaseUser found in request after verifyAuth");
//             throw fastify.httpErrors.unauthorized("Authentication required");
//         }

//         const { provider_token: providerToken } = request.body;

//         if (!providerToken) {
//             fastify.log.error({ userId }, "No provider token in request body");
//             throw fastify.httpErrors.badRequest("GitHub access token is required");
//         }

//         const githubResponse = await fetch("https://api.github.com/user", {
//             headers: {
//                 Authorization: `token ${providerToken}`,
//                 Accept: "application/vnd.github.v3+json",
//             },
//         });

//         if (!githubResponse.ok) {
//             const errorText = await githubResponse.text();
//             fastify.log.error(
//                 { status: githubResponse.status, errorText, userId },
//                 "GitHub API error"
//             );
//             throw fastify.httpErrors.badRequest("Failed to verify GitHub access token");
//         }

//         const githubUser = await githubResponse.json();

//         fastify.log.info(
//             { userId, githubId: githubUser.id, githubLogin: githubUser.login },
//             "GitHub user fetched successfully"
//         );

//         const authHeader = request.headers.authorization;
//         if (!authHeader) {
//             throw fastify.httpErrors.unauthorized("No authorization header");
//         }

//         const accessToken = authHeader.substring(7);
//         const {
//             data: { user: authUser },
//             error: userError,
//         } = await fastify.supabase.auth.getUser(accessToken);

//         if (userError || !authUser) {
//             fastify.log.error({ userError }, "Failed to get user from Supabase");
//             throw fastify.httpErrors.unauthorized("Invalid session");
//         }

//         const { data: existingProfile } = await fastify.supabase
//             .from("users")
//             .select("onboarding_completed")
//             .eq("id", userId)
//             .single();

//         const isNewUser = !existingProfile;

//         const { error: profileError } = await fastify.supabase
//             .from("users")
//             .upsert(
//                 {
//                     id: userId,
//                     email: authUser.email,
//                     full_name: githubUser.name || githubUser.login,
//                     avatar_url: githubUser.avatar_url,
//                     plan: "Free",
//                     onboarding_completed: isNewUser ? false : existingProfile.onboarding_completed,
//                     updated_at: new Date().toISOString(),
//                 },
//                 {
//                     onConflict: "id",
//                 }
//             );

//         if (profileError) {
//             fastify.log.error({ profileError, userId }, "Failed to create/update user profile");
//             throw fastify.httpErrors.internalServerError("Failed to create user profile");
//         }

//         fastify.log.info({ userId }, "User profile created/updated");

//         const { error: integrationError } = await fastify.supabase
//             .from("integrations")
//             .upsert(
//                 {
//                     user_id: userId,
//                     provider: "github",
//                     access_token: providerToken,
//                     refresh_token: null,
//                     connected: true,
//                     connected_at: new Date().toISOString(),
//                     updated_at: new Date().toISOString(),
//                 },
//                 {
//                     onConflict: "user_id,provider",
//                 }
//             );

//         if (integrationError) {
//             fastify.log.error(
//                 { integrationError, userId },
//                 "Failed to create/update GitHub integration"
//             );
//             throw fastify.httpErrors.internalServerError("Failed to save GitHub integration");
//         }

//         fastify.log.info({ userId, githubLogin: githubUser.login }, "GitHub integration saved");

//         return reply.send({
//             success: true,
//             user: {
//                 id: userId,
//                 email: authUser.email,
//                 full_name: githubUser.name || githubUser.login,
//                 avatar_url: githubUser.avatar_url,
//                 plan: "Free",
//                 onboarding_completed: false,
//             },
//         });
//     } catch (error) {
//         fastify.log.error({ error }, "OAuth callback processing failed");

//         if (error && typeof error === "object" && "statusCode" in error) {
//             throw error;
//         }

//         throw fastify.httpErrors.internalServerError("OAuth callback processing failed");
//     }
// }

// /**
//  * GET /api/auth/me - Get current user profile
//  */
// export async function meController(
//     fastify: FastifyInstance,
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     return reply.send({
//         user: request.profile,
//     });
// }

// /**
//  * POST /api/auth/onboarding/complete - Complete onboarding
//  */
// export async function completeOnboardingController(
//     fastify: FastifyInstance,
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     const userId = request.profile!.id;

//     const { error } = await fastify.supabase
//         .from("users")
//         .update({
//             onboarding_completed: true,
//             updated_at: new Date().toISOString(),
//         })
//         .eq("id", userId);

//     if (error) {
//         fastify.log.error({ error, userId }, "Failed to complete onboarding");
//         throw fastify.httpErrors.internalServerError("Failed to complete onboarding");
//     }

//     const { data: user } = await fastify.supabase
//         .from("users")
//         .select("*")
//         .eq("id", userId)
//         .single();

//     return reply.send({ success: true, user });
// }

// /**
//  * DELETE /api/auth/account - Delete user account
//  */
// export async function deleteAccountController(
//     fastify: FastifyInstance,
//     request: FastifyRequest<{ Body: { username: string } }>,
//     reply: FastifyReply
// ) {
//     const userId = request.profile!.id;
//     const { username } = request.body;

//     // Verify username matches
//     const { data: user } = await fastify.supabase
//         .from("users")
//         .select("full_name, email")
//         .eq("id", userId)
//         .single();

//     if (!user) {
//         throw fastify.httpErrors.notFound("User not found");
//     }

//     // Username should match the GitHub username or full name
//     const userIdentifier = user.full_name || user.email?.split("@")[0] || "";
//     if (username !== userIdentifier) {
//         throw fastify.httpErrors.badRequest("Username does not match");
//     }

//     // Delete integrations first (foreign key constraint)
//     const { error: integrationsError } = await fastify.supabase
//         .from("integrations")
//         .delete()
//         .eq("user_id", userId);

//     if (integrationsError) {
//         fastify.log.error({ integrationsError, userId }, "Failed to delete integrations");
//         throw fastify.httpErrors.internalServerError("Failed to delete account data");
//     }

//     // Delete user profile
//     const { error: profileError } = await fastify.supabase
//         .from("users")
//         .delete()
//         .eq("id", userId);

//     if (profileError) {
//         fastify.log.error({ profileError, userId }, "Failed to delete user profile");
//         throw fastify.httpErrors.internalServerError("Failed to delete account");
//     }

//     // Delete from Supabase Auth
//     const authHeader = request.headers.authorization;
//     if (authHeader) {
//         const accessToken = authHeader.substring(7);
//         await fastify.supabase.auth.admin.deleteUser(userId);
//     }

//     fastify.log.info({ userId }, "User account deleted successfully");

//     return reply.send({ success: true, message: "Account deleted successfully" });
// }

// /**
//  * POST /api/auth/resync-github - Re-sync GitHub data
//  */
// export async function resyncGitHubController(
//     fastify: FastifyInstance,
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     const userId = request.profile!.id;

//     // Get GitHub integration
//     const { data: integration } = await fastify.supabase
//         .from("integrations")
//         .select("access_token")
//         .eq("user_id", userId)
//         .eq("provider", "github")
//         .single();

//     if (!integration?.access_token) {
//         throw fastify.httpErrors.badRequest("GitHub integration not found");
//     }

//     // Fetch latest GitHub data
//     const githubResponse = await fetch("https://api.github.com/user", {
//         headers: {
//             Authorization: `token ${integration.access_token}`,
//             Accept: "application/vnd.github.v3+json",
//         },
//     });

//     if (!githubResponse.ok) {
//         throw fastify.httpErrors.badRequest("Failed to fetch GitHub data");
//     }

//     const githubUser = await githubResponse.json();

//     // Update user profile
//     const { error } = await fastify.supabase
//         .from("users")
//         .update({
//             full_name: githubUser.name || githubUser.login,
//             avatar_url: githubUser.avatar_url,
//             updated_at: new Date().toISOString(),
//         })
//         .eq("id", userId);

//     if (error) {
//         fastify.log.error({ error, userId }, "Failed to update user profile");
//         throw fastify.httpErrors.internalServerError("Failed to re-sync GitHub data");
//     }

//     const { data: updatedUser } = await fastify.supabase
//         .from("users")
//         .select("*")
//         .eq("id", userId)
//         .single();

//     return reply.send({ success: true, user: updatedUser });
// }


// export async function skipOnboardingStepController(
//     fastify: FastifyInstance,
//     request: FastifyRequest<{ Body: { step: string } }>,
//     reply: FastifyReply
// ) {
//     const userId = request.profile!.id;
//     const { step } = request.body;

//     if (!step || typeof step !== 'string') {
//         throw fastify.httpErrors.badRequest('Step name is required');
//     }

//     // Get current onboarding state
//     const { data: user } = await fastify.supabase
//         .from('users')
//         .select('onboarding_state')
//         .eq('id', userId)
//         .single();

//     const currentState = user?.onboarding_state || {
//         steps_completed: [],
//         steps_skipped: [],
//         banner_dismissed: false,
//         last_updated: null,
//     };

//     // Add step to skipped list if not already there
//     const stepsSkipped = Array.isArray(currentState.steps_skipped) 
//         ? currentState.steps_skipped 
//         : [];
    
//     if (!stepsSkipped.includes(step)) {
//         stepsSkipped.push(step);
//     }

//     // Update onboarding state
//     const { error } = await fastify.supabase
//         .from('users')
//         .update({
//             onboarding_state: {
//                 ...currentState,
//                 steps_skipped: stepsSkipped,
//                 last_updated: new Date().toISOString(),
//             },
//             updated_at: new Date().toISOString(),
//         })
//         .eq('id', userId);

//     if (error) {
//         fastify.log.error({ error, userId, step }, 'Failed to update onboarding state');
//         throw fastify.httpErrors.internalServerError('Failed to update onboarding state');
//     }

//     fastify.log.info({ userId, step }, 'Onboarding step marked as skipped');

//     return reply.send({ 
//         success: true, 
//         step,
//         message: 'Step marked as skipped' 
//     });
// }

// /**
//  * GET /api/auth/onboarding/state - Get onboarding state and banner visibility
//  */
// export async function getOnboardingStateController(
//     fastify: FastifyInstance,
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     const userId = request.profile!.id;

//     // Get user's onboarding state
//     const { data: user } = await fastify.supabase
//         .from('users')
//         .select('onboarding_completed, onboarding_state')
//         .eq('id', userId)
//         .single();

//     if (!user) {
//         throw fastify.httpErrors.notFound('User not found');
//     }

//     const state = user.onboarding_state || {
//         steps_completed: [],
//         steps_skipped: [],
//         banner_dismissed: false,
//         last_updated: null,
//     };

//     // Check if user has any active repositories
//     const { count: repoCount } = await fastify.supabase
//         .from('repositories')
//         .select('id', { count: 'exact', head: true })
//         .eq('user_id', userId)
//         .eq('status', 'active');

//     // Calculate if banner should show
//     const shouldShowBanner = 
//         user.onboarding_completed === true &&
//         Array.isArray(state.steps_skipped) &&
//         state.steps_skipped.includes('import_repos') &&
//         !state.banner_dismissed &&
//         (repoCount || 0) === 0;

//     return reply.send({
//         onboarding_completed: user.onboarding_completed,
//         steps_completed: state.steps_completed || [],
//         steps_skipped: state.steps_skipped || [],
//         banner_dismissed: state.banner_dismissed || false,
//         should_show_import_banner: shouldShowBanner,
//         repository_count: repoCount || 0,
//     });
// }

// /**
//  * POST /api/auth/onboarding/dismiss-banner - Dismiss import banner
//  */
// export async function dismissImportBannerController(
//     fastify: FastifyInstance,
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     const userId = request.profile!.id;

//     // Get current state
//     const { data: user } = await fastify.supabase
//         .from('users')
//         .select('onboarding_state')
//         .eq('id', userId)
//         .single();

//     const currentState = user?.onboarding_state || {
//         steps_completed: [],
//         steps_skipped: [],
//         banner_dismissed: false,
//     };

//     // Update banner_dismissed flag
//     const { error } = await fastify.supabase
//         .from('users')
//         .update({
//             onboarding_state: {
//                 ...currentState,
//                 banner_dismissed: true,
//                 last_updated: new Date().toISOString(),
//             },
//             updated_at: new Date().toISOString(),
//         })
//         .eq('id', userId);

//     if (error) {
//         fastify.log.error({ error, userId }, 'Failed to dismiss banner');
//         throw fastify.httpErrors.internalServerError('Failed to dismiss banner');
//     }

//     fastify.log.info({ userId }, 'Import banner dismissed');

//     return reply.send({ 
//         success: true,
//         message: 'Banner dismissed' 
//     });
// }












// src/modules/auth/controller.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../env";

export async function githubOAuthController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Get frontend URL from environment
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    const { data, error } = await fastify.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${frontendUrl}/oauth/callback`,
        scopes: 'read:user user:email repo', // Request repo access for integration
      },
    });

    if (error || !data.url) {
      fastify.log.error({ error }, "Failed to initiate GitHub OAuth");
      throw fastify.httpErrors.internalServerError("Failed to initiate GitHub OAuth");
    }

    fastify.log.info("GitHub OAuth URL generated");
    return reply.send({ url: data.url });
    
  } catch (error) {
    fastify.log.error({ error }, "GitHub OAuth initiation failed");
    throw error;
  }
}

/**
 * POST /auth/oauth/callback
 * 
 * ✅ CRITICAL FIX: This endpoint is called by the FRONTEND after Supabase
 * has already authenticated the user. We just need to:
 * 1. Verify the session exists
 * 2. Create/update user profile
 * 3. Store the GitHub token for later integration creation
 * 
 * The frontend sends us the provider_token from session.provider_token
 */
export async function oauthCallbackController(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Body: { provider_token: string } }>,
  reply: FastifyReply
) {
  const { provider_token } = request.body;

  if (!provider_token) {
    throw fastify.httpErrors.badRequest("Missing provider_token");
  }

  try {
    // Get the authenticated user from the request (verifyAuth middleware already ran)
    const authHeader = request.headers.authorization;

if (!authHeader) {
  throw fastify.httpErrors.unauthorized("Missing Authorization header");
}

const token = authHeader.replace("Bearer ", "");

const { data: { user }, error } =
  await fastify.supabase.auth.getUser(token);

if (error || !user) {
  throw fastify.httpErrors.unauthorized("Invalid session");
}

const userId = user.id;

    if (!userId) {
      throw fastify.httpErrors.unauthorized("Not authenticated");
    }

    fastify.log.info({ userId }, "Processing OAuth callback");

    // Get user data from Supabase Auth
    const { data: authData, error: authError } = await fastify.supabase.auth.admin.getUserById(userId);
    
    if (authError || !authData.user) {
      throw fastify.httpErrors.unauthorized("Failed to get user data");
    }

    const githubUser = authData.user.user_metadata;

    // Create or update user profile in our database
    const { data: profile, error: profileError } = await fastify.supabase
      .from("users")
      .upsert(
        {
          id: userId,
          email: authData.user.email,
          full_name: githubUser?.full_name || githubUser?.user_name || githubUser?.name || "User",
          avatar_url: githubUser?.avatar_url,
          plan: "Free",
        //   role: "user",
          onboarding_completed: false,
          onboarding_state: {
            workspace_created: false,
            github_connected: false,
            repos_imported: false,
            completed_at: null,
          },
        },
        {
          onConflict: "id",
        }
      )
      .select()
      .single();

    if (profileError) {
      fastify.log.error({ profileError, userId }, "Failed to create user profile");
      throw fastify.httpErrors.internalServerError("Failed to create user profile");
    }

    // ✅ CRITICAL: Store GitHub provider token in user metadata
    // This will be read by ensureGitHubIntegration during workspace resolution
    const { error: metadataError } = await fastify.supabase.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          ...authData.user.user_metadata,
          github_provider_token: provider_token,
        },
      }
    );

    if (metadataError) {
      fastify.log.error({ metadataError, userId }, "Failed to store GitHub token in metadata");
      // Don't throw - profile was created, token will be requested again later
    } else {
      fastify.log.info({ userId }, "GitHub token stored in user metadata");
    }

    return reply.send({
      success: true,
      user: profile,
      message: "OAuth completed successfully",
    });

  } catch (error: any) {
    fastify.log.error({ error }, "OAuth callback failed");
    
    if (error.statusCode) {
      throw error;
    }
    
    throw fastify.httpErrors.internalServerError("OAuth callback failed");
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

    const { data: user } = await fastify.supabase
        .from("users")
        .select("full_name, email")
        .eq("id", userId)
        .single();

    if (!user) {
        throw fastify.httpErrors.notFound("User not found");
    }

    const userIdentifier = user.full_name || user.email?.split("@")[0] || "";
    if (username !== userIdentifier) {
        throw fastify.httpErrors.badRequest("Username does not match");
    }

    // Delete integrations first (foreign key constraint)
    const { error: integrationsError } = await fastify.supabase
        .from("integrations")
        .delete()
        .eq("workspace_id", userId); // Changed from user_id

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
    await fastify.supabase.auth.admin.deleteUser(userId);

    fastify.log.info({ userId }, "User account deleted successfully");

    return reply.send({ success: true, message: "Account deleted successfully" });
}

/**
 * POST /api/auth/resync-github - Re-sync GitHub data
 * 
 * ⚠️ NOTE: This now requires workspace context for integration lookup
 */
export async function resyncGitHubController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const workspaceId = request.workspace?.id;

    if (!workspaceId) {
        throw fastify.httpErrors.badRequest("No workspace found");
    }

    // Get GitHub integration from workspace
    const { data: integration } = await fastify.supabase
        .from("integrations")
        .select("access_token")
        .eq("workspace_id", workspaceId)
        .eq("provider", "github")
        .single();

    if (!integration?.access_token) {
        throw fastify.httpErrors.badRequest("GitHub integration not found. Please connect GitHub first.");
    }

    // Fetch latest GitHub data
    const githubResponse = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `token ${integration.access_token}`,
            Accept: "application/vnd.github.v3+json",
        },
    });

    if (!githubResponse.ok) {
        throw fastify.httpErrors.badRequest("Failed to fetch GitHub data. Token may be expired.");
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

    const stepsSkipped = Array.isArray(currentState.steps_skipped) 
        ? currentState.steps_skipped 
        : [];
    
    if (!stepsSkipped.includes(step)) {
        stepsSkipped.push(step);
    }

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

export async function getOnboardingStateController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

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

    // Check if user has any active repositories (requires workspace)
    let repoCount = 0;
    if (request.workspace?.id) {
        const { count } = await fastify.supabase
            .from('repositories')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', request.workspace.id)
            .eq('status', 'active');
        
        repoCount = count || 0;
    }

    const shouldShowBanner = 
        user.onboarding_completed === true &&
        Array.isArray(state.steps_skipped) &&
        state.steps_skipped.includes('import_repos') &&
        !state.banner_dismissed &&
        repoCount === 0;

    return reply.send({
        onboarding_completed: user.onboarding_completed,
        steps_completed: state.steps_completed || [],
        steps_skipped: state.steps_skipped || [],
        banner_dismissed: state.banner_dismissed || false,
        should_show_import_banner: shouldShowBanner,
        repository_count: repoCount,
    });
}

export async function dismissImportBannerController(
    fastify: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;

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