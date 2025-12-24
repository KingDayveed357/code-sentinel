// lib/api/auth.ts (UPDATED)

import { apiFetch } from "../api";

export const authApi = {
  /**
   * GitHub OAuth sign in - returns redirect URL
   */
  githubOAuth: async (): Promise<{ url: string }> => {
    return apiFetch("/auth/oauth/github", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  /**
   * Complete OAuth callback - creates user profile ONLY
   * ✅ UPDATED: No longer creates integrations
   * 
   * @param providerToken - GitHub access token from OAuth session
   */
  completeOAuthCallback: async (providerToken: string): Promise<{
    success: boolean;
    user: any;
  }> => {
    return apiFetch("/auth/oauth/callback", {
      method: "POST",
      body: JSON.stringify({ provider_token: providerToken }),
      requireAuth: true,
    });
  },

  /**
   * Get current user profile
   */
  me: () =>
    apiFetch("/auth/me", {
      requireAuth: true,
    }),

  /**
   * Delete user account
   */
  deleteAccount: async (username: string): Promise<{ success: boolean; message: string }> => {
    return apiFetch("/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ username }),
      requireAuth: true,
    });
  },

  /**
   * Re-sync GitHub data
   */
  resyncGitHub: async (): Promise<{ success: boolean; user: any }> => {
    return apiFetch("/auth/resync-github", {
      method: "POST",
      body: JSON.stringify({}),
      requireAuth: true,
    });
  },
};