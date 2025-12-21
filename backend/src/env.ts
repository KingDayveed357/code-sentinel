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

});


export const env = envSchema.parse(process.env);
export type Env = typeof env;