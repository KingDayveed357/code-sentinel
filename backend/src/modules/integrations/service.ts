
import type { FastifyInstance } from "fastify";
import { IntegrationsRepository } from "./repository";
import { GitHubService } from "./github/service";
import type { IntegrationProvider, IntegrationType, WorkspaceIntegration, SafeIntegration } from "./types";

export class IntegrationsService {
  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly githubService: GitHubService,
    private readonly fastify: FastifyInstance
  ) {}

  async getWorkspaceIntegration(
    workspaceId: string,
    provider: IntegrationProvider
  ): Promise<WorkspaceIntegration | null> {
    const integration = await this.repository.findByWorkspaceAndProvider(workspaceId, provider);
    if (!integration || !integration.connected) return null;
    return integration;
  }

  async getWorkspaceIntegrations(workspaceId: string): Promise<WorkspaceIntegration[]> {
    return this.repository.findAllByWorkspace(workspaceId);
  }

  async getIntegrationToken(
    workspaceId: string,
    provider: IntegrationProvider
  ): Promise<string | null> {
    if (provider === "github") {
      try {
        return await this.githubService.getToken(workspaceId);
      } catch {
        return null;
      }
    }
    return null;
  }

  /* GitHub Specific Flows */
  
  async connectGitHubOAuth(
    workspaceId: string,
    userId: string,
    token: string
  ): Promise<WorkspaceIntegration> {
    // 1. Verify token
    const githubUser = await this.githubService.verifyToken(token);

    // 2. Upsert integration
    const integration = await this.repository.upsert({
      workspace_id: workspaceId,
      provider: "github",
      type: "oauth",
      oauth_user_id: githubUser.id,
      oauth_access_token: token,
      oauth_refresh_token: null, 
      oauth_expires_at: null,
      account_login: githubUser.login,
      account_avatar_url: githubUser.avatar_url,
      account_email: githubUser.email || "EMAIL_NOT_PUBLIC",
      connected: true,
      metadata: {
        name: githubUser.name,
        github_id: githubUser.id,
      },
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 3. Update onboarding
    await this.updateOnboardingState(userId, {
      github_connected: true,
      workspace_created: true,
    });

    return integration;
  }

  async upsertGitHubAppIntegration(
    workspaceId: string,
    data: {
      installation_id: number;
      account_id: number;
      account_login: string;
      account_type: "User" | "Organization";
      account_avatar_url?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<WorkspaceIntegration> {
    return this.repository.upsert({
      workspace_id: workspaceId,
      provider: "github",
      type: "github_app",
      github_app_installation_id: data.installation_id,
      github_app_account_id: data.account_id,
      github_app_account_login: data.account_login,
      github_app_account_type: data.account_type,
      account_login: data.account_login,
      account_avatar_url: data.account_avatar_url || null,
      connected: true,
      metadata: data.metadata || {},
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async disconnect(workspaceId: string, provider: IntegrationProvider): Promise<void> {
    await this.repository.disconnect(workspaceId, provider);
  }

  toSafeIntegration(integration: WorkspaceIntegration): SafeIntegration {
    return {
      id: integration.id,
      provider: integration.provider,
      type: integration.type,
      account_login: integration.account_login,
      account_avatar_url: integration.account_avatar_url,
      account_email: integration.account_email,
      connected: integration.connected,
      connected_at: integration.connected_at,
      metadata: integration.metadata,
    };
  }

  /* Helpers */

  /**
   * Ensure GitHub integration exists for personal workspace if user has OAuth token
   */
  async ensureGitHubIntegration(userId: string, workspaceId: string, workspaceType: string): Promise<void> {
    // Only personal workspaces
    if (workspaceType !== 'personal') return;

    // Check if already connected
    const existing = await this.repository.findByWorkspaceAndProvider(workspaceId, 'github');
    if (existing?.connected && existing.type === 'oauth') return;

    // Get token from cache/metadata (via Auth Admin API which helper used)
    const { data: { user } } = await this.fastify.supabase.auth.admin.getUserById(userId);
    const githubToken = user?.user_metadata?.github_provider_token as string | undefined;

    if (!githubToken) return;

    try {
        // Reuse connect logic which verifies token and upserts
        await this.connectGitHubOAuth(workspaceId, userId, githubToken);
    } catch (error: any) {
        this.fastify.log.warn({ userId, workspaceId, error: error.message }, 'Failed to ensure GitHub integration');
        // If invalid token, clear it to prevent retry loop
        if (error.message?.includes('valid') || error.statusCode === 401) {
             await this.fastify.supabase.auth.admin.updateUserById(userId, {
                user_metadata: {
                  ...user?.user_metadata,
                  github_provider_token: null,
                },
              });
        }
    }
  }

  async updateOnboardingState(userId: string, updates: Record<string, any>): Promise<void> {
    const { data: currentUser } = await this.fastify.supabase
      .from("users")
      .select("onboarding_state")
      .eq("id", userId)
      .single();

    const currentState = currentUser?.onboarding_state || {};

    await this.fastify.supabase
      .from("users")
      .update({
        onboarding_state: {
          ...currentState,
          ...updates,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }
}

// ------------------------------------------------------------------
// Legacy Exports for Compatibility
// ------------------------------------------------------------------

function getService(fastify: FastifyInstance) {
  const repo = new IntegrationsRepository(fastify);
  const ghService = new GitHubService(repo, fastify);
  return new IntegrationsService(repo, ghService, fastify);
}

export async function getWorkspaceIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider
) {
  return getService(fastify).getWorkspaceIntegration(workspaceId, provider);
}

export async function getWorkspaceIntegrations(
  fastify: FastifyInstance,
  workspaceId: string
) {
  return getService(fastify).getWorkspaceIntegrations(workspaceId);
}

export async function getIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider
) {
  const token = await getService(fastify).getIntegrationToken(workspaceId, provider);
  return token ? { access_token: token } : null;
}

export async function upsertOAuthIntegration(
    fastify: FastifyInstance,
    workspaceId: string,
    provider: IntegrationProvider,
    data: any
) {
    // This was only used for GitHub by controller, so we map to connectGitHubOAuth if provider is github
    // But since the signature is different, we might just use the repository direct or service method logic
    // Actually the logic in old service for `upsertOAuthIntegration` was generic but only used for GitHub really
    // I will verify usage. 
    // OLD Signature: (fastify, workspaceId, provider, data: { oauth_user_id... })
    // Only used in IntegrationsController.connectGitHubController
    
    // I will export it but implemented via repo for generic
    const repo = new IntegrationsRepository(fastify);
    return repo.upsert({
        workspace_id: workspaceId,
        provider,
        type: 'oauth',
        ...data,
        connected: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
}

export async function upsertGitHubAppIntegration(
    fastify: FastifyInstance,
    workspaceId: string,
    data: any
) {
    return getService(fastify).upsertGitHubAppIntegration(workspaceId, data);
}

export async function disconnectIntegration(fastify: FastifyInstance, workspaceId: string, provider: IntegrationProvider) {
    return getService(fastify).disconnect(workspaceId, provider);
}

export function toSafeIntegration(integration: WorkspaceIntegration) {
    // Static helper
    return {
      id: integration.id,
      provider: integration.provider,
      type: integration.type,
      account_login: integration.account_login,
      account_avatar_url: integration.account_avatar_url,
      account_email: integration.account_email,
      connected: integration.connected,
      connected_at: integration.connected_at,
      metadata: integration.metadata,
    };
}

// Re-export types
export type { IntegrationProvider, IntegrationType, WorkspaceIntegration, SafeIntegration } from './types';

// I'll export a standalone function too
export async function updateOnboardingState(fastify: FastifyInstance, userId: string, updates: any) {
    return getService(fastify).updateOnboardingState(userId, updates);
}

export async function ensureGitHubIntegration(fastify: FastifyInstance, userId: string, workspaceId: string, workspaceType: string) {
    return getService(fastify).ensureGitHubIntegration(userId, workspaceId, workspaceType);
}

export async function connectGitHubOAuth(fastify: FastifyInstance, workspaceId: string, userId: string, token: string) {
    return getService(fastify).connectGitHubOAuth(workspaceId, userId, token);
}