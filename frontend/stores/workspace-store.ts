// stores/workspace-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Workspace } from '@/lib/api/workspaces';

interface WorkspaceState {
  // Current active workspace
  workspace: Workspace | null;
  
  // All available workspaces
  workspaces: Workspace[];
  
  // Loading states
  loading: boolean;
  initializing: boolean;
  
  // Actions
  setWorkspace: (workspace: Workspace) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setLoading: (loading: boolean) => void;
  setInitializing: (initializing: boolean) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      (set) => ({
        workspace: null,
        workspaces: [],
        loading: false,
        initializing: true,

        setWorkspace: (workspace) => 
          set({ workspace }, false, 'setWorkspace'),

        setWorkspaces: (workspaces) => 
          set({ workspaces }, false, 'setWorkspaces'),

        setLoading: (loading) => 
          set({ loading }, false, 'setLoading'),

        setInitializing: (initializing) => 
          set({ initializing }, false, 'setInitializing'),

        reset: () => 
          set(
            {
              workspace: null,
              workspaces: [],
              loading: false,
              initializing: true,
            },
            false,
            'reset'
          ),
      }),
      {
        name: 'workspace-storage',
        // Only persist the last active workspace ID for quick restoration
        partialize: (state) => ({
          lastWorkspaceId: state.workspace?.id,
        }),
      }
    ),
    { name: 'WorkspaceStore' }
  )
);

// Selectors for optimized re-renders
export const useCurrentWorkspace = () => 
  useWorkspaceStore((state) => state.workspace);

export const useWorkspaces = () => 
  useWorkspaceStore((state) => state.workspaces);

export const useWorkspaceLoading = () => 
  useWorkspaceStore((state) => state.loading);

export const useWorkspaceInitializing = () => 
  useWorkspaceStore((state) => state.initializing);