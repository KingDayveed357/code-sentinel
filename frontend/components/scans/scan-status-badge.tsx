"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScanStatus } from "@/lib/api/scans";

interface ScanStatusBadgeProps {
  status: ScanStatus;
  progressPercentage?: number | null;
  progressStage?: string | null;
  showProgress?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * ✅ Wave 1: Unified scan status badge component
 * Handles canonical status lifecycle: queued → processing → completed/failed
 * AI enrichment is tracked separately and not shown here
 */
export function ScanStatusBadge({
  status,
  progressPercentage,
  progressStage,
  showProgress = false,
  size = "md",
  className,
}: ScanStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "completed":
        return {
          icon: CheckCircle2,
          iconColor: "text-emerald-500",
          badgeVariant: "default" as const,
          badgeClassName: "bg-emerald-600 hover:bg-emerald-700 text-white",
          label: "Completed",
        };
      case "processing":
        return {
          icon: Loader2,
          iconColor: "text-blue-500",
          badgeVariant: "secondary" as const,
          badgeClassName: "bg-blue-600 hover:bg-blue-700 text-white",
          label: "Processing",
          animate: true,
        };
      case "failed":
        return {
          icon: XCircle,
          iconColor: "text-red-500",
          badgeVariant: "destructive" as const,
          badgeClassName: "bg-red-600 hover:bg-red-700 text-white",
          label: "Failed",
        };
      case "queued":
        return {
          icon: Clock,
          iconColor: "text-yellow-500",
          badgeVariant: "secondary" as const,
          badgeClassName: "bg-yellow-600 hover:bg-yellow-700 text-white",
          label: "Queued",
        };
      default:
        // Fallback for any unexpected status
        return {
          icon: Clock,
          iconColor: "text-muted-foreground",
          badgeVariant: "outline" as const,
          badgeClassName: "",
          label: status.charAt(0).toUpperCase() + status.slice(1),
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const iconSize = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge
        variant={config.badgeVariant}
        className={cn(
          config.badgeClassName,
          size === "sm" && "text-xs px-2 py-0.5",
          size === "md" && "text-sm px-2.5 py-1",
          size === "lg" && "text-base px-3 py-1.5"
        )}
      >
        <Icon
          className={cn(
            iconSize,
            config.iconColor,
            config.animate && "animate-spin",
            "mr-1.5"
          )}
        />
        {config.label}
      </Badge>

      {/* Progress indicator for processing scans */}
      {status === "processing" && showProgress && progressPercentage !== null && progressPercentage !== undefined && (
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={progressPercentage} className="h-1.5 flex-1" />
          <span className="text-xs font-medium text-muted-foreground min-w-[35px] text-right">
            {Math.round(progressPercentage)}%
          </span>
        </div>
      )}

      {/* Progress stage text */}
      {status === "processing" && showProgress && progressStage && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {progressStage}
        </span>
      )}
    </div>
  );
}
