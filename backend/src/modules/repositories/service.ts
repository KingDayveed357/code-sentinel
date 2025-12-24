// src/modules/repositories/service.ts
import type { FastifyInstance } from "fastify";
import type { RepositoryImportInput, DatabaseRepository } from "../integrations/github/types";
import * as githubService from "../integrations/github/service";
import { getRepositoryLimits } from "./validation";
import { validateRepositoryImport } from "./validation";
import { EntitlementsService } from "../entitlements/service";

/**
 * Import repositories
 */
export async function importRepositories(
    fastify: FastifyInstance,
    workspaceId: string,
    userPlan: string,
    repositories: RepositoryImportInput[],
    provider: "github" | "gitlab" | "bitbucket" = "github"
): Promise<{ success: boolean; imported: number; skipped: number; limit_reached: boolean }> {
    try {
        // Validate import against plan limits
        const validation = await validateRepositoryImport(
            fastify,
            workspaceId,
            userPlan,
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
    } = {}
): Promise<{
    repositories: DatabaseRepository[];
    total: number;
    limit: number;
    offset: number;
}> {
    const { search, provider, private: isPrivate, status, limit = 20, offset = 0 } = options;

    let query = fastify.supabase
        .from("repositories")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

    if (search) {
        query = query.or(`name.ilike.%${search}%,full_name.ilike.%${search}%`);
    }

    if (provider) {
        query = query.eq("provider", provider);
    }

    if (isPrivate !== undefined) {
        query = query.eq("private", isPrivate);
    }

    if (status) {
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
    repoId: string
): Promise<DatabaseRepository> {
    const { data, error } = await fastify.supabase
        .from("repositories")
        .select("*")
        .eq("id", repoId)
        .eq("workspace_id", workspaceId)
        .single();

    if (error || !data) {
        throw fastify.httpErrors.notFound("Repository not found");
    }

    return data as DatabaseRepository;
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
    }
): Promise<DatabaseRepository> {
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
    }
) {
    const { page = 1, limit = 20, ...filters } = params;
    const offset = (page - 1) * limit;

    const result = await getWorkspaceRepositories(fastify, workspaceId, {
        ...filters,
        limit,
        offset,
    });

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
            githubAccount = await githubService.getGitHubAccountInfo(fastify, workspaceId);
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
    // Fetch from GitHub API
    const repositories = await githubService.fetchGitHubRepositories(fastify, workspaceId);

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
    userPlan: string,
    repositories: RepositoryImportInput[],
    provider: "github" | "gitlab" | "bitbucket" = "github"
) {
    const result = await importRepositories(
        fastify,
        workspaceId,
        userPlan,
        repositories,
        provider
    );

    // Get updated count and limits
    const repoCount = await getRepositoryCount(fastify, workspaceId);
    const limits = getRepositoryLimits(userPlan);

    return {
        ...result,
        repository_count: repoCount,
        limit: limits.limit,
        unlimited: limits.unlimited,
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
    repoId: string
): Promise<DatabaseRepository> {
    return await getRepositoryById(fastify, workspaceId, repoId);
}