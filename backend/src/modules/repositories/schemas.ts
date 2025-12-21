// src/modules/repositories/schemas.ts
import { z } from "zod";

/**
 * Query params for listing repositories
 */
export const listRepositoriesSchema = z.object({
    search: z.string().optional(),
    provider: z.enum(["github", "gitlab", "bitbucket"]).optional(),
    private: z
        .string()
        .transform((val) => val === "true")
        .optional(),
    status: z.enum(["active", "inactive", "error"]).optional(),
    page: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().int().positive())
        .optional()
        .default("1"),
    limit: z
        .string()
        .transform((val) => parseInt(val, 10))
        .pipe(z.number().int().positive().max(100))
        .optional()
        .default("20"),
});

export type ListRepositoriesInput = z.infer<typeof listRepositoriesSchema>;

/**
 * Schema for importing repositories
 */
export const importRepositoriesSchema = z.object({
    repositories: z.array(
        z.object({
            name: z.string().min(1),
            full_name: z.string().min(1),
            owner: z.string().min(1),
            private: z.boolean(),
            url: z.string().url(),
            default_branch: z.string().optional(),
            description: z.string().nullable().optional(),
        })
    ).min(1, "At least one repository must be selected"),
    provider: z.enum(["github", "gitlab", "bitbucket"]).optional().default("github"),
});

export type ImportRepositoriesInput = z.infer<typeof importRepositoriesSchema>;

/**
 * Repository ID param
 */
export const repositoryIdSchema = z.object({
    id: z.string().uuid("Invalid repository ID"),
});

/**
 * Schema for updating repository
 */
export const updateRepositorySchema = z.object({
    name: z.string().min(1).max(255).optional(),
    default_branch: z.string().min(1).max(255).optional(),
    status: z.enum(["active", "inactive", "error"]).optional(),
});

export type UpdateRepositoryInput = z.infer<typeof updateRepositorySchema>;


export const updateSettingsSchema = z.object({
    auto_scan_enabled: z.boolean().optional(),
    scan_on_push: z.boolean().optional(),
    scan_on_pr: z.boolean().optional(),
    branch_filter: z.array(z.string()).optional(),
    excluded_branches: z.array(z.string()).optional(),
    default_scan_type: z.enum(["quick", "full", "custom"]).optional(),
    auto_create_issues: z.boolean().optional(),
    issue_severity_threshold: z.enum(["critical", "high", "medium", "low"]).optional(),
    issue_labels: z.array(z.string()).optional(),
    issue_assignees: z.array(z.string()).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;