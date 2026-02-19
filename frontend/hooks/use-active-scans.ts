import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
    // ✅ SMART POLLING: Poll every 3 seconds when enabled
    refetchInterval: (data) => {
      // Stop polling if no active scans (only completed/failed)
      // ✅ FIX: Be defensive - `data` may unexpectedly be a non-array (cache shape, errors, undefined)
      const hasActiveScans = Array.isArray(data)
        ? data.some((scan) => scan.status === "processing" || scan.status === "queued")
        : false;
      return hasActiveScans ? 3000 : false;
    },
    staleTime: 1000, // Keep data fresh
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

  return {
    activeScans: visibleScans,
    dismissScan,
    clearDismissed,
    refetch, // Expose refetch for manual refresh
  };
}

// Explicit export to ensure module is recognized
export default useActiveScans;
