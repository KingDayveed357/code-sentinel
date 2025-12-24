// src/modules/webhooks/service.ts - FIXED: Proper cleanup of deleted webhooks
// =====================================================
// Webhook Management Service
// =====================================================
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import type {
  RepositorySettings,
  RepositoryWebhook,
  GitHubPushPayload,
  GitHubWebhookConfig,
  WebhookVerificationResult,
  ScanTriggerResult,
  WebhookRegistrationResult,
} from './types';
import { getIntegration } from '../integrations/service';

const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://collapsable-excurrent-gloria.ngrok-free.dev/api/webhooks/github';

/**
 * Verify GitHub webhook signature
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): WebhookVerificationResult {
  if (!signature || !signature.startsWith('sha256=')) {
    return { valid: false, error: 'Missing or invalid signature format' };
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const digest = `sha256=${hmac.digest('hex')}`;

  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  // Use timing-safe comparison
  if (signatureBuffer.length !== digestBuffer.length) {
    return { valid: false, error: 'Signature length mismatch' };
  }

  const valid = crypto.timingSafeEqual(signatureBuffer, digestBuffer);

  return { valid, error: valid ? undefined : 'Signature verification failed' };
}

/**
 * Generate secure webhook secret
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify webhook exists on GitHub
 * Returns true if webhook exists and is active, false otherwise
 */
export async function verifyWebhookOnGitHub(
  fastify: FastifyInstance,
  userId: string,
  repositoryId: string,
  repoFullName: string,
  githubWebhookId: number
): Promise<{ exists: boolean; active: boolean; error?: string }> {
  try {
    // Get user's GitHub integration
    const integration = await getIntegration(fastify, userId, 'github');

    if (!integration || !integration.access_token) {
      return {
        exists: false,
        active: false,
        error: 'GitHub integration not found',
      };
    }

    const [owner, repo] = repoFullName.split('/');

    // Check if webhook exists on GitHub
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks/${githubWebhookId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `token ${integration.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      // Webhook doesn't exist on GitHub
      fastify.log.warn(
        { repositoryId, githubWebhookId },
        'Webhook not found on GitHub'
      );
      return { exists: false, active: false };
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      fastify.log.error(
        { error, status: response.status },
        'Failed to verify webhook on GitHub'
      );
      return {
        exists: false,
        active: false,
        error: error.message || `GitHub API error: ${response.status}`,
      };
    }

    const webhook = await response.json();

    return {
      exists: true,
      active: webhook.active === true,
    };
  } catch (error: any) {
    fastify.log.error({ error, repositoryId }, 'Error verifying webhook');
    return {
      exists: false,
      active: false,
      error: error.message,
    };
  }
}

/**
 * Clean up deleted webhook from database
 * This removes the record completely to avoid unique constraint issues
 */
async function cleanupDeletedWebhook(
  fastify: FastifyInstance,
  repositoryId: string
): Promise<void> {
  try {
    // Delete all old webhook records for this repository
    const { error } = await fastify.supabase
      .from('repository_webhooks')
      .delete()
      .eq('repository_id', repositoryId);

    if (error) {
      fastify.log.error({ error, repositoryId }, 'Failed to cleanup old webhooks');
    } else {
      fastify.log.info({ repositoryId }, 'Cleaned up old webhook records');
    }
  } catch (error) {
    fastify.log.error({ error, repositoryId }, 'Error cleaning up webhooks');
  }
}

/**
 * Get webhook status with GitHub verification
 */
export async function getWebhookStatus(
  fastify: FastifyInstance,
  userId: string,
  repositoryId: string,
  repoFullName: string
): Promise<'active' | 'inactive' | 'failed' | null> {
  try {
    // Get webhook from database (any status)
    const { data: webhooks, error } = await fastify.supabase
      .from('repository_webhooks')
      .select('*')
      .eq('repository_id', repositoryId)
      .eq('user_id', userId)
      .in('status', ['active', 'inactive'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !webhooks || webhooks.length === 0) {
      return null;
    }

    const webhook = webhooks[0];

    // Verify webhook exists on GitHub
    const verification = await verifyWebhookOnGitHub(
      fastify,
      userId,
      repositoryId,
      repoFullName,
      webhook.github_webhook_id
    );

    // If webhook doesn't exist on GitHub, clean it up from database
    if (!verification.exists) {
      fastify.log.info(
        { repositoryId, webhookId: webhook.id },
        'Webhook deleted on GitHub, cleaning up database'
      );

      // DELETE the record instead of updating status
      // This prevents unique constraint issues when re-registering
      await cleanupDeletedWebhook(fastify, repositoryId);

      return null;
    }

    // If webhook exists but is inactive, update database
    if (!verification.active) {
      await fastify.supabase
        .from('repository_webhooks')
        .update({ 
          status: 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('id', webhook.id);

      return 'inactive';
    }

    // Webhook is active
    return 'active';
  } catch (error: any) {
    fastify.log.error({ error, repositoryId }, 'Error getting webhook status');
    return 'failed';
  }
}

/**
 * Register GitHub webhook for a repository
 */
export async function registerGitHubWebhook(
  fastify: FastifyInstance,
  userId: string,
  repositoryId: string,
  repoFullName: string
): Promise<WebhookRegistrationResult> {
  try {
    // Get user's GitHub integration
    const integration = await getIntegration(fastify, userId, 'github');

    if (!integration || !integration.access_token) {
      return {
        success: false,
        error: 'GitHub integration not found or token missing',
      };
    }

    // Check if webhook already exists in database
    const { data: existingWebhooks } = await fastify.supabase
      .from('repository_webhooks')
      .select('*')
      .eq('repository_id', repositoryId)
      .in('status', ['active', 'inactive'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingWebhooks && existingWebhooks.length > 0) {
      const existingWebhook = existingWebhooks[0];

      // Verify it still exists on GitHub
      const verification = await verifyWebhookOnGitHub(
        fastify,
        userId,
        repositoryId,
        repoFullName,
        existingWebhook.github_webhook_id
      );

      if (verification.exists && verification.active) {
        fastify.log.info({ repositoryId }, 'Webhook already exists and is active');
        return {
          success: true,
          webhook_id: existingWebhook.github_webhook_id,
          webhook_url: existingWebhook.webhook_url,
        };
      } else {
        // Webhook was deleted or deactivated on GitHub
        // Clean up old records before creating new one
        fastify.log.info(
          { repositoryId },
          'Old webhook not found on GitHub, cleaning up before registering new one'
        );
        await cleanupDeletedWebhook(fastify, repositoryId);
      }
    }

    // Generate webhook secret
    const webhookSecret = generateWebhookSecret();
    const webhookUrl = WEBHOOK_BASE_URL;

    // Create webhook on GitHub
    const [owner, repo] = repoFullName.split('/');

    const webhookConfig: GitHubWebhookConfig = {
      name: 'web',
      active: true,
      events: ['push', 'pull_request'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: webhookSecret,
        insecure_ssl: '0',
      },
    };

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${integration.access_token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookConfig),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    const githubWebhook = await response.json();

    // Store webhook in database
    const { data: webhook, error: dbError } = await fastify.supabase
      .from('repository_webhooks')
      .insert({
        repository_id: repositoryId,
        user_id: userId,
        github_webhook_id: githubWebhook.id,
        webhook_url: webhookUrl,
        webhook_secret: webhookSecret,
        status: 'active',
        events: ['push', 'pull_request'],
      })
      .select()
      .single();

    if (dbError) {
      fastify.log.error({ dbError }, 'Failed to store webhook in database');
      
      // If unique constraint error, clean up and try again once
      if (dbError.code === '23505') {
        fastify.log.info({ repositoryId }, 'Unique constraint error, cleaning up and retrying');
        await cleanupDeletedWebhook(fastify, repositoryId);
        
        // Try insert again
        const { data: retryWebhook, error: retryError } = await fastify.supabase
          .from('repository_webhooks')
          .insert({
            repository_id: repositoryId,
            user_id: userId,
            github_webhook_id: githubWebhook.id,
            webhook_url: webhookUrl,
            webhook_secret: webhookSecret,
            status: 'active',
            events: ['push', 'pull_request'],
          })
          .select()
          .single();

        if (retryError) {
          throw retryError;
        }
      } else {
        throw dbError;
      }
    }

    fastify.log.info(
      {
        repositoryId,
        githubWebhookId: githubWebhook.id,
        repoFullName,
      },
      'GitHub webhook registered successfully'
    );

    return {
      success: true,
      webhook_id: githubWebhook.id,
      webhook_url: webhookUrl,
    };
  } catch (error: any) {
    fastify.log.error({ error, repositoryId }, 'Failed to register GitHub webhook');
    return {
      success: false,
      error: error.message || 'Failed to register webhook',
    };
  }
}

/**
 * Delete GitHub webhook for a repository
 */
export async function deleteGitHubWebhook(
  fastify: FastifyInstance,
  userId: string,
  repositoryId: string,
  repoFullName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get webhook record
    const { data: webhook } = await fastify.supabase
      .from('repository_webhooks')
      .select('*')
      .eq('repository_id', repositoryId)
      .eq('user_id', userId)
      .single();

    if (!webhook) {
      return { success: true }; // Already deleted
    }

    // Get user's GitHub integration
    const integration = await getIntegration(fastify, userId, 'github');

    if (integration?.access_token) {
      // Try to delete from GitHub
      const [owner, repo] = repoFullName.split('/');

      try {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/hooks/${webhook.github_webhook_id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `token ${integration.access_token}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (response.status === 404) {
          fastify.log.info(
            { webhookId: webhook.github_webhook_id },
            'Webhook already deleted on GitHub'
          );
        } else if (!response.ok) {
          fastify.log.warn(
            { status: response.status },
            'Failed to delete webhook from GitHub'
          );
        }
      } catch (err) {
        fastify.log.warn({ err }, 'Failed to delete webhook from GitHub (continuing)');
      }
    }

    // Delete from database (not just update status)
    await fastify.supabase
      .from('repository_webhooks')
      .delete()
      .eq('id', webhook.id);

    fastify.log.info({ repositoryId }, 'Webhook deleted from database');

    return { success: true };
  } catch (error: any) {
    fastify.log.error({ error, repositoryId }, 'Failed to delete webhook');
    return {
      success: false,
      error: error.message || 'Failed to delete webhook',
    };
  }
}

/**
 * Get repository settings
 */
export async function getRepositorySettings(
  fastify: FastifyInstance,
  repositoryId: string
): Promise<RepositorySettings | null> {
  const { data, error } = await fastify.supabase
    .from('repository_settings')
    .select('*')
    .eq('repository_id', repositoryId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as RepositorySettings;
}

/**
 * Update repository settings
 */
export async function updateRepositorySettings(
  fastify: FastifyInstance,
  repositoryId: string,
  updates: Partial<RepositorySettings>
): Promise<RepositorySettings> {
  const { data, error } = await fastify.supabase
    .from('repository_settings')
    .update(updates)
    .eq('repository_id', repositoryId)
    .select()
    .single();

  if (error || !data) {
    throw new Error('Failed to update repository settings');
  }

  return data as RepositorySettings;
}

/**
 * Check if branch should trigger a scan
 */
export async function shouldTriggerScan(
  fastify: FastifyInstance,
  repositoryId: string,
  branch: string,
  eventType: 'push' | 'pull_request'
): Promise<ScanTriggerResult> {
  const settings = await getRepositorySettings(fastify, repositoryId);

  if (!settings) {
    return {
      should_scan: false,
      reason: 'Repository settings not found',
    };
  }

  if (!settings.auto_scan_enabled) {
    return {
      should_scan: false,
      reason: 'Auto-scan is disabled for this repository',
    };
  }

  if (eventType === 'push' && !settings.scan_on_push) {
    return {
      should_scan: false,
      reason: 'Scan on push is disabled',
    };
  }

  if (eventType === 'pull_request' && !settings.scan_on_pr) {
    return {
      should_scan: false,
      reason: 'Scan on PR is disabled',
    };
  }

  // Check excluded branches
  if (settings.excluded_branches && settings.excluded_branches.length > 0) {
    const isExcluded = settings.excluded_branches.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(branch);
      }
      return pattern === branch;
    });

    if (isExcluded) {
      return {
        should_scan: false,
        reason: `Branch "${branch}" is in excluded list`,
      };
    }
  }

  // Check branch filter
  if (settings.branch_filter && settings.branch_filter.length > 0) {
    const isIncluded = settings.branch_filter.includes(branch);

    if (!isIncluded) {
      return {
        should_scan: false,
        reason: `Branch "${branch}" is not in the allowed list`,
      };
    }
  }

  return {
    should_scan: true,
    settings,
  };
}

/**
 * Extract branch name from ref
 */
export function extractBranchFromRef(ref: string): string {
  // ref format: "refs/heads/main" or "refs/tags/v1.0.0"
  if (ref.startsWith('refs/heads/')) {
    return ref.replace('refs/heads/', '');
  }
  if (ref.startsWith('refs/tags/')) {
    return ref.replace('refs/tags/', '');
  }
  return ref;
}

/**
 * Store webhook event for debugging
 */
export async function storeWebhookEvent(
  fastify: FastifyInstance,
  payload: {
    repository_id?: string;
    webhook_id?: string;
    event_type: string;
    delivery_id: string;
    payload: any;
    headers: any;
    status?: 'pending' | 'processing' | 'processed' | 'failed' | 'ignored';
    error_message?: string;
    scan_id?: string;
  }
) {
  const { error } = await fastify.supabase.from('webhook_events').insert({
    repository_id: payload.repository_id || null,
    webhook_id: payload.webhook_id || null,
    event_type: payload.event_type,
    delivery_id: payload.delivery_id,
    payload: payload.payload,
    headers: payload.headers,
    status: payload.status || 'pending',
    error_message: payload.error_message || null,
    scan_id: payload.scan_id || null,
  });

  if (error) {
    fastify.log.error({ error }, 'Failed to store webhook event');
  }
}

/**
 * Update webhook event status
 */
export async function updateWebhookEventStatus(
  fastify: FastifyInstance,
  deliveryId: string,
  status: 'processing' | 'processed' | 'failed' | 'ignored',
  options?: {
    error_message?: string;
    scan_id?: string;
  }
) {
  const updates: any = {
    status,
    processed_at: new Date().toISOString(),
  };

  if (options?.error_message) {
    updates.error_message = options.error_message;
  }

  if (options?.scan_id) {
    updates.scan_id = options.scan_id;
  }

  await fastify.supabase
    .from('webhook_events')
    .update(updates)
    .eq('delivery_id', deliveryId);
}

/**
 * Register webhooks for all active repositories in a workspace
 * @param workspaceId - Workspace ID for fetching repositories
 * @param userId - User ID for integration token lookup (legacy: integrations still keyed by user_id in some paths)
 */
export async function registerWebhooksForWorkspace(
  fastify: FastifyInstance,
  workspaceId: string,
  userId: string
): Promise<{ registered: number; failed: number }> {
  let registered = 0;
  let failed = 0;

  try {
    // Get all active repositories with auto-scan enabled in this workspace
    const { data: repos } = await fastify.supabase
      .from('repositories')
      .select('id, full_name, repository_settings!inner(*)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .eq('repository_settings.auto_scan_enabled', true);

    if (!repos || repos.length === 0) {
      return { registered: 0, failed: 0 };
    }

    for (const repo of repos) {
      // Note: registerGitHubWebhook still uses userId for integration lookup
      // This is a legacy pattern - integration should be workspace-scoped
      const result = await registerGitHubWebhook(
        fastify,
        userId,
        repo.id,
        repo.full_name
      );

      if (result.success) {
        registered++;
      } else {
        failed++;
      }
    }

    fastify.log.info(
      { workspaceId, registered, failed },
      'Bulk webhook registration completed'
    );
  } catch (error) {
    fastify.log.error({ error, workspaceId }, 'Bulk webhook registration failed');
  }

  return { registered, failed };
}

/**
 * @deprecated Use registerWebhooksForWorkspace instead
 * Register webhooks for all active repositories on user connection
 */
export async function registerWebhooksForUser(
  fastify: FastifyInstance,
  userId: string
): Promise<{ registered: number; failed: number }> {
  // Legacy: Try to find user's personal workspace
  const { data: personalWorkspace } = await fastify.supabase
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .eq('type', 'personal')
    .single();

  if (!personalWorkspace) {
    fastify.log.warn({ userId }, 'No personal workspace found for user');
    return { registered: 0, failed: 0 };
  }

  return registerWebhooksForWorkspace(fastify, personalWorkspace.id, userId);
}