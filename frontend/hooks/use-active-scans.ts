import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { scansApi } from "@/lib/api/scans";

import type { Scan } from "@/lib/api/scans";

export type ActiveScan = Scan;

/**
 * ✅ WORKSPACE-GLOBAL SCAN STORE
 * 
 * This hook provides workspace-scoped active scan tracking with:
 * - Automatic polling while scans are active
 * - Smart polling lifecycle (stops when no active scans)
 * - Session-based dismissal
 * - Recently completed scan visibility (30s window)
 * 
 * Architecture:
 * - Queries for canonical statuses: queued, processing
 * - Shows recently completed/failed scans briefly
 * - Polls every 3 seconds when active scans exist
 * - Stops polling when all scans complete
 */
export function useActiveScans() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;
  const [dismissedScans, setDismissedScans] = useState<Set<string>>(new Set());

  // Restore dismissed scans from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem("dismissedScans");
    if (stored) {
      try {
        setDismissedScans(new Set(JSON.parse(stored)));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const queryClient = useQueryClient();

  const { data: activeScans = [], refetch } = useQuery({
    queryKey: ['active-scans', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      try {
        // ✅ FIX: Query for canonical statuses
        const [processingResult, queuedResult] = await Promise.all([
          scansApi.getAll(workspaceId, {
            page: 1, limit: 10, status: "processing",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
          scansApi.getAll(workspaceId, {
            page: 1, limit: 10, status: "queued",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
        ]);

        const activeScansData = [
          ...(processingResult.data || []),
          ...(queuedResult.data || []),
        ];

        // Also check for recently completed/failed scans (last 30 seconds)
        const [completedResult, failedResult] = await Promise.all([
          scansApi.getAll(workspaceId, {
            page: 1, limit: 5, status: "completed",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
          scansApi.getAll(workspaceId, {
            page: 1, limit: 5, status: "failed",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
        ]);

        const recentlyCompleted = [
          ...(completedResult.data || []),
          ...(failedResult.data || []),
        ].filter((scan) => {
          const completedAt = new Date(scan.completed_at || scan.created_at);
          const now = new Date();
          const diffMs = now.getTime() - completedAt.getTime();
          return diffMs < 30000; // 30 seconds
        });

        // Combine and deduplicate
        const combined = [...activeScansData, ...recentlyCompleted];
        const uniqueMap = new Map();
        combined.forEach(s => uniqueMap.set(s.id, s));
        const unique = Array.from(uniqueMap.values());

        // Map to full Scan interface
        return unique.map((scan: any) => ({
          ...scan,
          // Ensure nested objects are preserved if needed, but spread should handle top-level
        }));
      } catch (error) {
        console.error("Failed to fetch active scans:", error);
        return [];
      }
    },
    enabled: !!workspaceId,
    // ✅ FIX: React Query v5 passes Query object, not data directly
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActiveScans = Array.isArray(data)
        ? data.some((scan: Scan) => scan.status === "processing" || scan.status === "queued")
        : false;
      // Poll every 3s when active scans exist, otherwise poll every 15s
      // to catch newly started scans even without explicit invalidation
      return hasActiveScans ? 3000 : 15000;
    },
    staleTime: 1000, // Keep data fresh
    refetchOnWindowFocus: true, // Override global default for this critical query
  });

  // Filter out dismissed scans
  const visibleScans = activeScans.filter((scan) => !dismissedScans.has(scan.id));

  const dismissScan = (scanId: string) => {
    setDismissedScans((prev) => {
      const next = new Set(prev);
      next.add(scanId);
      localStorage.setItem("dismissedScans", JSON.stringify([...next]));
      return next;
    });
  };

  const clearDismissed = () => {
    setDismissedScans(new Set());
    localStorage.removeItem("dismissedScans");
  };

  /**
   * Force immediate refetch of active scans.
   * Call this after starting a scan to ensure the tray updates instantly.
   */
  const triggerRefresh = useCallback(() => {
    if (workspaceId) {
      queryClient.invalidateQueries({ queryKey: ['active-scans', workspaceId] });
    }
  }, [workspaceId, queryClient]);

  return {
    activeScans: visibleScans,
    dismissScan,
    clearDismissed,
    refetch, // Expose refetch for manual refresh
    triggerRefresh, // Invalidate + refetch (use after starting scans)
  };
}

// Explicit export to ensure module is recognized
export default useActiveScans;
