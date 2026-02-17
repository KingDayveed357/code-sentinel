// stores/workspace-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Workspace, WorkspaceWithRole } from '@/lib/api/workspaces';

/**
 * ✅ EXPLICIT STATE MACHINE
 * 
 * States:
 * - "initializing": First load, no workspace yet
 * - "ready": Workspace loaded and stable
 * - "validating": Background refresh/validation (does NOT block UI)
 * - "switching": User-initiated workspace switch (blocks UI)
 */
type WorkspaceLifecycleState = "initializing" | "ready" | "validating" | "switching";

interface WorkspaceState {
  // Current active workspace
  workspace: WorkspaceWithRole | null;
  
  // All available workspaces
  workspaces: WorkspaceWithRole[];
  
  // Lifecycle state machine
  lifecycleState: WorkspaceLifecycleState;
  
  // Legacy loading states (derived from lifecycleState)
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
  
  // ✅ NEW: Explicit lifecycle transitions
  transitionTo: (state: WorkspaceLifecycleState) => void;
  markReady: () => void;
  startValidating: () => void;
  finishValidating: () => void;
  startSwitching: () => void;
  finishSwitching: () => void;
  
  markRefreshed: () => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      (set, get) => ({
        workspace: null,
        workspaces: [],
        lifecycleState: "initializing",
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

        // ✅ LEGACY: Kept for backward compatibility
        setLoading: (loading) => 
          set({ loading }, false, 'setLoading'),

        // ✅ CRITICAL FIX: setInitializing should ONLY set to false, never true
        // Once initialized, we never go back to initializing state
        setInitializing: (initializing) => {
          const current = get().lifecycleState;
          
          // ✅ GUARD: Never revert to initializing after we've moved past it
          if (current !== "initializing" && initializing === true) {
            console.warn('⚠️ Attempted to set initializing=true after initialization. Ignoring.');
            return;
          }
          
          if (initializing === false && current === "initializing") {
            // Transition from initializing to ready
            set({ 
              initializing: false, 
              lifecycleState: "ready" 
            }, false, 'setInitializing:ready');
          }
        },

        // ✅ NEW: Explicit state transitions
        transitionTo: (state) => {
          const validTransitions: Record<WorkspaceLifecycleState, WorkspaceLifecycleState[]> = {
            initializing: ["ready", "switching"],
            ready: ["validating", "switching"],
            validating: ["ready"],
            switching: ["ready"],
          };

          const current = get().lifecycleState;
          if (!validTransitions[current].includes(state)) {
            console.warn(`⚠️ Invalid transition: ${current} -> ${state}`);
            return;
          }

          set({ 
            lifecycleState: state,
            initializing: state === "initializing",
            loading: state === "switching",
          }, false, `transition:${current}->${state}`);
        },

        markReady: () => {
          set({ 
            lifecycleState: "ready",
            initializing: false,
            loading: false,
          }, false, 'markReady');
        },

        startValidating: () => {
          const current = get().lifecycleState;
          if (current === "ready") {
            set({ lifecycleState: "validating" }, false, 'startValidating');
          }
        },

        finishValidating: () => {
          const current = get().lifecycleState;
          if (current === "validating") {
            set({ lifecycleState: "ready" }, false, 'finishValidating');
          }
        },

        startSwitching: () => {
          set({ 
            lifecycleState: "switching",
            loading: true,
          }, false, 'startSwitching');
        },

        finishSwitching: () => {
          set({ 
            lifecycleState: "ready",
            loading: false,
          }, false, 'finishSwitching');
        },

        markRefreshed: () =>
          set({ lastRefreshed: Date.now() }, false, 'markRefreshed'),

        reset: () => 
          set(
            {
              workspace: null,
              workspaces: [],
              lifecycleState: "initializing",
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

export const useWorkspaceLifecycleState = () =>
  useWorkspaceStore((state) => state.lifecycleState);

export const useLastRefreshed = () =>
  useWorkspaceStore((state) => state.lastRefreshed);

/**
 * Get workspace by ID
 */
export const useWorkspaceById = (workspaceId: string | null) =>
  useWorkspaceStore((state) => 
    workspaceId ? state.workspaces.find((w) => w.id === workspaceId) : null
  );