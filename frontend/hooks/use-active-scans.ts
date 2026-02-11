import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { scansApi } from "@/lib/api/scans";

export interface ActiveScan {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  repository: {
    id: string;
    name: string;
  };
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  progress?: number;
}

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

  const { data: activeScans = [] } = useQuery({
    queryKey: ['active-scans', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      try {
        // Fetch running and pending scans separately
        const [runningResult, pendingResult] = await Promise.all([
          scansApi.getAll(workspaceId, {
            page: 1, limit: 10, status: "running",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
          scansApi.getAll(workspaceId, {
            page: 1, limit: 10, status: "pending",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
        ]);

        const activeScansData = [
          ...(runningResult.data || []),
          ...(pendingResult.data || []),
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

        // Map to ActiveScan interface
        return unique.map((scan: any) => ({
          id: scan.id,
          status: scan.status,
          repository: {
            id: scan.repository.id,
            name: scan.repository.name,
          },
          created_at: scan.created_at,
          completed_at: scan.completed_at,
          error_message: scan.error_message,
          progress: scan.progress_percentage ?? undefined,
        }));
      } catch (error) {
        console.error("Failed to fetch active scans:", error);
        return [];
      }
    },
    enabled: !!workspaceId,
    refetchInterval: 5000,
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
  };
}

// Explicit export to ensure module is recognized
export default useActiveScans;
