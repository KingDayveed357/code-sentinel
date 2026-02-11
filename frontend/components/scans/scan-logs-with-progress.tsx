"use client";

import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { useScanProgress } from "@/hooks/use-scan-progress";
import { scansApi } from "@/lib/api/scans";

interface ScanLog {
  id: string;
  created_at: string;
  level: "info" | "warning" | "error";
  message: string;
  details?: any;
}

interface ScanLogsWithProgressProps {
  scanId: string;
  workspaceId: string;
  isRunning?: boolean;
}

/**
 * ✅ Enhanced scan logs component with progress bar and percentage
 * Shows real-time progress and logs for active scans
 */
export function ScanLogsWithProgress({ scanId, workspaceId, isRunning = false }: ScanLogsWithProgressProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { progress } = useScanProgress(scanId, isRunning);

  // Fetch logs
  useEffect(() => {
    if (!scanId) return;

    const fetchLogs = async () => {
      try {
        const data = await scansApi.getLogs(workspaceId, scanId);
        setLogs(data.logs || []);
        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
        setLoading(false);
      }
    };

    fetchLogs();

    // Poll for new logs if scan is running
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      interval = setInterval(fetchLogs, 3000); // Poll every 3 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scanId, workspaceId, isRunning]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollRef.current && isRunning && logs.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, isRunning]);

  const getLogIcon = (level: string) => {
    switch (level) {
      case "error":
        return XCircle;
      case "warning":
        return AlertTriangle;
      default:
        return CheckCircle2;
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-600 dark:text-red-400";
      case "warning":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-green-600 dark:text-green-400";
    }
  };

  const progressPercent = progress?.progress_percent ?? 0;
  const currentStage = progress?.message || progress?.stage || "Initializing...";
  const currentScanner = progress?.current_scanner;

  return (
    <Card className="relative overflow-hidden border-primary/10">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Scan Progress & Logs</CardTitle>
          </div>
          {isRunning && (
            <span className="text-xs font-normal text-emerald-400 flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live
            </span>
          )}
        </div>
        <CardDescription className="text-sm">
          Real-time progress updates and detailed scan logs
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Section */}
        {isRunning && (
          <div className="space-y-2 p-4 bg-muted/30 rounded-lg border border-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <span className="text-sm font-medium">Scan Progress</span>
              </div>
              <span className="text-sm font-semibold text-primary">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentStage}</span>
              {currentScanner && (
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {currentScanner}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Completed Progress (if not running) */}
        {!isRunning && progressPercent > 0 && (
          <div className="space-y-2 p-4 bg-muted/30 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium">Scan Complete</span>
              </div>
              <span className="text-sm font-semibold text-emerald-500">100%</span>
            </div>
            <Progress value={100} className="h-2" />
          </div>
        )}

        {/* Logs Section */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Scan Logs</h4>
            {logs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {logs.length} {logs.length === 1 ? "entry" : "entries"}
              </span>
            )}
          </div>
          <div
            ref={scrollRef}
            className="relative max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 backdrop-blur-sm scroll-smooth p-3 space-y-1"
          >
            {loading && logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">Loading logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Activity className="h-8 w-8 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">No logs available yet</p>
              </div>
            ) : (
              logs.map((log, idx) => {
                const LogIcon = getLogIcon(log.level);
                const logColor = getLogColor(log.level);
                const isLatest = idx === logs.length - 1 && isRunning;

                return (
                  <div
                    key={log.id || idx}
                    className={`
                      group flex items-start gap-2 p-2 rounded-md
                      transition-all duration-200 hover:bg-muted/50
                      ${isLatest ? "bg-primary/5 border border-primary/10" : ""}
                    `}
                  >
                    <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums mt-0.5 min-w-[70px]">
                      {new Date(log.created_at).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </span>

                    <div className="relative shrink-0 mt-0.5">
                      <LogIcon className={`h-3.5 w-3.5 ${logColor}`} />
                      {isLatest && (
                        <div className="absolute inset-0">
                          <LogIcon
                            className={`h-3.5 w-3.5 ${logColor} opacity-40 animate-ping`}
                          />
                        </div>
                      )}
                    </div>

                    <span className="flex-1 text-xs text-foreground/90 leading-relaxed break-words font-mono">
                      {log.message}
                    </span>

                    {isLatest && (
                      <div className="shrink-0">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
