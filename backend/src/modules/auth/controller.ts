// src/modules/auth/controller.ts
/**
 * Auth Controller
 * 
 * ✅ UPDATED: Functions that need workspace integrations now use workspace_integrations table
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../../env";

export async function githubOAuthController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { data, error } = await fastify.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${env.NEXT_PUBLIC_FRONTEND_URL}/oauth/callback`,
        scopes: 'read:user user:email repo',
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
 * ✅ UNCHANGED: Still stores token in user metadata for ensureGitHubIntegration
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
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw fastify.httpErrors.unauthorized("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await fastify.supabase.auth.getUser(token);

    if (error || !user) {
      throw fastify.httpErrors.unauthorized("Invalid session");
    }

    const userId = user.id;

    fastify.log.info({ userId }, "Processing OAuth callback");

    // Get user data from Supabase Auth
    const { data: authData, error: authError } = await fastify.supabase.auth.admin.getUserById(userId);
    
    if (authError || !authData.user) {
      throw fastify.httpErrors.unauthorized("Failed to get user data");
    }

    const githubUser = authData.user.user_metadata;

    // Create or update user profile
    const { data: profile, error: profileError } = await fastify.supabase
      .from("users")
      .upsert(
        {
          id: userId,
          email: authData.user.email,
          full_name: githubUser?.full_name || githubUser?.user_name || githubUser?.name || "User",
          avatar_url: githubUser?.avatar_url,
          plan: "Free",
          onboarding_completed: false,
          onboarding_state: {
            workspace_created: false,
            github_connected: false,
            repos_imported: false,
            completed_at: null,
          },
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (profileError) {
      fastify.log.error({ profileError, userId }, "Failed to create user profile");
      throw fastify.httpErrors.internalServerError("Failed to create user profile");
    }

    // Store GitHub provider token in user metadata
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

export async function meController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  return reply.send({ user: request.profile });
}

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
 * 
 * ✅ UPDATED: Deletes from workspace_integrations table
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

  // Delete workspace integrations (CASCADE will handle this via FK, but explicit is safer)
  const { data: workspaces } = await fastify.supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId);

  if (workspaces && workspaces.length > 0) {
    const workspaceIds = workspaces.map(w => w.id);
    
    await fastify.supabase
      .from("workspace_integrations")
      .delete()
      .in("workspace_id", workspaceIds);
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
 * ✅ UPDATED: Uses workspace_integrations table
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

  // Get GitHub integration from workspace_integrations
  const { data: integration } = await fastify.supabase
    .from("workspace_integrations")
    .select("oauth_access_token, type")
    .eq("workspace_id", workspaceId)
    .eq("provider", "github")
    .eq("connected", true)
    .single();

  if (!integration || integration.type !== 'oauth' || !integration.oauth_access_token) {
    throw fastify.httpErrors.badRequest(
      "GitHub integration not found or not using OAuth. Please connect GitHub first."
    );
  }

  // Fetch latest GitHub data
  const githubResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `token ${integration.oauth_access_token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "CodeSentinel/1.0",
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

  // Check if user has any active repositories
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