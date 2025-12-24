// src/modules/workspaces/service.ts
import type { FastifyInstance } from "fastify";

export interface Workspace {
    id: string;
    name: string;
    slug: string;
    type: 'personal' | 'team';
    owner_id: string | null;
    team_id: string | null;
    plan: string;
    settings: any;
    created_at: string;
    updated_at: string;
}

/**
 * Get all workspaces accessible to a user
 * Returns personal workspace + all team workspaces where user is a member
 */
export async function getUserWorkspaces(
    fastify: FastifyInstance,
    userId: string
): Promise<Workspace[]> {
    // Get personal workspace
    const { data: personalWorkspace } = await fastify.supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId)
        .eq('type', 'personal')
        .single();

    const workspaces: Workspace[] = [];

    // Add personal workspace if it exists
    if (personalWorkspace) {
        workspaces.push(personalWorkspace as Workspace);
    }

    // Get all teams where user is an active member
    const { data: userTeams, error: teamsError } = await fastify.supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', userId)
        .eq('status', 'active');

    if (teamsError) {
        fastify.log.error({ error: teamsError, userId }, 'Failed to fetch user teams');
        // Return at least personal workspace if available
        return workspaces;
    }

    const teamIds = (userTeams || []).map((tm: any) => tm.team_id);

    if (teamIds.length > 0) {
        // Get workspaces for these teams
        const { data: teamWorkspaces, error: workspacesError } = await fastify.supabase
            .from('workspaces')
            .select('*')
            .eq('type', 'team')
            .in('team_id', teamIds);

        if (workspacesError) {
            fastify.log.error({ error: workspacesError, userId }, 'Failed to fetch team workspaces');
        } else if (teamWorkspaces) {
            workspaces.push(...(teamWorkspaces as Workspace[]));
        }
    }

    return workspaces;
}

