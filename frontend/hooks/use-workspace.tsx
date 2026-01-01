// hooks/use-workspace.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { workspacesApi, type Workspace } from '@/lib/api/workspaces';
import { useAuth } from './use-auth';
import { toast } from 'sonner';

export function useWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const {
    workspace,
    workspaces,
    loading,
    initializing,
    setWorkspace,
    setWorkspaces,
    setLoading,
    setInitializing,
    reset,
  } = useWorkspaceStore();

  // Local state for switch feedback
  const [isSwitching, setIsSwitching] = useState(false);

  // Get workspace ID from URL query param (source of truth)
  const workspaceIdFromUrl = searchParams?.get('workspace') || null;

  // Update URL with workspace query param
  const updateUrlWorkspace = useCallback((workspaceId: string, replace: boolean = true) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set('workspace', workspaceId);
    
    const url = `${pathname}?${params.toString()}`;
    
    if (replace) {
      router.replace(url, { scroll: false });
    } else {
      router.push(url, { scroll: false });
    }
  }, [pathname, searchParams, router]);

  // Load all workspaces on mount
  const loadWorkspaces = useCallback(async () => {
    if (!user) {
      reset();
      setInitializing(false);
      return;
    }

    try {
      setLoading(true);
      const response = await workspacesApi.list();
      const allWorkspaces = response.workspaces || [];

      if (allWorkspaces.length === 0) {
        console.warn('No workspaces found');
        setWorkspaces([]);
        setInitializing(false);
        return;
      }

      setWorkspaces(allWorkspaces);

      // Determine which workspace to activate
      let targetWorkspace: Workspace | null = null;

      if (workspaceIdFromUrl) {
        // URL has explicit workspace param - use it
        targetWorkspace = allWorkspaces.find(w => w.id === workspaceIdFromUrl) || null;
        
        if (!targetWorkspace) {
          toast.error('Workspace not found or access denied');
          // Fallback to personal workspace
          targetWorkspace = allWorkspaces.find(w => w.type === 'personal') || allWorkspaces[0];
        }
      } else {
        // No URL param - check localStorage for last active
        const lastActiveId = localStorage.getItem('active_workspace_id');
        if (lastActiveId) {
          targetWorkspace = allWorkspaces.find(w => w.id === lastActiveId) || null;
        }
        
        // If no last active or not found, use personal
        if (!targetWorkspace) {
          targetWorkspace = allWorkspaces.find(w => w.type === 'personal') || allWorkspaces[0];
        }
      }

      if (targetWorkspace) {
        setWorkspace(targetWorkspace);
        localStorage.setItem('active_workspace_id', targetWorkspace.id);
        
        // Sync URL if needed (without reload)
        if (!workspaceIdFromUrl || workspaceIdFromUrl !== targetWorkspace.id) {
          updateUrlWorkspace(targetWorkspace.id, false);
        }
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      toast.error('Failed to load workspaces');
    } finally {
      setLoading(false);
      setInitializing(false);
    }
  }, [user, workspaceIdFromUrl, reset, setWorkspaces, setWorkspace, setLoading, setInitializing, updateUrlWorkspace]);

  // Switch workspace handler with instant feedback
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const targetWorkspace = workspaces.find(w => w.id === workspaceId);
    
    if (!targetWorkspace) {
      toast.error('Workspace not found');
      return;
    }

    // Check access
    const hasAccess = workspaces.some(w => w.id === workspaceId);
    if (!hasAccess) {
      toast.error('You do not have access to this workspace');
      return;
    }

    // Show immediate feedback
    setIsSwitching(true);
    toast.loading(`Switching to ${targetWorkspace.name}...`, {
      id: 'workspace-switch',
    });

    try {
      // Update store immediately for instant UI feedback
      setWorkspace(targetWorkspace);
      localStorage.setItem('active_workspace_id', workspaceId);
      
      // Update URL (this triggers data refetch via React Query)
      updateUrlWorkspace(workspaceId);
      
      // Success feedback
      toast.success(`Switched to ${targetWorkspace.name}`, {
        id: 'workspace-switch',
        duration: 2000,
      });
    } catch (error) {
      console.error('Workspace switch error:', error);
      toast.error('Failed to switch workspace', {
        id: 'workspace-switch',
      });
    } finally {
      setIsSwitching(false);
    }
  }, [workspaces, setWorkspace, updateUrlWorkspace]);

  // Refresh workspaces from API
  const refreshWorkspaces = useCallback(async () => {
    await loadWorkspaces();
  }, [loadWorkspaces]);

  // Initialize on mount and when user changes
  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Sync workspace when URL changes (browser back/forward)
  useEffect(() => {
    if (!workspaceIdFromUrl || !workspaces.length || initializing) return;

    const urlWorkspace = workspaces.find(w => w.id === workspaceIdFromUrl);
    
    if (urlWorkspace && workspace?.id !== workspaceIdFromUrl) {
      setWorkspace(urlWorkspace);
      localStorage.setItem('active_workspace_id', urlWorkspace.id);
    } else if (!urlWorkspace && workspace) {
      // URL workspace is invalid, redirect to current workspace
      updateUrlWorkspace(workspace.id, true);
    }
  }, [workspaceIdFromUrl, workspaces, workspace?.id, initializing, setWorkspace, updateUrlWorkspace]);

  // Helper to check workspace type
  const isPersonalWorkspace = useMemo(() => {
    return workspace?.type === 'personal';
  }, [workspace?.type]);

  const isTeamWorkspace = useMemo(() => {
    return workspace?.type === 'team';
  }, [workspace?.type]);

  return {
    workspace,
    workspaces,
    loading,
    initializing,
    isSwitching,
    switchWorkspace,
    refreshWorkspaces,
    isPersonalWorkspace,
    isTeamWorkspace,
  };
}