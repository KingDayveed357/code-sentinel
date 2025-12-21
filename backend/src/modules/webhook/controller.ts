// src/modules/webhooks/controller.ts
// =====================================================
// Webhook Controller - Handle GitHub Webhooks
// =====================================================
import type { FastifyRequest, FastifyReply, FastifyInstance} from 'fastify';
import crypto from 'crypto';
import {
  verifyGitHubSignature,
  extractBranchFromRef,
  shouldTriggerScan,
  storeWebhookEvent,
  updateWebhookEventStatus,
  getRepositorySettings,
} from './service';
import type { GitHubPushPayload, GitHubPullRequestPayload } from './types';

/**
 * POST /webhooks/github
 * Handle incoming GitHub webhook events
 */
export async function handleGitHubWebhook(
  request: FastifyRequest<{ Body: unknown }>,
  reply: FastifyReply
) {
  const deliveryId = (request.headers['x-github-delivery'] as string) || crypto.randomUUID();
  const eventType = request.headers['x-github-event'] as string;
  const signature = request.headers['x-hub-signature-256'] as string;

  request.server.log.info(
    {
      deliveryId,
      eventType,
      hasSignature: !!signature,
    },
    'Received GitHub webhook'
  );

  try {
    // Parse payload
    const payload = request.body as any;

    if (!payload || !payload.repository) {
      request.server.log.warn({ deliveryId }, 'Invalid webhook payload - missing repository');
      return reply.status(400).send({ error: 'Invalid payload' });
    }

    // Find repository in database
    const repoFullName = payload.repository.full_name;

    const { data: repository, error: repoError } = await request.server.supabase
      .from('repositories')
      .select('id, user_id, full_name, default_branch')
      .eq('full_name', repoFullName)
      .eq('status', 'active')
      .single();

    if (repoError || !repository) {
      request.server.log.warn(
        { deliveryId, repoFullName },
        'Repository not found in database - ignoring webhook'
      );

      // Store event for debugging
      await storeWebhookEvent(request.server, {
        event_type: eventType,
        delivery_id: deliveryId,
        payload,
        headers: request.headers,
        status: 'ignored',
        error_message: 'Repository not found',
      });

      return reply.status(200).send({ received: true, action: 'ignored' });
    }

    // Get webhook record to verify signature
    const { data: webhook } = await request.server.supabase
      .from('repository_webhooks')
      .select('webhook_secret')
      .eq('repository_id', repository.id)
      .eq('status', 'active')
      .single();

    if (!webhook) {
      request.server.log.warn(
        { deliveryId, repositoryId: repository.id },
        'Webhook configuration not found'
      );

      await storeWebhookEvent(request.server, {
        repository_id: repository.id,
        event_type: eventType,
        delivery_id: deliveryId,
        payload,
        headers: request.headers,
        status: 'ignored',
        error_message: 'Webhook configuration not found',
      });

      return reply.status(200).send({ received: true, action: 'ignored' });
    }

    // Verify signature
    const payloadString = JSON.stringify(payload);
    const verification = verifyGitHubSignature(
      payloadString,
      signature,
      webhook.webhook_secret
    );

    if (!verification.valid) {
      request.server.log.error(
        {
          deliveryId,
          repositoryId: repository.id,
          error: verification.error,
        },
        'Webhook signature verification failed'
      );

      await storeWebhookEvent(request.server, {
        repository_id: repository.id,
        event_type: eventType,
        delivery_id: deliveryId,
        payload,
        headers: request.headers,
        status: 'failed',
        error_message: verification.error,
      });

      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // Store webhook event
    await storeWebhookEvent(request.server, {
      repository_id: repository.id,
      event_type: eventType,
      delivery_id: deliveryId,
      payload,
      headers: request.headers,
      status: 'processing',
    });

    // Handle different event types
    if (eventType === 'push') {
      await handlePushEvent(
        request.server,
        deliveryId,
        repository,
        payload as GitHubPushPayload
      );
    } else if (eventType === 'pull_request') {
      await handlePullRequestEvent(
        request.server,
        deliveryId,
        repository,
        payload as GitHubPullRequestPayload
      );
    } else {
      request.server.log.info({ deliveryId, eventType }, 'Ignoring non-push/PR event');
      await updateWebhookEventStatus(request.server, deliveryId, 'ignored', {
        error_message: `Event type "${eventType}" not handled`,
      });
    }

    // Update webhook delivery status
    await request.server.supabase
      .from('repository_webhooks')
      .update({
        last_delivery_status: 'success',
        last_delivery_at: new Date().toISOString(),
        failure_count: 0,
      })
      .eq('repository_id', repository.id);

    return reply.status(200).send({ received: true });
  } catch (error: any) {
    request.server.log.error({ error, deliveryId }, 'Webhook processing failed');

    await updateWebhookEventStatus(request.server, deliveryId, 'failed', {
      error_message: error.message,
    });

    // Don't return error to GitHub - prevents retries for permanent failures
    return reply.status(200).send({ received: true, error: error.message });
  }
}

/**
 * Handle push event
 */
async function handlePushEvent(
  fastify: FastifyInstance,
  deliveryId: string,
  repository: any,
  payload: GitHubPushPayload
) {
  const branch = extractBranchFromRef(payload.ref);

  fastify.log.info(
    {
      deliveryId,
      repositoryId: repository.id,
      branch,
      commitSha: payload.after,
    },
    'Processing push event'
  );

  // Check if scan should be triggered
  const triggerCheck = await shouldTriggerScan(
    fastify,
    repository.id,
    branch,
    'push'
  );

  if (!triggerCheck.should_scan) {
    fastify.log.info(
      {
        deliveryId,
        repositoryId: repository.id,
        reason: triggerCheck.reason,
      },
      'Scan not triggered'
    );

    await updateWebhookEventStatus(fastify, deliveryId, 'ignored', {
      error_message: triggerCheck.reason,
    });

    return;
  }

  // Check for duplicate scans (same commit SHA)
  const { data: existingScan } = await fastify.supabase
    .from('scans')
    .select('id')
    .eq('repository_id', repository.id)
    .eq('commit_sha', payload.after)
    .single();

  if (existingScan) {
    fastify.log.info(
      {
        deliveryId,
        commitSha: payload.after,
        existingScanId: existingScan.id,
      },
      'Duplicate scan detected - skipping'
    );

    await updateWebhookEventStatus(fastify, deliveryId, 'ignored', {
      error_message: 'Duplicate scan for commit',
      scan_id: existingScan.id,
    });

    return;
  }

  // Cancel any pending scans for the same branch
  await cancelPendingScans(fastify, repository.id, branch);

  // Create scan
  const scanType = triggerCheck.settings?.default_scan_type || 'full';
  const enabledScanners = triggerCheck.settings?.enabled_scanners || {
    sast: true,
    sca: true,
    secrets: true,
    iac: true,
    container: true,
  };

  const { data: scan, error: scanError } = await fastify.supabase
    .from('scans')
    .insert({
      user_id: repository.user_id,
      repository_id: repository.id,
      branch,
      scan_type: scanType,
      status: 'pending',
      trigger_type: 'push',
      trigger_source: deliveryId,
      commit_sha: payload.after,
      commit_message: payload.head_commit?.message || null,
      sast_enabled: enabledScanners.sast,
      sca_enabled: enabledScanners.sca,
      secrets_enabled: enabledScanners.secrets,
      iac_enabled: enabledScanners.iac,
      container_enabled: enabledScanners.container,
    })
    .select()
    .single();

  if (scanError || !scan) {
    throw new Error('Failed to create scan record');
  }

  // Create auto-scan history entry
  await fastify.supabase.from('auto_scan_history').insert({
    scan_id: scan.id,
    repository_id: repository.id,
    trigger_type: 'push',
    trigger_source: deliveryId,
    branch,
    commit_sha: payload.after,
    commit_message: payload.head_commit?.message || null,
    committer: payload.pusher?.name || null,
  });

  // Enqueue scan job
  await fastify.jobQueue.enqueue('scans', 'process-scan', {
    scanId: scan.id,
    repositoryId: repository.id,
    userId: repository.user_id,
    branch,
    scanType,
    enabledScanners,
  });

  fastify.log.info(
    {
      deliveryId,
      scanId: scan.id,
      repositoryId: repository.id,
      branch,
    },
    'Scan triggered successfully'
  );

  await updateWebhookEventStatus(fastify, deliveryId, 'processed', {
    scan_id: scan.id,
  });
}

/**
 * Handle pull request event
 */
async function handlePullRequestEvent(
  fastify: FastifyInstance,
  deliveryId: string,
  repository: any,
  payload: GitHubPullRequestPayload
) {
  // Only trigger on opened or synchronize (new commits)
  if (!['opened', 'synchronize'].includes(payload.action)) {
    fastify.log.info(
      { deliveryId, action: payload.action },
      'Ignoring PR action'
    );

    await updateWebhookEventStatus(fastify, deliveryId, 'ignored', {
      error_message: `PR action "${payload.action}" not handled`,
    });

    return;
  }

  const branch = payload.pull_request.head.ref;

  fastify.log.info(
    {
      deliveryId,
      repositoryId: repository.id,
      branch,
      prNumber: payload.pull_request.number,
    },
    'Processing pull request event'
  );

  // Check if scan should be triggered
  const triggerCheck = await shouldTriggerScan(
    fastify,
    repository.id,
    branch,
    'pull_request'
  );

  if (!triggerCheck.should_scan) {
    await updateWebhookEventStatus(fastify, deliveryId, 'ignored', {
      error_message: triggerCheck.reason,
    });

    return;
  }

  // Create scan (similar to push event)
  const scanType = triggerCheck.settings?.default_scan_type || 'full';
  const enabledScanners = triggerCheck.settings?.enabled_scanners || {
    sast: true,
    sca: true,
    secrets: true,
    iac: true,
    container: true,
  };

  const { data: scan, error: scanError } = await fastify.supabase
    .from('scans')
    .insert({
      user_id: repository.user_id,
      repository_id: repository.id,
      branch,
      scan_type: scanType,
      status: 'pending',
      trigger_type: 'pull_request',
      trigger_source: `PR#${payload.pull_request.number}`,
      commit_sha: payload.pull_request.head.sha,
      commit_message: payload.pull_request.title,
      sast_enabled: enabledScanners.sast,
      sca_enabled: enabledScanners.sca,
      secrets_enabled: enabledScanners.secrets,
      iac_enabled: enabledScanners.iac,
      container_enabled: enabledScanners.container,
    })
    .select()
    .single();

  if (scanError || !scan) {
    throw new Error('Failed to create scan record');
  }

  // Create auto-scan history
  await fastify.supabase.from('auto_scan_history').insert({
    scan_id: scan.id,
    repository_id: repository.id,
    trigger_type: 'pull_request',
    trigger_source: `PR#${payload.pull_request.number}`,
    branch,
    commit_sha: payload.pull_request.head.sha,
    commit_message: payload.pull_request.title,
  });

  // Enqueue scan job
  await fastify.jobQueue.enqueue('scans', 'process-scan', {
    scanId: scan.id,
    repositoryId: repository.id,
    userId: repository.user_id,
    branch,
    scanType,
    enabledScanners,
  });

  fastify.log.info(
    {
      deliveryId,
      scanId: scan.id,
      prNumber: payload.pull_request.number,
    },
    'PR scan triggered successfully'
  );

  await updateWebhookEventStatus(fastify, deliveryId, 'processed', {
    scan_id: scan.id,
  });
}

/**
 * Cancel pending scans for a branch
 */
async function cancelPendingScans(
  fastify: FastifyInstance,
  repositoryId: string,
  branch: string
) {
  const { data: pendingScans } = await fastify.supabase
    .from('scans')
    .select('id')
    .eq('repository_id', repositoryId)
    .eq('branch', branch)
    .in('status', ['pending', 'running']);

  if (pendingScans && pendingScans.length > 0) {
    await fastify.supabase
      .from('scans')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .in(
        'id',
        pendingScans.map((s) => s.id)
      );

    fastify.log.info(
      {
        repositoryId,
        branch,
        cancelledCount: pendingScans.length,
      },
      'Cancelled pending scans'
    );
  }
}