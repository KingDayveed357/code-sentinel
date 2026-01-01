// src/env.ts
// @ts-ignore
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    PORT: z.string().optional().default("3000"),
    NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string(),
    // NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
    NEXT_PUBLIC_FRONTEND_URL: z.string().url(),
    GITHUB_APP_STATE_SECRET: z.string()
    .min(32, "GITHUB_APP_STATE_SECRET must be at least 32 characters")
    .optional()
    .transform(val => val || process.env.GITHUB_APP_PRIVATE_KEY_PATH),
    // STRIPE_SECRET_KEY: z.string().optional(),
    // PAYSTACK_SECRET_KEY: z.string().optional(),
    // OPENAI_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    SEMGREP_API_KEY: z.string().optional(),
    REDIS_URL: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),  
    EMAIL_REPLY_TO: z.string().email().optional(),
    RESEND_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    WEBHOOK_BASE_URL: z.string().url().optional(),
    GITHUB_APP_SLUG: z.string().optional(),
    GITHUB_APP_ID: z.string().optional(),
    GITHUB_APP_PRIVATE_KEY_PATH: z.string().optional(),
});


export const env = envSchema.parse(process.env);
export type Env = typeof env;