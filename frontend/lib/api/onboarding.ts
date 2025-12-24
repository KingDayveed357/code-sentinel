// lib/api/onboarding.ts
import { apiFetch } from "../api";

export interface OnboardingState {
  onboarding_completed: boolean;
  steps_completed: string[];
  steps_skipped: string[];
  banner_dismissed: boolean;
  should_show_import_banner: boolean;
  repository_count: number;
}

export const onboardingApi = {
  /**
   * Get onboarding steps configuration
   */
  getSteps: () => apiFetch("/onboarding/steps", { requireAuth: true }),

  /**
   * Get current onboarding status
   */
  getStatus: () => apiFetch("/onboarding/status", { requireAuth: true }),


    /**
   * Get onboarding state (includes banner visibility)
   */
  getState: async (): Promise<OnboardingState> => {
    return apiFetch("/auth/onboarding/state", { requireAuth: true });
  },

  /**
   * Mark a step as skipped
   */
  skipStep: async (step: string): Promise<{ success: boolean }> => {
    return apiFetch("/auth/onboarding/skip-step", {
      method: "PATCH",
      requireAuth: true,
      body: JSON.stringify({ step }),
    });
  },

  /**
   * Dismiss the import banner
   */
  dismissBanner: async (): Promise<{ success: boolean }> => {
    return apiFetch("/auth/onboarding/dismiss-banner", {
      method: "POST",
      requireAuth: true,
    });
  },


  /**
   * Fetch user's GitHub repositories
   */
  getRepositories: () => apiFetch("/onboarding/repositories", { requireAuth: true }),

  /**
   * Save selected repositories (provider-agnostic)
   * @param repositories - Array of repositories to save
   * @param provider - The git provider (github, gitlab, bitbucket)
   */
  saveRepositories: (
    repositories: Array<{
      name: string;
      full_name: string;
      owner: string;
      private: boolean;
      url: string;
      default_branch?: string;
    }>,
    provider: "github" | "gitlab" | "bitbucket" = "github"
  ) =>
    apiFetch("/onboarding/repositories", {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({ repositories, provider }),
    }),

  /**
   * Complete onboarding
   */
  complete: () =>
    apiFetch("/onboarding/complete", {
      method: "POST",
      requireAuth: true,
    }),


    /**
 * Import repositories during onboarding
 * (Thin wrapper around saveRepositories for UI clarity)
 */
importRepositories: async (params: {
  repositories: Array<{
    id: number;
    // user_id: string;
    full_name: string;
    default_branch?: string;
    private: boolean;
  }>;
  provider?: "github" | "gitlab" | "bitbucket";
}) => {
  const { repositories, provider = "github" } = params;

  return onboardingApi.saveRepositories(
    repositories.map(repo => {
      const [owner, name] = repo.full_name.split("/");

      return {
        // user_id: repo.user_id,
        name,
        full_name: repo.full_name,
        owner,
        private: repo.private,
        url: `https://github.com/${repo.full_name}`,
        default_branch: repo.default_branch,
      };
    }),
    provider
  );
},

};