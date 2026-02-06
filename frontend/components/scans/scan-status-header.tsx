"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, XCircle, GitBranch, GitCommit, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ScanStatusHeaderProps {
  status: string;
  branch: string;
  commitHash: string | null;
  createdAt: string;
  completedAt: string | null;
  repositoryName: string;
  progressPercentage?: number | null;
  progressStage?: string | null;
}

export function ScanStatusHeader({
  status,
  branch,
  commitHash,
  createdAt,
  completedAt,
  repositoryName,
  progressPercentage,
  progressStage,
}: ScanStatusHeaderProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "completed":
        return {
          icon: CheckCircle2,
          iconColor: "text-emerald-500",
          badgeVariant: "default" as const,
          badgeClassName: "bg-emerald-600 hover:bg-emerald-700",
          title: "Scan Complete",
          bgGradient: "from-emerald-950/20 to-teal-950/10",
        };
      case "running":
        return {
          icon: Loader2,
          iconColor: "text-blue-500 animate-spin",
          badgeVariant: "secondary" as const,
          badgeClassName: "bg-blue-600 hover:bg-blue-700",
          title: "Scan Running",
          bgGradient: "from-blue-950/20 to-indigo-950/10",
        };
      case "normalizing":
        return {
          icon: Loader2,
          iconColor: "text-purple-500 animate-spin",
          badgeVariant: "secondary" as const,
          badgeClassName: "bg-purple-600 hover:bg-purple-700",
          title: "Finalizing Results",
          bgGradient: "from-purple-950/20 to-violet-950/10",
        };
      case "pending":
        return {
          icon: Clock,
          iconColor: "text-yellow-500",
          badgeVariant: "secondary" as const,
          badgeClassName: "bg-yellow-600 hover:bg-yellow-700",
          title: "Scan Queued",
          bgGradient: "from-yellow-950/20 to-amber-950/10",
        };
      case "failed":
        return {
          icon: XCircle,
          iconColor: "text-red-500",
          badgeVariant: "destructive" as const,
          badgeClassName: "bg-red-600 hover:bg-red-700",
          title: "Scan Failed",
          bgGradient: "from-red-950/20 to-rose-950/10",
        };
      default:
        return {
          icon: Clock,
          iconColor: "text-yellow-500",
          badgeVariant: "secondary" as const,
          badgeClassName: "bg-yellow-600 hover:bg-yellow-700",
          title: `Scan ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          bgGradient: "from-yellow-950/20 to-amber-950/10",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Card className={`border-slate-700 bg-gradient-to-r ${config.bgGradient} backdrop-blur-sm`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
              <Icon className={`h-8 w-8 ${config.iconColor}`} />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-100 mb-2">
                {config.title}
              </h3>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="flex items-center gap-1.5">
                  <GitCommit className="h-4 w-4" />
                  <span className="text-slate-500">Commit:</span>
                  <code className="text-xs bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                    {commitHash?.substring(0, 7) || 'unknown'}
                  </code>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1.5">
                  <GitBranch className="h-4 w-4" />
                  <span className="text-slate-500">Branch:</span>
                  <code className="text-xs bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700 text-slate-300">
                    {branch}
                  </code>
                </span>
                {completedAt && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      <span className="text-slate-500">
                        Completed {formatDistanceToNow(new Date(completedAt), { addSuffix: true })}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Progress for running/normalizing/pending scans */}
            {(status === "running" || status === "normalizing" || status === "pending") && 
             progressPercentage !== null && progressPercentage !== undefined && (
              <div className="flex items-center gap-2 min-w-[200px]">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {progressStage || (status === "normalizing" ? "Finalizing..." : status === "pending" ? "Queued..." : "Scanning...")}
                    </span>
                    <span className="font-semibold text-emerald-400">
                      {Math.round(progressPercentage)}%
                    </span>
                  </div>
                  <Progress value={progressPercentage} className="h-1.5" />
                </div>
              </div>
            )}
            <Badge variant={config.badgeVariant} className={`${config.badgeClassName} text-white px-4 py-1.5`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
