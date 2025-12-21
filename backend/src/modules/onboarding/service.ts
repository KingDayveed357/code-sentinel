// src/modules/onboarding/service.ts (REFACTORED)
import type { FastifyInstance } from "fastify";
import type { RepositoryImportInput } from "../integrations/github/types";
import * as githubService from "../integrations/github/service";
import * as repoService from "../repositories/service";

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
 */
export async function getOnboardingStatus(
    fastify: FastifyInstance,
    userId: string
): Promise<{
    currentStep: number;
    totalSteps: number;
    completedSteps: string[];
    githubConnected: boolean;
    hasRepositories: boolean;
}> {
    const { data: userData, error: userError } = await fastify.supabase
        .from("users")
        .select("onboarding_completed")
        .eq("id", userId)
        .single();

    if (userError) {
        throw fastify.httpErrors.internalServerError("Failed to fetch user data");
    }

    // Check GitHub integration
    const { data: integrationData } = await fastify.supabase
        .from("integrations")
        .select("connected")
        .eq("user_id", userId)
        .eq("provider", "github")
        .single();

    // Check if user has any repositories using shared service
    const repoCount = await repoService.getRepositoryCount(fastify, userId);

    const completedSteps: string[] = ["welcome"];
    const hasRepositories = repoCount > 0;

    if (hasRepositories) {
        completedSteps.push("import-repos");
    }

    return {
        currentStep: completedSteps.length,
        totalSteps: 2,
        completedSteps,
        githubConnected: integrationData?.connected ?? false,
        hasRepositories,
    };
}

/**
 * Fetch GitHub repositories (delegates to shared service)
 */
export async function fetchGitHubRepositories(
    fastify: FastifyInstance,
    userId: string
) {
    return await githubService.fetchGitHubRepositories(fastify, userId);
}

/**
 * Save repositories during onboarding (delegates to shared service)
 */
export async function saveRepositories(
    fastify: FastifyInstance,
    userId: string,
    userPlan: string,
    repositories: RepositoryImportInput[],
    provider: "github" | "gitlab" | "bitbucket" = "github"
) {
    // Use shared import logic with plan enforcement
    return await repoService.importRepositories(
        fastify,
        userId,
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