// =====================================================
// hooks/use-workspace.tsx
// Workspace management hooks - uses centralized store
// =====================================================
'use client';

import { useWorkspaceStore, useCurrentWorkspace } from '@/stores/workspace-store';
import * as workspaceApi from '@/lib/api/workspaces';
import type { WorkspaceWithRole } from '@/lib/api/workspaces';
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useProgressStore } from "@/stores/progress-store";

/**
 * Main workspace hook - provides current workspace and switching functionality
 * This is the primary hook components should use
 */
export function useWorkspace() {
  const workspace = useCurrentWorkspace();
  const { workspaces, loading, initializing, setWorkspace, setWorkspaces, setLoading } = useWorkspaceStore();
  const { start, done } = useProgressStore();

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  const switchWorkspace = async (workspaceId: string) => {
    if (workspace?.id === workspaceId) return;

    start(); // Start progress immediately

    try {
      const targetWorkspace = workspaces.find(w => w.id === workspaceId);
      if (!targetWorkspace) {
        throw new Error("Workspace not found");
      }

      setLoading(true);
      console.log('🔄 Starting workspace switch to:', targetWorkspace.name);

      // Update store first
      setWorkspace(targetWorkspace);
      
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('active_workspace_id', workspaceId);
      }

      // Invalidate only workspace-scoped queries (more targeted than invalidating everything)
      // This prevents unnecessary refetches of non-workspace data
      
      await queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          // Invalidate queries that include 'workspace' or the old workspace ID
          return (
            key.includes('workspace') || 
            key.includes(workspace?.id || '') ||
            key.includes('dashboard') ||
            key.includes('projects') ||
            key.includes('integrations')
          );
        },
      });
      
      // Force router refresh to ensure all server components re-render with new context
      console.log('🔄 Refreshing router...');
      router.refresh();

      // Small delay to allow router refresh to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('✅ Workspace switch complete');
      
      toast({
        title: "Workspace switched",
        description: `You are now working in ${targetWorkspace.name}`,
      });

      // Complete the loading state and progress bar
      setLoading(false);
      done();
    } catch (err) {
      console.error("❌ Failed to switch workspace:", err);
      toast({
        title: "Switch failed",
        description: "Could not switch workspace. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
      done();
    }
  };

  return {
    workspace,
    workspaces,
    workspaceId: workspace?.id || null,
    role: workspace?.role,
    permissions: workspace?.role ? workspaceApi.getPermissions(workspace.role) : null,
    isLoading: loading,
    initializing,
    isSwitching: loading, // Alias for workspace switching state
    isTeamWorkspace: workspace?.type === 'team',
    isPersonalWorkspace: workspace?.type === 'personal',
    error: null,
    switchWorkspace,
    setActiveWorkspace: switchWorkspace, // Alias
    refreshWorkspace: async () => {
      if (workspace?.id) {
        const updated = await workspaceApi.getWorkspace(workspace.id);
        setWorkspace(updated);
      }
    },
  };
}

/**
 * Hook for workspace list operations
 */
export function useWorkspaces() {
  const { workspaces, loading, setWorkspaces } = useWorkspaceStore();

  const fetchWorkspaces = async () => {
    const data = await workspaceApi.listWorkspaces();
    setWorkspaces(data);
    return data;
  };

  const createWorkspace = async (data: workspaceApi.CreateWorkspaceData) => {
    const response = await workspaceApi.createWorkspace(data);
    await fetchWorkspaces(); 
    return response;
  };

  const updateWorkspace = async (workspaceId: string, data: workspaceApi.UpdateWorkspaceData) => {
    await workspaceApi.updateWorkspace(workspaceId, data);
    await fetchWorkspaces();
  };

  const deleteWorkspace = async (workspaceId: string) => {
    await workspaceApi.deleteWorkspace(workspaceId);
    await fetchWorkspaces();
  };

  return {
    workspaces,
    isLoading: loading,
    error: null,
    fetchWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };
}

/**
 * Hook for checking permissions
 */
export function usePermission(permission: keyof workspaceApi.RolePermissions): boolean {
  const { workspace } = useWorkspace();
  if (!workspace) return false;
  return workspaceApi.hasPermission(workspace.role, permission);
}
