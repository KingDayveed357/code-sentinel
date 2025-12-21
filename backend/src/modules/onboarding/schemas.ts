// src/modules/onboarding/schemas.ts
import { z } from "zod";

/**
 * Schema for saving onboarding step data
 */
export const saveOnboardingStepSchema = z.object({
    stepData: z.record(z.any()).optional(),
});

export type SaveOnboardingStepInput = z.infer<typeof saveOnboardingStepSchema>;

/**
 * Schema for updating user preferences
 */
export const updatePreferencesSchema = z.object({
    autoScan: z.boolean().optional(),
    pullRequests: z.boolean().optional(),
    slackNotifications: z.boolean().optional(),
    weeklyReports: z.boolean().optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/**
 * Schema for saving repositories
 */
export const saveRepositoriesSchema = z.object({
    provider: z.enum(["github", "gitlab", "bitbucket"]).default("github"),
    repositories: z.array(
        z.object({
            name: z.string(),
            owner: z.string(),
            full_name: z.string(),
            url: z.string().url(),
            private: z.boolean().default(false),
            default_branch: z.string().optional(),
            description: z.string().nullable().optional(),
        })
    ),
});


export type SaveRepositoriesInput = z.infer<typeof saveRepositoriesSchema>;