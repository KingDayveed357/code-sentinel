// lib/api/integrations.ts
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