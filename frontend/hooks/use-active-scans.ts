"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
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
  const { workspaceId } = useAuth();
  const [activeScans, setActiveScans] = useState<ActiveScan[]>([]);
  const [dismissedScans, setDismissedScans] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load dismissed scans from localStorage
    const stored = localStorage.getItem("dismissedScans");
    if (stored) {
      try {
        setDismissedScans(new Set(JSON.parse(stored)));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchActiveScans = async () => {
      try {
        // Fetch running and pending scans separately (backend doesn't support comma-separated values)
        const [runningResult, pendingResult] = await Promise.all([
          scansApi.getAll(workspaceId, {
            page: 1,
            limit: 10,
            status: "running",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
          scansApi.getAll(workspaceId, {
            page: 1,
            limit: 10,
            status: "pending",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
        ]);

        const activeScansData = [
          ...(runningResult.data || []),
          ...(pendingResult.data || []),
        ].filter((scan) => !dismissedScans.has(scan.id));

        // Also check for recently completed/failed scans (last 30 seconds)
        const [completedResult, failedResult] = await Promise.all([
          scansApi.getAll(workspaceId, {
            page: 1,
            limit: 5,
            status: "completed",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
          scansApi.getAll(workspaceId, {
            page: 1,
            limit: 5,
            status: "failed",
          }).catch(() => ({ data: [], meta: { total: 0 } })),
        ]);

        const recentlyCompleted = [
          ...(completedResult.data || []),
          ...(failedResult.data || []),
        ].filter((scan) => {
          if (dismissedScans.has(scan.id)) return false;
          const completedAt = new Date(scan.completed_at || scan.created_at);
          const now = new Date();
          const diffMs = now.getTime() - completedAt.getTime();
          return diffMs < 30000; // 30 seconds
        });

        // Combine and deduplicate, mapping to ActiveScan format
        const combined = [...activeScansData, ...recentlyCompleted];
        const unique = Array.from(
          new Map(combined.map((s) => [s.id, s])).values()
        );

        // ✅ FIX: Map scan data to ActiveScan format with progress_percentage
        const mappedScans: ActiveScan[] = unique.map((scan) => ({
          id: scan.id,
          status: scan.status,
          repository: {
            id: scan.repository.id,
            name: scan.repository.name,
          },
          created_at: scan.created_at,
          completed_at: scan.completed_at,
          error_message: scan.error_message,
          progress: scan.progress_percentage ?? undefined, // ✅ FIX: Use progress_percentage from backend
        }));

        setActiveScans(mappedScans);
      } catch (error) {
        console.error("Failed to fetch active scans:", error);
      }
    };

    fetchActiveScans();
    const interval = setInterval(fetchActiveScans, 5000); // Poll every 5s

    return () => clearInterval(interval);
  }, [workspaceId, dismissedScans]);

  const dismissScan = (scanId: string) => {
    setDismissedScans((prev) => {
      const next = new Set(prev);
      next.add(scanId);
      localStorage.setItem("dismissedScans", JSON.stringify([...next]));
      return next;
    });

    setActiveScans((prev) => prev.filter((scan) => scan.id !== scanId));
  };

  const clearDismissed = () => {
    setDismissedScans(new Set());
    localStorage.removeItem("dismissedScans");
  };

  return {
    activeScans,
    dismissScan,
    clearDismissed,
  };
}

// Explicit export to ensure module is recognized
export default useActiveScans;
