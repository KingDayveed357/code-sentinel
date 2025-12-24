// src/modules/repositories/controller.ts - WITH WEBHOOK VALIDATION
import type { FastifyRequest, FastifyReply } from "fastify";
import * as service from "./service";
import {
    listRepositoriesSchema,
    importRepositoriesSchema,
    updateRepositorySchema,
    repositoryIdSchema,
    updateSettingsSchema, 
} from "./schemas";

import { 
    getRepositorySettings, 
    updateRepositorySettings,
    registerGitHubWebhook,
    deleteGitHubWebhook,
    getWebhookStatus, 
} from "../webhook/service";

/**
 * GET /repositories
 * List repositories with filters and pagination
 */
export async function listRepositoriesController(
    request: FastifyRequest<{ Querystring: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id; 
    const params = listRepositoriesSchema.parse(request.query);

    const result = await service.listRepositories(request.server, workspaceId, params);

    return reply.send(result);
}

/**
 * GET /repositories/providers
 * Get connected Git providers
 */
export async function getProvidersController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const providers = await service.getConnectedProviders(request.server, workspaceId);

    return reply.send(providers);
}

/**
 * GET /repositories/github/repos
 * Fetch available GitHub repositories
 */
export async function getGitHubReposController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const result = await service.fetchGitHubReposForImport(request.server, workspaceId);

    return reply.send(result);
}

/**
 * POST /repositories/import
 * Import selected repositories
 */
export async function importRepositoriesController(
    request: FastifyRequest<{ Body: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id; 
    const userPlan = request.profile!.plan;
    const { repositories, provider } = importRepositoriesSchema.parse(request.body);

    const result = await service.importRepositories(
        request.server,
        workspaceId,
        userPlan,
        repositories,
        provider
    );

    return reply.send(result);
}

/**
 * POST /repositories/sync
 * Re-sync repositories from provider
 */
export async function syncRepositoriesController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const result = await service.syncRepositories(request.server, workspaceId);

    return reply.send(result);
}

/**
 * GET /repositories/:id
 * Get single repository
 */
export async function getRepositoryController(
    request: FastifyRequest<{ Params: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);

    const repository = await service.getRepository(request.server, workspaceId, id);

    return reply.send(repository);
}

/**
 * PATCH /repositories/:id
 * Update repository settings
 */
export async function updateRepositoryController(
    request: FastifyRequest<{ Params: any; Body: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);
    const updates = updateRepositorySchema.parse(request.body);

    const repository = await service.updateRepository(
        request.server,
        workspaceId,
        id,
        updates
    );

    return reply.send(repository);
}

/**
 * DELETE /repositories/:id
 * Delete repository
 */
export async function deleteRepositoryController(
    request: FastifyRequest<{ Params: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);

    const result = await service.deleteRepository(request.server, workspaceId, id);

    return reply.send(result);
}

/**
 * GET /repositories/:id/settings
 * Get repository settings and webhook status WITH GITHUB VALIDATION
 */
export async function getRepositorySettingsController(
    request: FastifyRequest<{ Params: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);

    // Verify user owns this repository
    const repo = await service.getRepository(request.server, workspaceId, id);

    // Get settings
    const settings = await getRepositorySettings(request.server, id);

    // Get webhook status with GitHub validation
    const webhookStatus = await getWebhookStatus(
        request.server,
        workspaceId,
        id,
        repo.full_name
    );

    // Get additional webhook info if exists
    let webhookInfo = null;
    if (webhookStatus === 'active' || webhookStatus === 'inactive') {
        const { data: webhook } = await request.server.supabase
            .from('repository_webhooks')
            .select('github_webhook_id, last_delivery_status, failure_count')
            .eq('repository_id', id)
            .eq('status', webhookStatus)
            .single();

        if (webhook) {
            webhookInfo = {
                github_webhook_id: webhook.github_webhook_id,
                last_delivery_status: webhook.last_delivery_status,
                failure_count: webhook.failure_count,
            };
        }
    }

    return reply.send({
        settings: settings || {
            auto_scan_enabled: false,
            scan_on_push: true,
            scan_on_pr: false,
            branch_filter: ["main", "master"],
            excluded_branches: [],
            default_scan_type: "full",
            auto_create_issues: false,
            issue_severity_threshold: "high",
            issue_labels: ["security", "automated"],
            issue_assignees: [],
        },
        webhook_status: webhookStatus,
        webhook_info: webhookInfo,
    });
}

/**
 * PATCH /repositories/:id/settings
 * Update repository settings
 */
export async function updateRepositorySettingsController(
    request: FastifyRequest<{ Params: any; Body: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);
    const updates = updateSettingsSchema.parse(request.body);

    // Verify user owns this repository
    const repo = await service.getRepository(request.server, workspaceId, id);

    // Update settings
    const settings = await updateRepositorySettings(request.server, id, updates);

    // If auto_scan_enabled is turned on and no webhook exists, register it
    if (updates.auto_scan_enabled) {
        // Verify webhook status with GitHub
        const webhookStatus = await getWebhookStatus(
            request.server,
            workspaceId,
            id,
            repo.full_name
        );

        if (!webhookStatus || webhookStatus !== 'active') {
            request.server.log.info({ repositoryId: id }, 'Auto-registering webhook due to auto_scan_enabled');
            await registerGitHubWebhook(
                request.server,
                workspaceId,
                id,
                repo.full_name
            );
        }
    }

    return reply.send({ 
        success: true,
        settings 
    });
}

/**
 * POST /repositories/:id/webhook/register
 * Register GitHub webhook
 */
export async function registerWebhookController(
    request: FastifyRequest<{ Params: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);

    // Verify user owns this repository
    const repo = await service.getRepository(request.server, workspaceId, id);

    // Register webhook
    const result = await registerGitHubWebhook(
        request.server,
        workspaceId,
        id,
        repo.full_name
    );

    if (!result.success) {
        throw request.server.httpErrors.internalServerError(
            result.error || 'Failed to register webhook'
        );
    }

    return reply.send(result);
}

/**
 * DELETE /repositories/:id/webhook
 * Delete GitHub webhook
 */
export async function deleteWebhookController(
    request: FastifyRequest<{ Params: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;
    const { id } = repositoryIdSchema.parse(request.params);

    // Verify user owns this repository
    const repo = await service.getRepository(request.server, workspaceId, id);

    // Delete webhook
    const result = await deleteGitHubWebhook(
        request.server,
        workspaceId,
        id,
        repo.full_name
    );

    return reply.send(result);
}