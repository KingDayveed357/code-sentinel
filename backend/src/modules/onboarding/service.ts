// src/modules/onboarding/service.ts (REFACTORED)

import type { FastifyInstance } from "fastify";
import type { RepositoryImportInput } from "../integrations/github/types";
import * as githubService from "../integrations/github/service";
import * as repoService from "../repositories/service";
import type { OnboardingState } from "./state-machine";

/**
 * Get onboarding steps configuration
 */
export async function getOnboardingSteps(): Promise<{
    steps: Array<{ id: string; title: string; description: string }>;
}> {
    return {
        steps: [
            {
                id: "welcome",
                title: "Welcome",
                description: "Get started with Code Sentinel",
            },
            {
                id: "import-repos",
                title: "Import Repositories",
                description: "Select repositories to scan (optional)",
            },
        ],
    };
}

/**
 * Get user's onboarding status
 * @param userId - User ID for checking user-level onboarding completion
 * @param workspaceId - Workspace ID for checking workspace-scoped resources (repos, integrations)
 */
export async function getOnboardingStatus(
  fastify: FastifyInstance,
  userId: string,
  workspaceId: string
): Promise<{
  state: OnboardingState;
  current_step: string;
  next_step: string | null;
  blocked_reason: string | null;
}> {
  // Fetch current state
  const { data: user } = await fastify.supabase
    .from('users')
    .select('onboarding_state, onboarding_completed')
    .eq('id', userId)
    .single();

  const state: OnboardingState = user?.onboarding_state || {
    workspace_created: true, // Guaranteed by middleware
    github_connected: false,
    repos_imported: false,
    completed_at: null,
  };

  // Determine current step
  let currentStep = 'welcome';
  let nextStep: string | null = 'connect_github';
  let blockedReason: string | null = null;

  if (state.github_connected) {
    currentStep = 'connect_github';
    nextStep = 'import_repos';
  }

  if (state.repos_imported) {
    currentStep = 'import_repos';
    nextStep = null; // Onboarding complete
  }

  // Check if blocked
  if (currentStep === 'import_repos' && !state.github_connected) {
    blockedReason = 'GitHub integration required before importing repositories';
  }

  return {
    state,
    current_step: currentStep,
    next_step: nextStep,
    blocked_reason: blockedReason,
  };
}

/**
 * Fetch GitHub repositories (delegates to shared service)
 * 
 * ✅ FIXED: Treats missing GitHub integration as product state, not auth error
 * 
 * @param workspaceId - Workspace ID for fetching integration token
 */
export async function fetchGitHubRepositories(
    fastify: FastifyInstance,
    workspaceId: string
) {
    try {
        return await githubService.fetchGitHubRepositories(fastify, workspaceId);
    } catch (error: any) {
        // ✅ CRITICAL FIX: Missing GitHub integration is NOT an auth error
        // It's a normal product state - user hasn't connected GitHub yet
        if (error.statusCode === 401 && error.message?.includes("integration not found")) {
            fastify.log.info(
                { workspaceId },
                "GitHub integration not connected - returning empty list"
            );
            // Return empty array instead of throwing
            return [];
        }
        
        // Re-throw other errors (expired tokens, API failures, etc.)
        throw error;
    }
}

/**
 * Save repositories during onboarding (delegates to shared service)
 * @param workspaceId - Workspace ID where repositories should be imported
 */
export async function saveRepositories(
    fastify: FastifyInstance,
    workspaceId: string,
    userPlan: string,
    repositories: RepositoryImportInput[],
    provider: "github" | "gitlab" | "bitbucket" = "github"
) {
    // Use shared import logic with plan enforcement
    return await repoService.importRepositories(
        fastify,
        workspaceId,
        userPlan,
        repositories,
        provider
    );
}

/**
 * Complete onboarding
 */
export async function completeOnboarding(
    fastify: FastifyInstance,
    userId: string
): Promise<{ success: boolean }> {
    const { error } = await fastify.supabase
        .from("users")
        .update({
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

    if (error) {
        throw fastify.httpErrors.internalServerError("Failed to complete onboarding");
    }

    return { success: true };
}