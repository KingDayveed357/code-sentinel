
// components/report/scan-logs.tsx
"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface ScanLog {
  level: string;
  message: string;
  created_at: string;
}

interface ScanLogsProps {
  logs: ScanLog[];
}

export function ScanLogs({ logs }: ScanLogsProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

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

  return (
    <Card className="relative overflow-hidden border-primary/10">
      {/* Subtle top border animation */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
      </div>

      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="relative">
            <Activity className="h-5 w-5 text-primary" />
            <div className="absolute -inset-1">
              <Activity className="h-5 w-5 text-primary/30 animate-ping" />
            </div>
          </div>
          Scan Progress
        </CardTitle>
        <CardDescription className="text-sm">
          Real-time updates from the scanning process
        </CardDescription>
      </CardHeader>

      <CardContent className="px-4 sm:px-6">
        <div className="relative max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 backdrop-blur-sm">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              {/* Clean loading animation */}
              <div className="relative mb-6">
                <div className="h-16 w-16 rounded-full border-4 border-muted" />
                <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-t-primary animate-spin" />
                <div className="absolute inset-2 h-12 w-12 rounded-full border-4 border-transparent border-t-primary/50 animate-spin-slow" />
                <Activity className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
              </div>

              <p className="text-sm text-muted-foreground mb-3">
                Initializing security scan...
              </p>

              {/* Clean loading dots */}
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "200ms" }} />
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
            </div>
          ) : (
            <div className="p-3 sm:p-4 space-y-1">
              {/* Active scan indicator */}
              <div className="mb-3 p-2.5 sm:p-3 bg-primary/5 border border-primary/10 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-green-500/50 animate-ping" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground mb-1.5">
                      Scanning in progress
                    </div>
                    <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="absolute inset-0 bg-primary/20" />
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-progress-bar" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Log entries */}
              <div className="space-y-1 font-mono">
                {logs.map((log, idx) => {
                  const LogIcon = getLogIcon(log.level);
                  const logColor = getLogColor(log.level);
                  const isLatest = idx === logs.length - 1;

                  return (
                    <div
                      key={idx}
                      className={`
                        group flex items-start gap-2 sm:gap-3 p-2 rounded-md
                        transition-all duration-200 hover:bg-muted/50
                        ${isLatest ? 'bg-primary/5 border border-primary/10' : ''}
                      `}
                      style={{
                        animation: `slideIn 0.3s ease-out ${idx * 0.03}s both`,
                      }}
                    >
                      <span className="text-[10px] sm:text-xs text-muted-foreground/70 shrink-0 tabular-nums mt-0.5 min-w-[60px] sm:min-w-[70px]">
                        {new Date(log.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        })}
                      </span>

                      <div className="relative shrink-0 mt-0.5">
                        <LogIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${logColor}`} />
                        {isLatest && (
                          <div className="absolute inset-0">
                            <LogIcon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${logColor} opacity-40 animate-ping`} />
                          </div>
                        )}
                      </div>

                      <span className="flex-1 text-[11px] sm:text-xs text-foreground/90 leading-relaxed break-words">
                        {log.message}
                      </span>

                      {isLatest && (
                        <div className="shrink-0">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Subtle status text */}
        {logs.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{logs.length} log entries</span>
            <span className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
        )}
      </CardContent>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes progress-bar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .animate-shimmer {
          animation: shimmer 3s ease-in-out infinite;
        }

        .animate-progress-bar {
          animation: progress-bar 2s ease-in-out infinite;
        }

        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Custom scrollbar */
        .overflow-y-auto::-webkit-scrollbar {
          width: 6px;
        }

        .overflow-y-auto::-webkit-scrollbar-track {
          background: hsl(var(--muted));
          border-radius: 3px;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: hsl(var(--muted-foreground) / 0.3);
          border-radius: 3px;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.5);
        }
      `}</style>
    </Card>
  );
}