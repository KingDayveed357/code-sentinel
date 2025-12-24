// lib/api/integrations.ts (UPDATED)

import { apiFetch } from "../api";

export const integrationsApi = {
  /**
   * Get all user integrations
   */
  getIntegrations: async (): Promise<{ integrations: any[] }> => {
    return apiFetch("/integrations", {
      requireAuth: true,
    });
  },

  /**
   * ✅ NEW: Connect GitHub integration (MUST be called AFTER OAuth)
   * This is where integration is actually saved to the workspace
   * 
   * @param providerToken - GitHub access token from OAuth flow
   */
  connectGitHub: async (providerToken: string): Promise<{
    success: boolean;
    integration: any;
  }> => {
    return apiFetch("/integrations/github/connect", {
      method: "POST",
      body: JSON.stringify({ provider_token: providerToken }),
      requireAuth: true,
    });
  },

  /**
   * Disconnect integration
   */
  disconnectIntegration: async (provider: string): Promise<{ 
    success: boolean; 
    message: string;
    requiresSignOut: boolean;
  }> => {
    return apiFetch(`/integrations/${provider}/disconnect`, {
      method: "POST",
      body: JSON.stringify({}),
      requireAuth: true,
    });
  },
};