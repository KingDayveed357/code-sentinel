// src/modules/integrations/service.ts
import type { FastifyInstance } from 'fastify';

export type IntegrationProvider = 'github' | 'gitlab' | 'bitbucket' | 'slack';

export interface Integration {
  id: string;
  workspace_id: string;
  // user_id: string;
  provider: IntegrationProvider;
  connected: boolean;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Get integration by provider
 */
export async function getIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider
): Promise<Integration | null> {
  const { data, error } = await fastify.supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Integration;
}

/**
 * Get all integrations for a user
 */
export async function getUserIntegrations(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<Integration[]> {
  const { data, error } = await fastify.supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) {
    fastify.log.error({ error, workspaceId }, 'Failed to fetch integrations');
    return [];
  }

  return (data as Integration[]) || [];
}

/**
 * Create or update integration
 */
export async function upsertIntegration(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider,
  data: {
    access_token: string;
    refresh_token?: string;
    token_expires_at?: string;
    metadata?: Record<string, any>;
  }
): Promise<Integration> {
  const { data: integration, error } = await fastify.supabase
    .from('integrations')
    .upsert(
      {
        workspace_id: workspaceId,
        provider,
        connected: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        token_expires_at: data.token_expires_at || null,
        metadata: data.metadata || {},
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,provider' }
    )
    .select()
    .single();

  if (error || !integration) {
    fastify.log.error({ error, workspaceId, provider }, 'Failed to upsert integration');
    throw fastify.httpErrors.internalServerError('Failed to save integration');
  }

  fastify.log.info({ workspaceId, provider }, 'Integration saved');
  return integration as Integration;
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
    .from('integrations')
    .update({
      connected: false,
      access_token: null,
      refresh_token: null,
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
 * Validate integration token
 */
export async function validateIntegrationToken(
  fastify: FastifyInstance,
  workspaceId: string,
  provider: IntegrationProvider
): Promise<boolean> {
  const integration = await getIntegration(fastify, workspaceId, provider);

  if (!integration || !integration.connected || !integration.access_token) {
    return false;
  }

  // Check if token is expired
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    if (expiresAt < new Date()) {
      fastify.log.warn({ workspaceId, provider }, 'Integration token expired');
      return false;
    }
  }

  // Provider-specific validation
  try {
    if (provider === 'github') {
      return await validateGitHubToken(integration.access_token);
    } else if (provider === 'gitlab') {
      return await validateGitLabToken(integration.access_token);
    }
    return true;
  } catch (error) {
    fastify.log.error({ error, workspaceId, provider }, 'Token validation failed');
    return false;
  }
}

/**
 * GitHub-specific token validation
 */
async function validateGitHubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * GitLab-specific token validation
 */
async function validateGitLabToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://gitlab.com/api/v4/user', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Verify GitHub OAuth access token and return GitHub user
 *
 * Throws if token is invalid or GitHub is unreachable
 */
export async function verifyGitHubToken(token: string): Promise<{
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}> {
  if (!token) {
    throw new Error('GitHub token is missing');
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`, // modern GitHub format
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CodeSentinel',
    },
  });

  if (!response.ok) {
    // Explicit failure for revoked / expired tokens
    throw new Error('Invalid or expired GitHub token');
  }

  const data = await response.json();

  return {
    id: data.id,
    login: data.login,
    email: data.email,
    avatar_url: data.avatar_url,
  };
}
