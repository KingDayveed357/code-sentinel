// // middleware/workspace.ts (FIXED)

// import type { FastifyRequest, FastifyReply } from "fastify";

// /**
//  * Middleware: Resolve workspace from header, query param, or default to personal
//  * Attaches workspace to request
//  * Requires loadProfile to have run first
//  * 
//  * ✅ FIXED: Proper race condition handling
//  */
// export async function resolveWorkspace(
//     request: FastifyRequest,
//     reply: FastifyReply
// ) {
//     if (!request.profile) {
//         request.log.debug("No profile found, skipping workspace resolution");
//         return;
//     }

//     const userId = request.profile.id;

//     // Priority: Header > Query > Default to personal
//     const workspaceId =
//         (request.headers['x-workspace-id'] as string) ||
//         ((request.query as any)?.workspace_id as string) ||
//         null;

//     if (workspaceId) {
//         // Verify user has access to this workspace
//         const { data: workspace, error } = await request.server.supabase
//             .from('workspaces')
//             .select(`
//                 *,
//                 team:teams!workspaces_team_id_fkey(
//                     id,
//                     team_members!inner(user_id, status)
//                 )
//             `)
//             .eq('id', workspaceId)
//             .single();

//         if (error || !workspace) {
//             request.log.warn({ workspaceId, error }, "Workspace not found");
//             throw request.server.httpErrors.notFound('Workspace not found');
//         }

//         // Check access: personal workspace owner OR team member
//         const isPersonalOwner = workspace.type === 'personal' && workspace.owner_id === userId;
//         const isTeamMember = workspace.type === 'team' && 
//             workspace.team?.team_members?.some((m: any) => m.user_id === userId && m.status === 'active');

//         if (!isPersonalOwner && !isTeamMember) {
//             request.log.warn({ workspaceId, userId }, "Access denied to workspace");
//             throw request.server.httpErrors.forbidden('Access denied to workspace');
//         }

//         request.workspace = workspace;
//         request.log.debug({ workspaceId: workspace.id, type: workspace.type }, "Workspace resolved");
//     } else {
//         // Default: Get or create personal workspace
//         let { data: personalWorkspace, error: fetchError } = await request.server.supabase
//             .from('workspaces')
//             .select('*')
//             .eq('owner_id', userId)
//             .eq('type', 'personal')
//             .single();

//         if (fetchError || !personalWorkspace) {
//             // ✅ CRITICAL FIX: Check if error is "not found" before creating
//             if (fetchError && fetchError.code !== 'PGRST116') {
//                 // PGRST116 = no rows returned (expected for new users)
//                 // Any other error is unexpected
//                 request.log.error({ fetchError, userId }, "Unexpected error fetching workspace");
//                 throw request.server.httpErrors.internalServerError('Failed to fetch workspace');
//             }

//             // Workspace doesn't exist - create it
//             const { data: user } = await request.server.supabase
//                 .from('users')
//                 .select('full_name, plan')
//                 .eq('id', userId)
//                 .single();

//             const workspaceName = `${user?.full_name || 'My'}'s Workspace`;
//             const workspaceSlug = `user-${userId}`;

//             const { data: newWorkspace, error: createError } = await request.server.supabase
//                 .from('workspaces')
//                 .insert({
//                     name: workspaceName,
//                     slug: workspaceSlug,
//                     type: 'personal',
//                     owner_id: userId,
//                     plan: user?.plan || 'Free',
//                 })
//                 .select()
//                 .single();

//             if (createError) {
//                 // ✅ CRITICAL FIX: Handle race condition (duplicate slug)
//                 if (createError.code === '23505') {
//                     // Duplicate key - workspace was created by concurrent request
//                     // Retry fetching it
//                     request.log.info({ userId }, "Workspace created by concurrent request, retrying fetch");
                    
//                     const { data: retryWorkspace, error: retryError } = await request.server.supabase
//                         .from('workspaces')
//                         .select('*')
//                         .eq('owner_id', userId)
//                         .eq('type', 'personal')
//                         .single();

//                     if (retryError || !retryWorkspace) {
//                         request.log.error({ retryError, userId }, "Failed to fetch workspace after race condition");
//                         throw request.server.httpErrors.internalServerError('Failed to resolve workspace');
//                     }

//                     personalWorkspace = retryWorkspace;
//                     request.workspace = personalWorkspace;
//                     request.log.info(
//                         { workspaceId: personalWorkspace.id, userId },
//                         "Personal workspace resolved after race condition"
//                     );
//                     return;
//                 }

//                 // Other error - fail
//                 request.log.error({ createError, userId }, "Failed to create personal workspace");
//                 throw request.server.httpErrors.internalServerError('Failed to create personal workspace');
//             }

//             personalWorkspace = newWorkspace!;
//             request.log.info(
//                 { workspaceId: personalWorkspace.id, userId },
//                 "Personal workspace created successfully"
//             );
//         } else {
//             request.log.debug(
//                 { workspaceId: personalWorkspace.id },
//                 "Existing personal workspace resolved"
//             );
//         }

//         request.workspace = personalWorkspace;
//     }
// }




// middleware/workspace.ts (ENHANCED WITH INTEGRATION INVARIANT)

import type { FastifyRequest, FastifyReply } from "fastify";
import { ensureGitHubIntegration } from "../modules/integrations/helper";

/**
 * Middleware: Resolve workspace from header, query param, or default to personal
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
    if (!request.profile) {
        request.log.debug("No profile found, skipping workspace resolution");
        return;
    }

    const userId = request.profile.id;

    // Priority: Header > Query > Default to personal
    const workspaceId =
        (request.headers['x-workspace-id'] as string) ||
        ((request.query as any)?.workspace_id as string) ||
        null;

    if (workspaceId) {
        // Verify user has access to this workspace
        const { data: workspace, error } = await request.server.supabase
            .from('workspaces')
            .select(`
                *,
                team:teams!workspaces_team_id_fkey(
                    id,
                    team_members!inner(user_id, status)
                )
            `)
            .eq('id', workspaceId)
            .single();

        if (error || !workspace) {
            request.log.warn({ workspaceId, error }, "Workspace not found");
            throw request.server.httpErrors.notFound('Workspace not found');
        }

        // Check access: personal workspace owner OR team member
        const isPersonalOwner = workspace.type === 'personal' && workspace.owner_id === userId;
        const isTeamMember = workspace.type === 'team' && 
            workspace.team?.team_members?.some((m: any) => m.user_id === userId && m.status === 'active');

        if (!isPersonalOwner && !isTeamMember) {
            request.log.warn({ workspaceId, userId }, "Access denied to workspace - not a member");
            throw request.server.httpErrors.forbidden('Not a member of this workspace');
        }

        // Attach user's role for authorization checks
        if (workspace.type === 'team') {
            const membership = workspace.team?.team_members?.find((m: any) => m.user_id === userId);
            (request as any).userRole = membership?.role || 'member';
        } else {
            (request as any).userRole = 'owner';
        }

        request.workspace = workspace;
        request.log.debug({ 
            workspaceId: workspace.id, 
            type: workspace.type,
            userRole: (request as any).userRole
        }, "Workspace resolved with authorization");
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
                request.log.error({ fetchError, userId }, "Unexpected error fetching workspace");
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
                    plan: user?.plan || 'Free',
                })
                .select()
                .single();

            if (createError) {
                // Handle race condition (duplicate slug)
                if (createError.code === '23505') {
                    request.log.info({ userId }, "Workspace created by concurrent request, retrying fetch");
                    
                    const { data: retryWorkspace, error: retryError } = await request.server.supabase
                        .from('workspaces')
                        .select('*')
                        .eq('owner_id', userId)
                        .eq('type', 'personal')
                        .single();

                    if (retryError || !retryWorkspace) {
                        request.log.error({ retryError, userId }, "Failed to fetch workspace after race condition");
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
                    "Personal workspace created successfully"
                );
            }
        } else {
            request.log.debug(
                { workspaceId: personalWorkspace.id },
                "Existing personal workspace resolved"
            );
        }

        request.workspace = personalWorkspace;
    }

    // ✅ CRITICAL INVARIANT ENFORCEMENT
    // After workspace is resolved, ensure GitHub integration exists if user has OAuth token
    // This happens BEFORE any route handler runs, eliminating race conditions
    await ensureGitHubIntegration(request.server, userId, request.workspace!.id);
}