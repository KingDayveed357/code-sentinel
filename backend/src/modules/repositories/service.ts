// src/modules/repositories/service.ts
import type { FastifyInstance } from "fastify";
import type { RepositoryImportInput, DatabaseRepository } from "../integrations/github/types";
// import * as githubService from "../integrations/github/service";
import { GitHubService } from "../integrations/github/service";
import { getRepositoryLimits } from "./validation";
import { validateRepositoryImport } from "./validation";
import { EntitlementsService } from "../entitlements/service";
import { IntegrationsRepository } from "../integrations/repository";
import { logActivity } from "../../utils/activity-logger";

/**
 * Import repositories
 */


export async function importRepositories(
    fastify: FastifyInstance,
    workspaceId: string,
    repositories: RepositoryImportInput[],
    provider: "github" | "gitlab" | "bitbucket" = "github"
): Promise<{ success: boolean; imported: number; skipped: number; limit_reached: boolean }> {
    try {
        // Validate import against plan limits
        const validation = await validateRepositoryImport(
            fastify,
            workspaceId,
            repositories.length
        );

        if (!validation.allowed) {
            throw fastify.httpErrors.forbidden(validation.message);
        }

        // Get existing repos to avoid duplicates
        const { data: existingRepos } = await fastify.supabase
            .from("repositories")
            .select("url")
            .eq("workspace_id", workspaceId)
            .in(
                "url",
                repositories.map((r) => r.url)
            );

        const existingUrls = new Set(existingRepos?.map((r) => r.url) || []);
        const newRepos = repositories.filter((repo) => !existingUrls.has(repo.url));

        if (newRepos.length === 0) {
            return {
                success: true,
                imported: 0,
                skipped: repositories.length,
                limit_reached: false,
            };
        }

        const reposToImport = newRepos.slice(0, validation.allowed_count);
        const limitReached = reposToImport.length < newRepos.length;

        // Map to database schema - NOW WITH workspace_id
        const reposToInsert = reposToImport.map((repo) => ({
            workspace_id: workspaceId,
            name: repo.name,
            full_name: repo.full_name,
            owner: repo.owner,
            private: repo.private,
            url: repo.url,
            default_branch: repo.default_branch || "main",
            provider: provider,
            status: "active" as const,
        }));

        const { error } = await fastify.supabase
            .from("repositories")
            .insert(reposToInsert);

        if (error) {
            fastify.log.error({ error, workspaceId, provider }, "Database insert failed");
            throw error;
        }

        return {
            success: true,
            imported: reposToInsert.length,
            skipped: repositories.length - newRepos.length,
            limit_reached: limitReached,
        };
    } catch (error: any) {
        fastify.log.error({ error, workspaceId, provider }, "Failed to import repositories");
        
        // If it's already an HTTP error (like our 403), re-throw it
        if (error.statusCode) {
            throw error;
        }
        
        throw fastify.httpErrors.internalServerError("Failed to import repositories");
    }
}

/**
 * Get all repositories for a workspace - CHANGED FROM userId
 */
export async function getWorkspaceRepositories(
    fastify: FastifyInstance,
    workspaceId: string,
    options: {
        search?: string;
        provider?: string;
        private?: boolean;
        status?: string;
        limit?: number;
        offset?: number;
    } = {},
    userContext?: { userId: string; role: string }
): Promise<{
    repositories: DatabaseRepository[];
    total: number;
    limit: number;
    offset: number;
}> {
    const { search, provider, private: isPrivate, status, limit = 20, offset = 0, view } = options;

    // ✅ FIX: Check if status is a scan status (not a repository status)
    const scanStatuses = ["completed", "running", "normalizing", "ai_enriching", "failed", "pending", "cancelled", "never_scanned", "processing"];
    const repositoryStatuses = ["active", "inactive", "error"];
    const isScanStatus = status && scanStatuses.includes(status);
    const isRepositoryStatus = status && repositoryStatuses.includes(status);

    // For scan status filtering, we need to use a different approach
    if (isScanStatus) {
        return filterRepositoriesByScanStatus(
            fastify,
            workspaceId,
            { search, provider, private: isPrivate, status, limit, offset }
        );
    }

    let query = fastify.supabase
        .from("repositories")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

    /**
     * ✅ RBAC / View Filter Logic:
     * 1. 'developer' role ALWAYS sees only assigned projects.
     * 2. Other roles (owner, admin, viewer) see all by default, but can filter by 'assigned'.
     */
    const forceAssigned = userContext?.role === 'viewer' || view === 'assigned';

    if (forceAssigned) {
        const { data: assignments } = await fastify.supabase
            .from('project_members')
            .select('project_id')
            .eq('user_id', userContext?.userId);
            
        const assignedIds = (assignments || []).map(a => a.project_id);
        
        if (assignedIds.length === 0) {
            // No assignments -> return empty result immediately
            return {
                repositories: [],
                total: 0,
                limit,
                offset
            };
        }
        
        query = query.in('id', assignedIds);
    }

    if (search) {
        query = query.or(`name.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    if (provider) {
        query = query.eq("provider", provider);
    }

    if (isPrivate !== undefined) {
        query = query.eq("private", isPrivate);
    }

    if (isRepositoryStatus) {
        query = query.eq("status", status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        fastify.log.error({ error, workspaceId }, "Failed to fetch repositories");
        throw fastify.httpErrors.internalServerError("Failed to fetch repositories");
    }

    return {
        repositories: (data as DatabaseRepository[]) || [],
        total: count || 0,
        limit,
        offset,
    };
}

/**
 * Filter repositories by their latest scan status
 */
async function filterRepositoriesByScanStatus(
    fastify: FastifyInstance,
    workspaceId: string,
    options: {
        search?: string;
        provider?: string;
        private?: boolean;
        status?: string;
        limit: number;
        offset: number;
    }
): Promise<{
    repositories: DatabaseRepository[];
    total: number;
    limit: number;
    offset: number;
}> {
    const { search, provider, private: isPrivate, status, limit, offset } = options;

    // Step 1: Get all repositories with their latest scan status (ordered by scan date desc)
    let repoQuery = fastify.supabase
        .from("repositories")
        .select("*, scans:scans(status, created_at) order by scans(created_at.desc) limit 1")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

    if (search) {
        repoQuery = repoQuery.or(`name.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    if (provider) {
        repoQuery = repoQuery.eq("provider", provider);
    }

    if (isPrivate !== undefined) {
        repoQuery = repoQuery.eq("private", isPrivate);
    }

    const { data: repos, error: repoError } = await repoQuery;

    if (repoError) {
        fastify.log.error({ error: repoError, workspaceId }, "Failed to fetch repositories with scans");
        throw fastify.httpErrors.internalServerError("Failed to fetch repositories");
    }

    // Step 2: Filter repositories based on their latest scan status
    let filteredRepos = (repos || []) as any[];

    if (status) {
        filteredRepos = filteredRepos.filter((repo) => {
            const scans = repo.scans as any[];
            
            if (status === "never_scanned") {
                return !scans || scans.length === 0;
            }

            if (scans && scans.length > 0) {
                const latestScan = scans[0]; // Already limited to 1 with most recent first
                return latestScan.status === status;
            }

            return false;
        });
    }

    // Step 3: Apply pagination to filtered results
    const total = filteredRepos.length;
    const paginatedRepos = filteredRepos.slice(offset, offset + limit);

    return {
        repositories: paginatedRepos as DatabaseRepository[],
        total,
        limit,
        offset,
    };
}

/**
 * Get all repositories for a user
 */
// export async function getUserRepositories(
//     fastify: FastifyInstance,
//     userId: string,
//     options: {
//         search?: string;
//         provider?: string;
//         private?: boolean;
//         status?: string;
//         limit?: number;
//         offset?: number;
//     } = {}
// ): Promise<{
//     repositories: DatabaseRepository[];
//     total: number;
//     limit: number;
//     offset: number;
// }> {
//     const { search, provider, private: isPrivate, status, limit = 20, offset = 0 } = options;

//     let query = fastify.supabase
//         .from("repositories")
//         .select("*", { count: "exact" })
//         .eq("user_id", userId)
//         .order("created_at", { ascending: false });

//     // Apply filters
//     if (search) {
//         query = query.or(`name.ilike.%${search}%,full_name.ilike.%${search}%`);
//     }

//     if (provider) {
//         query = query.eq("provider", provider);
//     }

//     if (isPrivate !== undefined) {
//         query = query.eq("private", isPrivate);
//     }

//     if (status) {
//         query = query.eq("status", status);
//     }

//     // Apply pagination
//     query = query.range(offset, offset + limit - 1);

//     const { data, error, count } = await query;

//     if (error) {
//         fastify.log.error({ error, userId }, "Failed to fetch repositories");
//         throw fastify.httpErrors.internalServerError("Failed to fetch repositories");
//     }

//     return {
//         repositories: (data as DatabaseRepository[]) || [],
//         total: count || 0,
//         limit,
//         offset,
//     };
// }

/**
 * Get a single repository by ID
 */
export async function getRepositoryById(
    fastify: FastifyInstance,
    workspaceId: string,
    repoId: string,
    userContext?: { userId: string; role: string }
): Promise<DatabaseRepository> {
    const { data: repo, error } = await fastify.supabase
        .from("repositories")
        .select("*")
        .eq("id", repoId)
        .eq("workspace_id", workspaceId)
        .single();

    if (error || !repo) {
        throw fastify.httpErrors.notFound("Repository not found");
    }

    if (userContext?.role === 'developer') {
         const { data: assignment } = await fastify.supabase
            .from('project_members')
            .select('id')
            .eq('project_id', repoId)
            .eq('user_id', userContext.userId)
            .single();

        if (!assignment) {
             throw fastify.httpErrors.notFound("Repository not found"); // Hide existence
        }
    }

    return repo as DatabaseRepository;
}

/**
 * Delete a repository - VERIFY workspace ownership
 */
export async function deleteRepository(
    fastify: FastifyInstance,
    workspaceId: string,
    repoId: string
): Promise<{ success: boolean }> {
    const { error } = await fastify.supabase
        .from("repositories")
        .delete()
        .eq("id", repoId)
        .eq("workspace_id", workspaceId);

    if (error) {
        fastify.log.error({ error, workspaceId, repoId }, "Failed to delete repository");
        throw fastify.httpErrors.internalServerError("Failed to delete repository");
    }

    return { success: true };
}

/**
 * Update repository settings - VERIFY workspace ownership
 */
export async function updateRepository(
    fastify: FastifyInstance,
    workspaceId: string,
    repoId: string,
    updates: {
        name?: string;
        default_branch?: string;
        status?: "active" | "inactive" | "error";
    },
    userContext?: { userId: string; role: string }
): Promise<DatabaseRepository> {
    
    // Check access first if needed
    if (userContext?.role === 'viewer') {
         const { data: assignment } = await fastify.supabase
            .from('project_members')
            .select('id')
            .eq('project_id', repoId)
            .eq('user_id', userContext.userId)
            .single();

        if (!assignment) {
             throw fastify.httpErrors.notFound("Repository not found");
        }
    }
    const updateData = {
        ...updates,
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await fastify.supabase
        .from("repositories")
        .update(updateData)
        .eq("id", repoId)
        .eq("workspace_id", workspaceId)
        .select()
        .single();

    if (error || !data) {
        fastify.log.error({ error, workspaceId, repoId }, "Failed to update repository");
        throw fastify.httpErrors.internalServerError("Failed to update repository");
    }

    return data as DatabaseRepository;
}

/**
 * Get repository count for a user
 */
export async function getRepositoryCount(
    fastify: FastifyInstance,
    workspaceId: string
): Promise<number> {
    const { count, error } = await fastify.supabase
        .from("repositories")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);

    if (error) {
        fastify.log.error({ error, workspaceId }, "Failed to count repositories");
        return 0;
    }

    return count || 0;
}
/**
 * List repositories with filters and pagination
 */
export async function listRepositories(
    fastify: FastifyInstance,
    workspaceId: string,
    params: {
        search?: string;
        provider?: string;
        private?: boolean;
        status?: string;
        page?: number;
        limit?: number;
        view?: 'all' | 'assigned';
    },
    userContext?: { userId: string; role: string }
) {
    const { page = 1, limit = 20, ...filters } = params;
    const offset = (page - 1) * limit;

    const result = await getWorkspaceRepositories(fastify, workspaceId, {
        ...filters,
        limit,
        offset,
    }, userContext);

    return {
        ...result,
        page,
        pages: Math.ceil(result.total / limit),
    };
}

/**
 * Get connected Git providers
 */
export async function getConnectedProviders(
    fastify: FastifyInstance,
    workspaceId: string
) {
    const integrationsRepo = new IntegrationsRepository(fastify);
    
    // 2. Instantiate the service
    const gitHubService = new GitHubService(integrationsRepo, fastify);

    const { data: integrations, error } = await fastify.supabase
        .from("integrations")
        .select("provider, connected, connected_at")
        .eq("workspace_id", workspaceId);

    if (error) {
        fastify.log.error({ error, workspaceId }, "Failed to fetch integrations");
        throw fastify.httpErrors.internalServerError("Failed to fetch providers");
    }

    // Get GitHub account info if connected
    const githubIntegration = integrations?.find((i) => i.provider === "github");
    let githubAccount = null;

    if (githubIntegration?.connected) {
        try {
            githubAccount = await gitHubService.getGitHubAccountInfo(workspaceId);
        } catch (err) {
            fastify.log.warn({ err, workspaceId }, "Failed to fetch GitHub account info");
        }
    }

    return {
        providers: [
            {
                id: "github",
                name: "GitHub",
                connected: githubIntegration?.connected || false,
                connected_at: githubIntegration?.connected_at || null,
                account: githubAccount,
            },
            {
                id: "gitlab",
                name: "GitLab",
                connected: false,
                coming_soon: true,
            },
            {
                id: "bitbucket",
                name: "Bitbucket",
                connected: false,
                coming_soon: true,
            },
        ],
    };
}

/**
 * Fetch GitHub repositories for import
 */
export async function fetchGitHubReposForImport(
    fastify: FastifyInstance,
    workspaceId: string
) {
    // Instantiate GitHub service
    const integrationsRepo = new IntegrationsRepository(fastify);
    const gitHubService = new GitHubService(integrationsRepo, fastify);

    // Fetch from GitHub API
    const repositories = await gitHubService.fetchRepositories(workspaceId);

    // Get already imported repos
    const { data: importedRepos } = await fastify.supabase
        .from("repositories")
        .select("url")
        .eq("workspace_id", workspaceId);

    const importedUrls = new Set(importedRepos?.map((r) => r.url) || []);

    // Mark repos as already imported
    const reposWithStatus = repositories.map((repo) => ({
        ...repo,
        already_imported: importedUrls.has(repo.url),
    }));

    return {
        repositories: reposWithStatus,
        total: repositories.length,
        already_imported: reposWithStatus.filter((r) => r.already_imported).length,
    };
}

/**
 * Import repositories with enriched response
 */
export async function importRepositoriesWithLimits(
    fastify: FastifyInstance,
    workspaceId: string,
    repositories: RepositoryImportInput[],
    provider: "github" | "gitlab" | "bitbucket" = "github"
) {
    const result = await importRepositories(
        fastify,
        workspaceId,
        repositories,
        provider
    );

    // Get updated count and limits
    const repoCount = await getRepositoryCount(fastify, workspaceId);
    
    const entitlements = new EntitlementsService(fastify);
    const usage = await entitlements.getWorkspaceUsage(workspaceId);
    const limit = usage.limits.repositories ?? Infinity;

    return {
        ...result,
        repository_count: repoCount,
        limit: limit,
        unlimited: limit === Infinity,
    };
}

/**
 * Sync repositories (re-fetch metadata from GitHub)
 */
export async function syncRepositories(
    fastify: FastifyInstance,
    workspaceId: string
) {
    // This is a placeholder for future sync functionality
    // Could re-fetch branch info, update descriptions, etc.
    fastify.log.info({ workspaceId }, "Repository sync requested");

    return {
        success: true,
        message: "Sync feature coming soon",
    };
}

/**
 * Get single repository (alias for consistency)
 */
export async function getRepository(
    fastify: FastifyInstance,
    workspaceId: string,
    repoId: string,
    userContext?: { userId: string; role: string }
): Promise<DatabaseRepository> {
    return await getRepositoryById(fastify, workspaceId, repoId, userContext);
}

/**
 * Get members assigned to a project
 */
export async function getProjectMembers(
    fastify: FastifyInstance,
    workspaceId: string,
    projectId: string
) {
    const { data: assignments, error } = await fastify.supabase
        .from('project_members')
        .select('id, user_id, assigned_by, created_at')
        .eq('project_id', projectId)
        .eq('workspace_id', workspaceId);

    if (error) {
        fastify.log.error({ error, projectId }, 'Failed to fetch project members');
        throw fastify.httpErrors.internalServerError('Failed to fetch project members');
    }

    if (!assignments || assignments.length === 0) {
        return [];
    }

    const userIds = Array.from(new Set(assignments.map((assignment: any) => assignment.user_id)));

    const { data: users, error: usersError } = await fastify.supabase
        .from('users')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds);

    if (usersError) {
        fastify.log.error({ usersError, projectId }, 'Failed to fetch users for project members');
        throw fastify.httpErrors.internalServerError('Failed to fetch project members');
    }

    const usersById = new Map((users || []).map((user: any) => [user.id, user]));

    return assignments.map((assignment: any) => ({
        ...assignment,
        user: usersById.get(assignment.user_id) || null,
    }));
}

/**
 * Assign a member to a project
 */
export async function assignProjectMember(
    fastify: FastifyInstance,
    workspaceId: string,
    projectId: string,
    userId: string,
    assignedBy: string
) {
    // 1. Verify user is a member of the workspace
    const { data: member, error: memberError } = await fastify.supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

    if (memberError || !member) {
        throw fastify.httpErrors.badRequest('User is not an active member of this workspace');
    }

    // 2. Insert assignment
    const { data, error } = await fastify.supabase
        .from('project_members')
        .insert({
            project_id: projectId,
            user_id: userId,
            workspace_id: workspaceId,
            assigned_by: assignedBy
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            throw fastify.httpErrors.conflict('User is already assigned to this project');
        }
        fastify.log.error({ error, projectId, userId }, 'Failed to assign project member');
        throw fastify.httpErrors.internalServerError('Failed to assign project member');
    }

    // Audit log — fire-and-forget
    logActivity(fastify, {
        workspaceId,
        actorId: assignedBy,
        action: 'project.member_assigned',
        resourceType: 'project_member',
        resourceId: projectId,
        metadata: { user_id: userId, project_id: projectId },
    });

    return data;
}

/**
 * Remove a member from a project
 */
export async function removeProjectMember(
    fastify: FastifyInstance,
    workspaceId: string,
    projectId: string,
    userId: string
) {
    const { error } = await fastify.supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId);

    if (error) {
        fastify.log.error({ error, projectId, userId }, 'Failed to remove project member');
        throw fastify.httpErrors.internalServerError('Failed to remove project member');
    }

    // Audit log — fire-and-forget
    logActivity(fastify, {
        workspaceId,
        actorId: null,
        action: 'project.member_removed',
        resourceType: 'project_member',
        resourceId: projectId,
        metadata: { user_id: userId, project_id: projectId },
    });

    return { success: true };
}
