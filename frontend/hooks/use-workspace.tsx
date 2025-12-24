"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./use-auth";
import { workspacesApi, type Workspace } from "@/lib/api/workspaces";

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch workspaces from API
      const response = await workspacesApi.list();
      const allWorkspaces = response.workspaces || [];

      if (allWorkspaces.length === 0) {
        console.warn('No workspaces found for user');
        setLoading(false);
        return;
      }

      setWorkspaces(allWorkspaces);

      // Determine default workspace:
      // 1. Last active workspace (if still accessible)
      // 2. Personal workspace
      // 3. First team workspace
      const lastActiveId = localStorage.getItem('active_workspace_id');
      const lastActive = lastActiveId 
        ? allWorkspaces.find(w => w.id === lastActiveId)
        : null;

      let defaultWorkspace: Workspace | null = null;

      if (lastActive) {
        defaultWorkspace = lastActive;
      } else {
        // Find personal workspace
        const personal = allWorkspaces.find(w => w.type === 'personal');
        if (personal) {
          defaultWorkspace = personal;
        } else {
          // Fallback to first team workspace
          const firstTeam = allWorkspaces.find(w => w.type === 'team');
          defaultWorkspace = firstTeam || allWorkspaces[0];
        }
      }

      if (defaultWorkspace) {
        setWorkspace(defaultWorkspace);
        localStorage.setItem('active_workspace_id', defaultWorkspace.id);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const targetWorkspace = workspaces.find(w => w.id === workspaceId);
    if (!targetWorkspace) {
      console.error('Workspace not found:', workspaceId);
      return;
    }

    setWorkspace(targetWorkspace);
    localStorage.setItem('active_workspace_id', workspaceId);
    
    // Trigger soft refresh to reload data with new workspace context
    router.refresh();
  }, [workspaces, router]);

  const refreshWorkspaces = useCallback(async () => {
    await loadWorkspaces();
  }, [loadWorkspaces]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces,
        loading,
        switchWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
};