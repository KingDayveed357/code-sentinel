"use client";

import React, { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";

interface ScanLogsViewerProps {
  logs: string | null;
  isRunning?: boolean;
}

export function ScanLogsViewer({ logs, isRunning = false }: ScanLogsViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (scrollRef.current && isRunning) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isRunning]);

  if (!logs) {
    return (
      <Card className="bg-slate-950 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-200">
            <Terminal className="h-5 w-5" />
            Scan Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-400 text-center py-8">
            No logs available for this scan
          </div>
        </CardContent>
      </Card>
    );
  }

  // Parse logs into lines
  const logLines = logs.split('\n').filter(line => line.trim());

  return (
    <Card className="bg-slate-950 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-200">
          <Terminal className="h-5 w-5" />
          Scan Logs
          {isRunning && (
            <span className="ml-auto text-xs font-normal text-emerald-400 flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md">
          <div
            ref={scrollRef}
            className="font-mono text-xs text-slate-300 space-y-0.5 p-4 bg-slate-900/50 rounded-md"
          >
            {logLines.map((line, index) => {
              // Parse timestamp and message
              const timestampMatch = line.match(/^\[([^\]]+)\]/);
              const timestamp = timestampMatch ? timestampMatch[1] : null;
              const message = timestampMatch ? line.substring(timestampMatch[0].length).trim() : line;

              // Determine log level color
              let messageColor = "text-slate-300";
              if (message.toLowerCase().includes("error") || message.toLowerCase().includes("failed")) {
                messageColor = "text-red-400";
              } else if (message.toLowerCase().includes("warning") || message.toLowerCase().includes("warn")) {
                messageColor = "text-yellow-400";
              } else if (message.toLowerCase().includes("complete") || message.toLowerCase().includes("success")) {
                messageColor = "text-emerald-400";
              } else if (message.toLowerCase().includes("found") && message.match(/\d+\s+(issue|finding)/i)) {
                messageColor = "text-orange-400";
              }

              return (
                <div key={index} className="flex gap-3 hover:bg-slate-800/30 px-2 py-0.5 rounded">
                  {timestamp && (
                    <span className="text-slate-500 flex-shrink-0 select-none">
                      [{timestamp}]
                    </span>
                  )}
                  <span className={messageColor}>{message}</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
