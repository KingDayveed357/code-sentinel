// lib/api/workspaces.ts
import { apiFetch } from "../api";

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

export interface ListWorkspacesResponse {
  workspaces: Workspace[];
}

export const workspacesApi = {
  /**
   * Get all workspaces accessible to the current user
   */
  list: async (): Promise<ListWorkspacesResponse> => {
    return apiFetch('/workspaces', { requireAuth: true });
  },

  bootstrap: async (): Promise<{ workspace: Workspace }> => {
    return apiFetch('/workspaces/bootstrap', {
      method: 'POST',
      requireAuth: true,
    });
  }
};

// Type guard to ensure workspace has all required fields
export function isValidWorkspace(workspace: any): workspace is Workspace {
  return (
    workspace &&
    typeof workspace.id === 'string' &&
    typeof workspace.name === 'string' &&
    typeof workspace.slug === 'string' &&
    (workspace.type === 'personal' || workspace.type === 'team') &&
    typeof workspace.plan === 'string'
  );
}