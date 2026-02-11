// src/middleware/workspace.ts
import type { FastifyRequest, FastifyReply } from "fastify";
import { ensureGitHubIntegration } from "../modules/integrations/service";
import type { WorkspaceRole } from "../types/fastify";

/**
 * Middleware: Resolve workspace from header, query param, URL param, or default to personal
 * 
 * ✅ NEW INVARIANT: After workspace resolution, if user has completed GitHub OAuth,
 * a GitHub integration MUST exist for that workspace.
 * 
 * This eliminates race conditions by ensuring integrations exist BEFORE
 * any onboarding or repository operations attempt to use them.
 * 
 * Requires loadProfile to have run first.
 */
export async function resolveWorkspace(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.supabaseUser || !request.profile) {
        request.log.debug("No user context found, skipping workspace resolution");
        return;
    }

    const userId = request.supabaseUser.id;

    // Priority: Path Param > Header > Query > Default to personal
    const params = request.params as { workspaceId?: string };
    const workspaceId =
        params?.workspaceId ||
        (request.headers['x-workspace-id'] as string) ||
        ((request.query as any)?.workspace_id as string) ||
        null;

    if (workspaceId && workspaceId !== 'undefined' && workspaceId !== 'null') {
        // Validate UUID format to prevent database errors
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(workspaceId)) {
            request.log.warn({ workspaceId, warning: "Invalid UUID format" }, "Invalid workspace ID format");
            throw request.server.httpErrors.badRequest('Invalid workspace ID format');
        }

        // Verify user has access to this workspace
        const { data: workspace, error } = await request.server.supabase
            .from('workspaces')
            .select('*')
            .eq('id', workspaceId)
            .single();

        if (error || !workspace) {
            request.log.warn({ workspaceId, error }, "Workspace not found");
            throw request.server.httpErrors.notFound('Workspace not found');
        }

        // Check access: personal workspace owner OR workspace member
        const isPersonalOwner = workspace.type === 'personal' && workspace.owner_id === userId;
        
        let userRole: WorkspaceRole = 'viewer'; 
        
        if (isPersonalOwner) {
            userRole = 'owner';
        } else {
            // Check workspace membership (works for both personal and team workspaces)
            const { data: membership } = await request.server.supabase
                .from('workspace_members')
                .select('role, status')
                .eq('workspace_id', workspaceId)
                .eq('user_id', userId)
                .eq('status', 'active')
                .single();
             
            if (!membership) {
                request.log.warn({ workspaceId, userId }, "Access denied to workspace - not a member");
                throw request.server.httpErrors.forbidden('Not a member of this workspace');
            }
             
            userRole = (membership.role as WorkspaceRole) || 'viewer';
             
            // For team workspaces, ensure plan is synced with owner's plan
            if (workspace.type === 'team' && workspace.owner_id) {
                const { data: workspaceOwner } = await request.server.supabase
                    .from('users')
                    .select('plan')
                    .eq('id', workspace.owner_id)
                    .single();
                 
                if (workspaceOwner && workspaceOwner.plan !== workspace.plan) {
                    // Sync workspace plan with owner's plan
                    request.log.info({ 
                        workspaceId, 
                        oldPlan: workspace.plan, 
                        newPlan: workspaceOwner.plan 
                    }, "Syncing team workspace plan with owner's plan");
                     
                    await request.server.supabase
                        .from('workspaces')
                        .update({ plan: workspaceOwner.plan })
                        .eq('id', workspaceId);
                     
                    workspace.plan = workspaceOwner.plan;
                }
            }
        }

        request.workspace = workspace;
        request.workspaceRole = userRole;

        request.log.debug({ 
            workspaceId: workspace.id, 
            type: workspace.type,
            role: userRole,
            plan: workspace.plan
        }, "Workspace resolved");

    } else {
        // Default: Get or create personal workspace
        let { data: personalWorkspace, error: fetchError } = await request.server.supabase
            .from('workspaces')
            .select('*')
            .eq('owner_id', userId)
            .eq('type', 'personal')
            .single();

        if (fetchError || !personalWorkspace) {
            // Check if error is "not found" before creating
            if (fetchError && fetchError.code !== 'PGRST116') {
                request.log.error({ fetchError, userId }, "Unexpected error fetching personal workspace");
                throw request.server.httpErrors.internalServerError('Failed to fetch workspace');
            }

            // Workspace doesn't exist - create it
            const { data: user } = await request.server.supabase
                .from('users')
                .select('full_name, plan')
                .eq('id', userId)
                .single();

            const workspaceName = `${user?.full_name || 'My'}'s Workspace`;
            const workspaceSlug = `user-${userId}`;

            const { data: newWorkspace, error: createError } = await request.server.supabase
                .from('workspaces')
                .insert({
                    name: workspaceName,
                    slug: workspaceSlug,
                    type: 'personal',
                    owner_id: userId,
                    plan: user?.plan || 'Free', // Inherit user plan for personal workspace
                })
                .select()
                .single();

            if (createError) {
                // Handle race condition (duplicate slug)
                if (createError.code === '23505') {
                    request.log.info({ userId }, "Workspace race condition detected, retrying fetch");
                    
                    const { data: retryWorkspace, error: retryError } = await request.server.supabase
                        .from('workspaces')
                        .select('*')
                        .eq('owner_id', userId)
                        .eq('type', 'personal')
                        .single();

                    if (retryError || !retryWorkspace) {
                        request.log.error({ retryError, userId }, "Failed to fetch workspace after retry");
                        throw request.server.httpErrors.internalServerError('Failed to resolve workspace');
                    }

                    personalWorkspace = retryWorkspace;
                } else {
                    request.log.error({ createError, userId }, "Failed to create personal workspace");
                    throw request.server.httpErrors.internalServerError('Failed to create personal workspace');
                }
            } else {
                personalWorkspace = newWorkspace!;
                request.log.info(
                    { workspaceId: personalWorkspace.id, userId },
                    "Personal workspace created"
                );
            }
        } 

        request.workspace = personalWorkspace;
        request.workspaceRole = 'owner'; // Owner of their own personal workspace
    }

    // Ensure integrations exist, optimized to use known type
    if (request.workspace) {
        await ensureGitHubIntegration(request.server, userId, request.workspace.id, request.workspace.type);
    }
}