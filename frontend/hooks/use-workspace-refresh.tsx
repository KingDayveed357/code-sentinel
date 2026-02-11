// hooks/use-workspace-refresh.ts
"use client";

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { listWorkspaces, type Workspace } from "@/lib/api/workspaces";


/**
 * Smart hook that automatically refreshes workspace data when changes are detected
 * Provides smooth UX with skeleton loading during refresh
 * 
 * Triggers refresh on:
 * - Workspace name updates
 * - Workspace settings changes
 * - Manual refresh requests
 * - Polling intervals (configurable)
 */
export function useWorkspaceRefresh(options?: {
  pollingInterval?: number; // ms, default: 30000 (30s)
  enablePolling?: boolean; // default: true
}) {
  const { workspace, workspaces, setWorkspace, setWorkspaces } = useWorkspaceStore();
  const queryClient = useQueryClient();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefreshRef = useRef<number>(Date.now());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const pollingInterval = options?.pollingInterval ?? 30000;
  const enablePolling = options?.enablePolling ?? true;

  /**
   * Core refresh function - fetches latest workspace data
   */
  const refreshWorkspaceData = async (showLoader = true) => {
    if (!workspace) return;
    
    try {
      if (showLoader) {
        setIsRefreshing(true);
      }

      // Fetch latest workspace list
      const updatedWorkspaces = await listWorkspaces();

      // Find the updated current workspace
      const updatedCurrentWorkspace = updatedWorkspaces.find(
        (w) => w.id === workspace.id
      );

      if (updatedCurrentWorkspace) {
        // Check if workspace data actually changed
        const hasChanged = 
          updatedCurrentWorkspace.name !== workspace.name ||
          updatedCurrentWorkspace.plan !== workspace.plan ||
          JSON.stringify(updatedCurrentWorkspace) !== JSON.stringify(workspace);

        if (hasChanged) {
          console.log("✨ Workspace data changed, updating store:", {
            old: workspace.name,
            new: updatedCurrentWorkspace.name,
          });

          // Update store with fresh data
          setWorkspace(updatedCurrentWorkspace);
          setWorkspaces(updatedWorkspaces);

          // Invalidate workspace-specific queries
          queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey;
              return key[0] === "workspace" && key[1] === workspace.id;
            },
          });

          lastRefreshRef.current = Date.now();
        } else {
          console.log("✅ Workspace data unchanged");
        }
      } else {
        console.warn("⚠️ Current workspace not found in updated list");
      }
    } catch (error) {
      console.error("❌ Failed to refresh workspace data:", error);
    } finally {
      if (showLoader) {
        // Minimum display time for smooth UX
        setTimeout(() => {
          setIsRefreshing(false);
        }, 300);
      }
    }
  };

  /**
   * Manual refresh trigger (can be called from UI)
   */
  const triggerRefresh = async () => {
    await refreshWorkspaceData(true);
  };

  /**
   * Set up polling for workspace updates
   */
  useEffect(() => {
    if (!workspace || !enablePolling) return;

    // Clear existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Set up new polling interval
    pollingIntervalRef.current = setInterval(() => {
      console.log("🔄 Polling workspace data...");
      refreshWorkspaceData(false); // Silent refresh
    }, pollingInterval);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [workspace?.id, pollingInterval, enablePolling]);

  /**
   * Listen for custom refresh events (e.g., after settings update)
   */
  useEffect(() => {
    const handleWorkspaceUpdate = (event: CustomEvent<{ workspaceId: string }>) => {
      if (event.detail.workspaceId === workspace?.id) {
        console.log("📢 Received workspace update event");
        triggerRefresh();
      }
    };

    window.addEventListener(
      "workspace:updated" as any,
      handleWorkspaceUpdate as EventListener
    );

    return () => {
      window.removeEventListener(
        "workspace:updated" as any,
        handleWorkspaceUpdate as EventListener
      );
    };
  }, [workspace?.id]);

  /**
   * Refresh on window focus (user returns to tab)
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && workspace) {
        const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;
        
        // Only refresh if > 30s since last refresh
        if (timeSinceLastRefresh > 30000) {
          console.log("👀 Window focused, refreshing workspace data");
          refreshWorkspaceData(false);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [workspace?.id]);

  return {
    isRefreshing,
    triggerRefresh,
    lastRefresh: lastRefreshRef.current,
  };
}

/**
 * Helper function to dispatch workspace update events
 * Call this after updating workspace settings/name
 */
export function notifyWorkspaceUpdate(workspaceId: string) {
  const event = new CustomEvent("workspace:updated", {
    detail: { workspaceId },
  });
  window.dispatchEvent(event);
}