// hooks/use-workspace-change-listener.ts
"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@/stores/workspace-store";

/**
 * Hook that listens for workspace changes and automatically:
 * 1. Invalidates all workspace-specific queries
 * 2. Cancels any in-flight requests for the old workspace
 * 3. Triggers refetch for the new workspace
 *
 * This is essential for workspace-safe routes (settings, billing, etc.)
 * that should automatically update when the user switches workspaces
 */
export function useWorkspaceChangeListener() {
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();
  const previousWorkspaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Track workspace changes
    const currentWorkspaceId = workspace?.id;

    // Only process if workspace actually changed
    if (currentWorkspaceId && currentWorkspaceId !== previousWorkspaceIdRef.current) {
      const previousId = previousWorkspaceIdRef.current;

      console.log("🔄 Workspace changed detected:", {
        from: previousId,
        to: currentWorkspaceId,
      });

      // Step 1: Cancel in-flight requests for old workspace
      if (previousId) {
        console.log("🛑 Cancelling in-flight requests for workspace:", previousId);
        queryClient.cancelQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return key[0] === "workspace" && key[1] === previousId;
          },
        });
      }

      // Step 2: Remove old workspace data to prevent stale UI
      if (previousId) {
        console.log("🗑️  Removing cached data for workspace:", previousId);
        queryClient.removeQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return key[0] === "workspace" && key[1] === previousId;
          },
        });
      }

      // Step 3: Invalidate new workspace queries to trigger refetch
      console.log("♻️  Invalidating queries for new workspace:", currentWorkspaceId);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === "workspace" && key[1] === currentWorkspaceId;
        },
      });

      // Update ref for next change
      previousWorkspaceIdRef.current = currentWorkspaceId;
    }
  }, [workspace?.id, queryClient]);
}
