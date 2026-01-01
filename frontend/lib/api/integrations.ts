// lib/api/integrations.ts
/**
 * Integrations API Client
 * 
 * Handles all integration-related API calls.
 * Always includes workspace context via headers.
 */

import { apiFetch } from "../api";

export interface SafeIntegration {
  id: string;
  provider: string;
  type: string;
  account_login: string;
  account_avatar_url: string | null;
  account_email: string | null;
  connected: boolean;
  connected_at: string | null;
  metadata?: Record<string, any>;
}

export interface IntegrationsResponse {
  success: boolean;
  integrations: SafeIntegration[];
}

export interface ConnectGitHubResponse {
  success: boolean;
  integration: SafeIntegration;
  onboarding_step_completed?: string;
  message: string;
}

export interface DisconnectResponse {
  success: boolean;
  message: string;
  requiresSignOut: boolean;
}

export const integrationsApi = {
  /**
   * Get all integrations for current workspace
   */
  getIntegrations: async (): Promise<IntegrationsResponse> => {
    return apiFetch("/integrations", {
      requireAuth: true,
    });
  },

  /**
   * Connect GitHub integration to workspace
   * 
   * No parameters needed - backend determines flow based on workspace type
   * 
   * Personal workspace:
   * - Returns OAuth redirect instruction
   * - Frontend redirects to OAuth flow
   * 
   * Team workspace:
   * - Returns GitHub App installation URL
   * - Frontend redirects to GitHub App installation
   */
  connectGitHub: async (providerToken?: string): Promise<{
    success: boolean;
    mode: 'oauth' | 'github_app';
    status?: 'already_connected' | 'requires_installation';
    integration?: SafeIntegration;
    install_url?: string;
    onboarding_step_completed?: string;
    message: string;
  }> => {
    const body = providerToken ? { provider_token: providerToken } : {};
    
    return apiFetch("/integrations/github/connect", {
      method: "POST",
      body: JSON.stringify(body),
      requireAuth: true,
    });
  },

  /**
   * Disconnect integration from workspace
   * 
   * @param provider - Integration provider (github, gitlab, etc.)
   */
  disconnectIntegration: async (provider: string): Promise<DisconnectResponse> => {
    return apiFetch(`/integrations/${provider}/disconnect`, {
      method: "POST",
      body: JSON.stringify({}),
      requireAuth: true,
    });
  },

  /**
   * Check integration status for a specific provider
   * 
   * @param provider - Integration provider
   */
  getIntegrationStatus: async (provider: string): Promise<{
    connected: boolean;
    account?: {
      username: string;
      avatar_url: string;
      name?: string;
      email?: string;
    };
  }> => {
    const response = await integrationsApi.getIntegrations();
    const integration = response.integrations.find(i => i.provider === provider);
    
    if (!integration || !integration.connected) {
      return { connected: false };
    }

    return {
      connected: true,
      account: {
        username: integration.account_login,
        avatar_url: integration.account_avatar_url || '',
        name: integration.metadata?.name,
        email: integration.account_email || undefined,
      },
    };
  },
};