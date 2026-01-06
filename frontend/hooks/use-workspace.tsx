// hooks/use-workspace.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { workspacesApi, type Workspace } from '@/lib/api/workspaces';
import { classifyRoute } from '@/lib/routes/route-classifier';
import { useAuth } from './use-auth';
import { toast } from 'sonner';

export function useWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // const { toast } = useToast();

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
  const switchInProgressRef = useRef(false);

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
        console.warn('⚠️  No workspaces found');
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
          toast.error(
            <div>
              <strong>Workspace not found</strong>
              <div>Falling back to your personal workspace</div>
            </div>
          );
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
        console.log('✅ Initial workspace set:', targetWorkspace.name);
        setWorkspace(targetWorkspace);
        localStorage.setItem('active_workspace_id', targetWorkspace.id);
        
        // Sync URL if needed (without reload)
        if (!workspaceIdFromUrl || workspaceIdFromUrl !== targetWorkspace.id) {
          updateUrlWorkspace(targetWorkspace.id, true);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load workspaces:', error);
      toast.error("Failed to load workspaces. Please refresh the page and try again");
    } finally {
      setLoading(false);
      setInitializing(false);
    }
  }, [user, workspaceIdFromUrl, reset, setWorkspaces, setWorkspace, setLoading, setInitializing, updateUrlWorkspace]);

  // Switch workspace handler with route classification
  const switchWorkspace = useCallback(async (workspaceId: string) => {
    // Prevent concurrent switches
    if (switchInProgressRef.current) {
      console.log('⏸️  Switch already in progress, ignoring');
      return;
    }

    if (workspaceId === workspace?.id) {
      console.log('✅ Already on this workspace');
      return;
    }

    const targetWorkspace = workspaces.find(w => w.id === workspaceId);
    
    if (!targetWorkspace) {
      toast.error(
        <div>
          <strong>Workspace not found</strong>
          <div>Falling back to your personal workspace</div>
        </div>
      );
      return;
    }

    // Check access
    const hasAccess = workspaces.some(w => w.id === workspaceId);
    if (!hasAccess) {
        toast.error("You do not have access to this workspace");
      return;
    }

    switchInProgressRef.current = true;
    setIsSwitching(true);

    console.log('🚀 Starting workspace switch:', {
      from: workspace?.name,
      to: targetWorkspace.name,
      pathname,
    });

    try {
      // Step 1: Classify current route
      const routeDef = classifyRoute(pathname);
      console.log('📍 Route type:', routeDef.type);

      // Step 2: Store previous workspace for potential rollback
      const previousWorkspace = workspace;

      // Step 3: Update store immediately for instant UI feedback
      setWorkspace(targetWorkspace);
      localStorage.setItem('active_workspace_id', workspaceId);

      // Step 4: Handle entity-dependent routes (validate or redirect)
      if (routeDef.type === 'entity-dependent' && routeDef.requiresValidation) {
        console.log('🔍 Validating entity access in new workspace...');
        
        try {
          const isValid = await routeDef.requiresValidation(
            pathname,
            targetWorkspace,
            queryClient
          );

          if (!isValid) {
            console.log('❌ Entity not available in new workspace, redirecting...');
            
            // Redirect to safe route
            const redirectTo = routeDef.redirectOnInvalid || '/dashboard';
            const params = new URLSearchParams();
            params.set('workspace', workspaceId);
            
            toast.error("This resource is not available in the selected workspace");
            router.push(`${redirectTo}?${params.toString()}`);
            return; // Early return after redirect
          }
          
          console.log('✅ Entity validated successfully');
        } catch (error) {
          console.error('❌ Validation failed:', error);
          
          // Redirect on validation error
          const redirectTo = routeDef.redirectOnInvalid || '/dashboard';
          const params = new URLSearchParams();
          params.set('workspace', workspaceId);
          
          toast.error("Unable to access this resource in the selected workspace");
          router.push(`${redirectTo}?${params.toString()}`);
          return;
        }
      }

      // Step 5: Update URL with new workspace (triggers React Query refetch)
      console.log('🔗 Updating URL with workspace parameter');
      updateUrlWorkspace(workspaceId, true);

      // Step 6: Invalidate old workspace queries
      if (previousWorkspace) {
        console.log('🗑️  Invalidating old workspace queries');
        queryClient.removeQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return key[0] === 'workspace' && key[1] === previousWorkspace.id;
          },
        });
      }

      // Step 7: Force refetch for new workspace
      console.log('♻️  Invalidating new workspace queries to force refetch');
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'workspace' && key[1] === workspaceId;
        },
      });

      console.log('✅ Workspace switch complete');
       toast.success(`Switched to ${targetWorkspace.name}`);
    } catch (error) {
      console.error('❌ Workspace switch error:', error);
      toast.success(`Switched to ${targetWorkspace.name}`);
    } finally {
      setIsSwitching(false);
      switchInProgressRef.current = false;
    }
  }, [workspace, workspaces, pathname, setWorkspace, updateUrlWorkspace, queryClient, router]);

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
    if (!workspaceIdFromUrl || !workspaces.length || initializing || switchInProgressRef.current) {
      return;
    }

    const urlWorkspace = workspaces.find(w => w.id === workspaceIdFromUrl);
    
    if (urlWorkspace && workspace?.id !== workspaceIdFromUrl) {
      console.log('🔄 URL changed (browser navigation), syncing workspace:', urlWorkspace.name);
      setWorkspace(urlWorkspace);
      localStorage.setItem('active_workspace_id', urlWorkspace.id);
      
      // Invalidate queries for the new workspace
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'workspace' && key[1] === workspaceIdFromUrl;
        },
      });
    } else if (!urlWorkspace && workspace) {
      // URL workspace is invalid, redirect to current workspace
      console.warn('⚠️  Invalid workspace in URL, redirecting to current workspace');
      updateUrlWorkspace(workspace.id, true);
    }
  }, [workspaceIdFromUrl, workspaces, workspace?.id, initializing, setWorkspace, updateUrlWorkspace, queryClient]);

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
