// src/modules/integrations/service.ts
/**
 * Integration Service - Workspace-Scoped
 * 
 * CRITICAL ARCHITECTURE:
 * - Personal workspaces: Use OAuth (user signs in with GitHub)
 * - Team workspaces: Use GitHub App (organization installs app)
 * 
 * This separation ensures proper access control and authentication.
 */

import type { FastifyInstance } from 'fastify';
import { verifyGitHubToken } from './helper';

export type IntegrationType = 'oauth' | 'github_app';
export type IntegrationProvider = 'github' | 'gitlab' | 'bitbucket' | 'slack';

export interface WorkspaceIntegration {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  type: IntegrationType;
  
  // OAuth fields
  oauth_user_id: number | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_expires_at: string | null;
  
  // GitHub App fields
  github_app_installation_id: number | null;
  github_app_account_id: number | null;
  github_app_account_login: string | null;
  github_app_account_type: 'User' | 'Organization' | null;
  
  // Common fields
  account_login: string;
  account_avatar_url: string | null;
  account_email: string | null;
  connected: boolean;
  metadata: Record<string, any>;
  
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeIntegration {
  id: string;
  provider: IntegrationProvider;
  type: IntegrationType;
  account_login: string;
  account_avatar_url: string | null;
  account_email: string | null;
  connected: boolean;
  connected_at: string | null;
  metadata?: Record<string, any>;
}

/**
 * Get workspace integration by provider
 */
export async function getWorkspaceIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider
): Promise<WorkspaceIntegration | null> {
  const { data, error } = await fastify.supabase
    .from('workspace_integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .eq('connected', true)
    .maybeSingle();

  if (error) {
    fastify.log.error({ error, workspaceId, provider }, 'Failed to get workspace integration');
    return null;
  }

  return data as WorkspaceIntegration | null;
}

/**
 * Get all integrations for workspace
 */
export async function getWorkspaceIntegrations(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<WorkspaceIntegration[]> {
  const { data, error } = await fastify.supabase
    .from('workspace_integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    fastify.log.error({ error, workspaceId }, 'Failed to get workspace integrations');
    return [];
  }

  return (data as WorkspaceIntegration[]) || [];
}

/**
 * Create or update OAuth integration (personal workspaces)
 */
export async function upsertOAuthIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider,
  data: {
    oauth_user_id: number;
    oauth_access_token: string;
    oauth_refresh_token?: string;
    oauth_expires_at?: string;
    account_login: string;
    account_avatar_url?: string;
    account_email?: string;
    metadata?: Record<string, any>;
  }
): Promise<WorkspaceIntegration> {
  const { data: integration, error } = await fastify.supabase
    .from('workspace_integrations')
    .upsert(
      {
        workspace_id: workspaceId,
        provider,
        type: 'oauth',
        oauth_user_id: data.oauth_user_id,
        oauth_access_token: data.oauth_access_token,
        oauth_refresh_token: data.oauth_refresh_token || null,
        oauth_expires_at: data.oauth_expires_at || null,
        account_login: data.account_login,
        account_avatar_url: data.account_avatar_url || null,
        account_email: data.account_email || null,
        connected: true,
        metadata: data.metadata || {},
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,provider' }
    )
    .select()
    .single();

  if (error || !integration) {
    fastify.log.error({ error, workspaceId, provider }, 'Failed to upsert OAuth integration');
    throw fastify.httpErrors.internalServerError('Failed to save integration');
  }

  fastify.log.info({ workspaceId, provider, type: 'oauth' }, 'OAuth integration saved');
  return integration as WorkspaceIntegration;
}

/**
 * Disconnect integration
 */
export async function disconnectIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider
): Promise<void> {
  const { error } = await fastify.supabase
    .from('workspace_integrations')
    .update({
      connected: false,
      oauth_access_token: null,
      oauth_refresh_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('provider', provider);

  if (error) {
    fastify.log.error({ error, workspaceId, provider }, 'Failed to disconnect integration');
    throw fastify.httpErrors.internalServerError('Failed to disconnect integration');
  }

  fastify.log.info({ workspaceId, provider }, 'Integration disconnected');
}

/**
 * Transform integration to safe format (strips sensitive tokens)
 */
export function toSafeIntegration(integration: WorkspaceIntegration): SafeIntegration {
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

/**
 * Create or update GitHub App integration (team workspaces)
 */
export async function upsertGitHubAppIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  data: {
    installation_id: number;
    account_id: number;
    account_login: string;
    account_type: 'User' | 'Organization';
    account_avatar_url?: string;
    metadata?: Record<string, any>;
  }
): Promise<WorkspaceIntegration> {
  const { data: integration, error } = await fastify.supabase
    .from('workspace_integrations')
    .upsert(
      {
        workspace_id: workspaceId,
        provider: 'github',
        type: 'github_app',
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
      },
      { onConflict: 'workspace_id,provider' }
    )
    .select()
    .single();

  if (error || !integration) {
    fastify.log.error({ error, workspaceId }, 'Failed to upsert GitHub App integration');
    throw fastify.httpErrors.internalServerError('Failed to save GitHub App integration');
  }

  fastify.log.info(
    { workspaceId, type: 'github_app', installation_id: data.installation_id }, 
    'GitHub App integration saved'
  );
  return integration as WorkspaceIntegration;
}
export async function updateOnboardingState(
  fastify: FastifyInstance,
  userId: string,
  updates: Record<string, any>
): Promise<void> {
  const { data: currentUser } = await fastify.supabase
    .from('users')
    .select('onboarding_state')
    .eq('id', userId)
    .single();

  const currentState = currentUser?.onboarding_state || {};
  
  await fastify.supabase
    .from('users')
    .update({
      onboarding_state: {
        ...currentState,
        ...updates,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  fastify.log.info({ userId, updates }, 'Onboarding state updated');
}