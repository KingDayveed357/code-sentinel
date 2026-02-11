// src/types/fastify.d.ts
import "fastify";
import { SupabaseClient } from "@supabase/supabase-js";
import type { JobQueue } from "../utils/queue";
import type { ScanJobPayload } from "../modules/scans/types";

// User profile from public.users table
export interface UserProfile {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
    onboarding_completed: boolean;
    // Global system role (e.g. 'admin', 'user') - distinct from workspace role
    role?: string | null; 
    // Plan might be legacy here if moving to workspace-based billing
    plan: "Free" | "Dev" | "Team" | "Enterprise";
    created_at?: string;
    updated_at?: string;
}

// Supabase auth user
export interface SupabaseUser {
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
    app_metadata?: Record<string, any>;
    aud?: string;
    created_at?: string;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface WorkspaceContext {
    id: string;
    name: string;
    slug: string;
    type: 'personal' | 'team';
    owner_id: string | null;
    plan: string;
    settings: any;
    created_at: string;
    updated_at: string;
}

declare module "fastify" {
    interface FastifyInstance {
        supabase: SupabaseClient;
        scanQueue: JobQueue<ScanJobPayload>;
    }

    interface FastifyRequest {
        // Attached by verifyAuth middleware
        supabaseUser?: SupabaseUser;

        // Attached by loadProfile middleware
        profile?: UserProfile;
        
        // Convenience property - same as profile
        user?: UserProfile;

        // Attached by resolveWorkspace middleware
        workspace?: WorkspaceContext;
        
        // The authenticated user's role within the current workspace
        workspaceRole?: WorkspaceRole;
    }
}