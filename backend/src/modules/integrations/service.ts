// src/modules/integrations/service.ts
import type { FastifyInstance } from 'fastify';

export type IntegrationProvider = 'github' | 'gitlab' | 'bitbucket' | 'slack';

export interface Integration {
  id: string;
  user_id: string;
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
  userId: string,
  provider: IntegrationProvider
): Promise<Integration | null> {
  const { data, error } = await fastify.supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
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
  userId: string
): Promise<Integration[]> {
  const { data, error } = await fastify.supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    fastify.log.error({ error, userId }, 'Failed to fetch integrations');
    return [];
  }

  return (data as Integration[]) || [];
}

/**
 * Create or update integration
 */
export async function upsertIntegration(
  fastify: FastifyInstance,
  userId: string,
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
        user_id: userId,
        provider,
        connected: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        token_expires_at: data.token_expires_at || null,
        metadata: data.metadata || {},
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )
    .select()
    .single();

  if (error || !integration) {
    fastify.log.error({ error, userId, provider }, 'Failed to upsert integration');
    throw fastify.httpErrors.internalServerError('Failed to save integration');
  }

  fastify.log.info({ userId, provider }, 'Integration saved');
  return integration as Integration;
}

/**
 * Disconnect integration
 */
export async function disconnectIntegration(
  fastify: FastifyInstance,
  userId: string,
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
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    fastify.log.error({ error, userId, provider }, 'Failed to disconnect integration');
    throw fastify.httpErrors.internalServerError('Failed to disconnect integration');
  }

  fastify.log.info({ userId, provider }, 'Integration disconnected');
}

/**
 * Validate integration token
 */
export async function validateIntegrationToken(
  fastify: FastifyInstance,
  userId: string,
  provider: IntegrationProvider
): Promise<boolean> {
  const integration = await getIntegration(fastify, userId, provider);

  if (!integration || !integration.connected || !integration.access_token) {
    return false;
  }

  // Check if token is expired
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    if (expiresAt < new Date()) {
      fastify.log.warn({ userId, provider }, 'Integration token expired');
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
    fastify.log.error({ error, userId, provider }, 'Token validation failed');
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