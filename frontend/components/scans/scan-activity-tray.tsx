"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useActiveScans } from "@/hooks/use-active-scans";
import { cn } from "@/lib/utils";

/**
 * ✅ IMPROVED UX: Unified scan activity tray
 * - Collapsible to reduce UI clutter
 * - Compact summary when collapsed
 * - Full details when expanded
 * - Premium SaaS feel
 * - Scales to multiple concurrent scans
 */
export function ScanActivityTray() {
  const router = useRouter();
  const { activeScans, dismissScan } = useActiveScans();
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissedInSession, setDismissedInSession] = useState<Set<string>>(new Set());

  // Filter out session-dismissed scans
  const visibleScans = useMemo(() => {
    return activeScans.filter((scan) => !dismissedInSession.has(scan.id));
  }, [activeScans, dismissedInSession]);

  const sortedScans = useMemo(() => {
    return [...visibleScans].sort((a, b) => {
      const priority: Record<string, number> = {
        running: 0,
        pending: 1,
        completed: 2,
        failed: 2,
        cancelled: 3,
      };
      return (priority[a.status] || 4) - (priority[b.status] || 4);
    });
  }, [visibleScans]);

  const runningScans = sortedScans.filter((s) => s.status === "running");
  const completedScans = sortedScans.filter((s) => s.status === "completed");
  const failedScans = sortedScans.filter((s) => s.status === "failed");

  const handleDismiss = (scanId: string) => {
    setDismissedInSession((prev) => new Set(prev).add(scanId));
    dismissScan(scanId);
  };

  if (visibleScans.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed":
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "running":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "normalizing":
        return <Loader2 className="h-4 w-4 text-purple-500 animate-spin" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      running: "secondary",
      normalizing: "secondary",
      failed: "destructive",
      pending: "outline",
      cancelled: "outline",
    };

    const labels: Record<string, string> = {
      running: "Running",
      normalizing: "Finalizing",
      pending: "Queued",
      completed: "Done",
      failed: "Failed",
      cancelled: "Cancelled",
    };

    return (
      <Badge variant={variants[status] || "outline"} className="text-xs font-medium">
        {labels[status] || status}
      </Badge>
    );
  };

  // Collapsed view - compact summary
  if (!isExpanded) {
    return (
      <div className="mb-4 rounded-lg border bg-card/50 backdrop-blur-sm">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {runningScans.length > 0 && (
                <span className="text-blue-600 dark:text-blue-400">
                  {runningScans.length} running
                </span>
              )}
              {runningScans.length > 0 && (completedScans.length > 0 || failedScans.length > 0) && " • "}
              {completedScans.length > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {completedScans.length} completed
                </span>
              )}
              {completedScans.length > 0 && failedScans.length > 0 && " • "}
              {failedScans.length > 0 && (
                <span className="text-destructive">
                  {failedScans.length} failed
                </span>
              )}
              {runningScans.length === 0 && completedScans.length === 0 && failedScans.length === 0 && (
                <span className="text-muted-foreground">{visibleScans.length} scan{visibleScans.length !== 1 ? "s" : ""}</span>
              )}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  // Expanded view - full details
  return (
    <div className="mb-4 space-y-2 rounded-lg border bg-card/50 backdrop-blur-sm p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Scan Activity</h3>
          {runningScans.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {runningScans.length} active
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
          className="h-7 w-7 p-0"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      {/* Scan list */}
      <div className="space-y-2">
        {sortedScans.map((scan) => (
          <div
            key={scan.id}
            className={cn(
              "relative group overflow-hidden rounded-lg border transition-all",
              scan.status === "running"
                ? "border-blue-200 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/30"
                : scan.status === "completed"
                  ? "border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/30"
                  : scan.status === "failed"
                    ? "border-destructive/20 dark:border-destructive/30 bg-gradient-to-r from-destructive/5 to-transparent"
                    : "border-muted-foreground/20 bg-card/50"
            )}
          >
            {scan.status === "running" && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/5 to-blue-400/0 animate-pulse pointer-events-none" />
            )}

            <div className="relative px-3 py-2.5 flex items-center gap-2.5">
              {/* Status Icon */}
              <div className="flex-shrink-0">{getStatusIcon(scan.status)}</div>

              {/* Main Content */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="font-medium text-sm truncate">
                      {scan.repository.name}
                    </h4>
                    {getStatusBadge(scan.status)}
                  </div>
                </div>

                {/* Progress bar for running/normalizing scans */}
                {(scan.status === "running" || scan.status === "normalizing" || scan.status === "pending") && scan.progress !== undefined && (
                  <div className="space-y-1">
                    <Progress value={scan.progress} className="h-1.5 bg-muted" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {Math.round(scan.progress)}% complete
                      </span>
                      <span className="text-xs text-muted-foreground opacity-75">
                        {scan.status === "normalizing" 
                          ? "Finalizing..." 
                          : scan.status === "pending" 
                            ? "Queued..." 
                            : scan.progress >= 100 
                              ? "Finalizing..." 
                              : "Analyzing..."}
                      </span>
                    </div>
                  </div>
                )}

                {/* Status message */}
                {scan.status === "completed" && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    Scan completed • Ready to review
                  </span>
                )}
                {scan.status === "failed" && (
                  <span className="text-xs text-destructive truncate">
                    {scan.error_message || "Scan failed"}
                  </span>
                )}
                {scan.status === "pending" && (
                  <span className="text-xs text-muted-foreground">
                    Queued and waiting to start
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(scan.id)}
                  className="h-7 w-7 p-0 hover:bg-muted transition-colors"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>

                <Button
                  size="sm"
                  variant={scan.status === "running" ? "outline" : "default"}
                  onClick={() => {
                    router.push(`/dashboard/scans/${scan.id}`);
                    handleDismiss(scan.id);
                  }}
                  className="gap-1.5 text-xs font-medium h-7"
                >
                  <span>
                    {scan.status === "running"
                      ? "View"
                      : scan.status === "completed"
                        ? "Review"
                        : "Details"}
                  </span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer summary */}
      {runningScans.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/40 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span>
            {runningScans.length} scan{runningScans.length !== 1 ? "s" : ""} in progress
            {completedScans.length > 0 && ` • ${completedScans.length} completed`}
            {failedScans.length > 0 && ` • ${failedScans.length} failed`}
          </span>
        </div>
      )}
    </div>
  );
}
