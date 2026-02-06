"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  TrendingDown,
  Clock,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useActiveScans } from "@/hooks/use-active-scans";

export function ScanStatusBanner() {
  const router = useRouter();
  const { activeScans, dismissScan } = useActiveScans();

  const sortedScans = useMemo(() => {
    return [...activeScans].sort((a, b) => {
      // Running scans first, then completed/failed, then pending
      const priority: Record<string, number> = {
        running: 0,
        completed: 1,
        failed: 1,
        pending: 2,
        cancelled: 2,
      };
      return (priority[a.status] || 3) - (priority[b.status] || 3);
    });
  }, [activeScans]);

  if (activeScans.length === 0) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case "failed":
      case "cancelled":
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case "running":
        return (
          <div className="relative h-5 w-5">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          </div>
        );
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      completed: "default",
      running: "secondary",
      failed: "destructive",
      pending: "outline",
      cancelled: "outline",
    };

    const labels: Record<string, string> = {
      running: "Running",
      pending: "Queued",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    };

    return (
      <Badge variant={variants[status] || "outline"} className="text-xs font-medium">
        {labels[status] || status}
      </Badge>
    );
  };

  const getStatusDescription = (
    status: string,
    progress?: number,
    error_message?: string
  ) => {
    switch (status) {
      case "running":
        return (
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-xs text-muted-foreground">
              Scanning in progress • {progress || 0}% complete
            </span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              Scan completed • Ready to review
            </span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs text-destructive truncate">
              {error_message || "Scan failed"}
            </span>
          </div>
        );
      case "pending":
        return (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Queued and waiting to start
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const hasRunning = sortedScans.some((s) => s.status === "running");

  return (
    <div className="space-y-2 mb-4">
      {sortedScans.map((scan, idx) => (
        <div
          key={scan.id}
          className={`
            relative group overflow-hidden rounded-lg border transition-all duration-300
            animate-in slide-in-from-top-2 fade-in
            ${
              scan.status === "running"
                ? "border-blue-200 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/30 dark:to-transparent shadow-md"
                : scan.status === "completed"
                  ? "border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-r from-emerald-50/50 to-transparent dark:from-emerald-950/30 dark:to-transparent"
                  : scan.status === "failed"
                    ? "border-destructive/20 dark:border-destructive/30 bg-gradient-to-r from-destructive/5 to-transparent dark:from-destructive/10 dark:to-transparent"
                    : "border-muted-foreground/20 bg-card/50"
            }
          `}
          style={{
            animationDelay: `${idx * 50}ms`,
          }}
        >
          {/* Animated background gradient for running scans */}
          {scan.status === "running" && (
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/0 via-blue-400/5 to-blue-400/0 animate-pulse pointer-events-none" />
          )}

          <div className="relative px-4 py-3 flex items-center gap-3">
            {/* Status Icon */}
            <div className="flex-shrink-0">{getStatusIcon(scan.status)}</div>

            {/* Main Content */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {scan.repository.name}
                  </h3>
                  {getStatusBadge(scan.status)}
                </div>
                {scan.status === "running" && (
                  <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground bg-background/50 dark:bg-background/70 px-2 py-1 rounded">
                    <Clock className="h-3 w-3" />
                    {scan.progress === 100 ? "Finalizing" : "Scanning"}
                  </div>
                )}
              </div>

              {/* Progress bar for running scans */}
              {scan.status === "running" && scan.progress !== undefined && (
                <div className="space-y-1">
                  <Progress
                    value={scan.progress}
                    className="h-2 bg-muted"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {Math.round(scan.progress)}% complete
                    </span>
                    <span className="text-xs text-muted-foreground opacity-75">
                      {scan.progress >= 100 ? "Nearly done..." : "Analyzing..."}
                    </span>
                  </div>
                </div>
              )}

              {/* Status description */}
              {getStatusDescription(
                scan.status,
                scan.progress,
                scan.error_message
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  dismissScan(scan.id);
                }}
                className="h-8 w-8 p-0 hover:bg-muted transition-colors"
                title="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </Button>

              <Button
                size="sm"
                variant={scan.status === "running" ? "outline" : "default"}
                onClick={() => {
                  router.push(`/dashboard/scans/${scan.id}`);
                  dismissScan(scan.id);
                }}
                className={`gap-1.5 text-xs font-medium transition-all ${
                  scan.status === "running"
                    ? "hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    : ""
                }`}
              >
                <span>
                  {scan.status === "running"
                    ? "View Progress"
                    : scan.status === "completed"
                      ? "Review Results"
                      : "View Details"}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Quick stats summary */}
      {hasRunning && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground/60" />
          <span>
            {sortedScans.filter((s) => s.status === "running").length} scan
            {sortedScans.filter((s) => s.status === "running").length !== 1 ? "s" : ""} in progress •
            {sortedScans.filter((s) => s.status === "completed").length > 0 &&
              ` ${sortedScans.filter((s) => s.status === "completed").length} completed • `}
            Updates every 5 seconds
          </span>
        </div>
      )}
    </div>
  );
}
