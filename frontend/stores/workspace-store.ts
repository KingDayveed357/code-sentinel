// stores/workspace-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Workspace, WorkspaceWithRole } from '@/lib/api/workspaces';

interface WorkspaceState {
  // Current active workspace
  workspace: WorkspaceWithRole | null;
  
  // All available workspaces
  workspaces: WorkspaceWithRole[];
  
  // Loading states
  loading: boolean;
  initializing: boolean;
  
  // Refresh tracking
  lastRefreshed: number | null;
  
  // Actions
  setWorkspace: (workspace: WorkspaceWithRole | null) => void;
  setWorkspaces: (workspaces: WorkspaceWithRole[]) => void;
  updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceWithRole>) => void;
  setLoading: (loading: boolean) => void;
  setInitializing: (initializing: boolean) => void;
  markRefreshed: () => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      (set, get) => ({
        workspace: null,
        workspaces: [],
        loading: false,
        initializing: true,
        lastRefreshed: null,

        setWorkspace: (workspace) => 
          set({ workspace, lastRefreshed: Date.now() }, false, 'setWorkspace'),

        setWorkspaces: (workspaces) => 
          set({ workspaces, lastRefreshed: Date.now() }, false, 'setWorkspaces'),

        /**
         * Update specific workspace properties without full reload
         * Useful for optimistic updates
         */
        updateWorkspace: (workspaceId, updates) => {
          const state = get();
          
          // Update in workspaces array
          const updatedWorkspaces = state.workspaces.map((w) =>
            w.id === workspaceId ? { ...w, ...updates } : w
          );
          
          // Update current workspace if it's the one being updated
          const updatedCurrentWorkspace = 
            state.workspace?.id === workspaceId
              ? { ...state.workspace, ...updates }
              : state.workspace;
          
          set(
            {
              workspaces: updatedWorkspaces,
              workspace: updatedCurrentWorkspace,
              lastRefreshed: Date.now(),
            },
            false,
            'updateWorkspace'
          );
        },

        setLoading: (loading) => 
          set({ loading }, false, 'setLoading'),

        setInitializing: (initializing) => 
          set({ initializing }, false, 'setInitializing'),

        markRefreshed: () =>
          set({ lastRefreshed: Date.now() }, false, 'markRefreshed'),

        reset: () => 
          set(
            {
              workspace: null,
              workspaces: [],
              loading: false,
              initializing: true,
              lastRefreshed: null,
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

export const useLastRefreshed = () =>
  useWorkspaceStore((state) => state.lastRefreshed);

/**
 * Get workspace by ID
 */
export const useWorkspaceById = (workspaceId: string | null) =>
  useWorkspaceStore((state) => 
    workspaceId ? state.workspaces.find((w) => w.id === workspaceId) : null
  );