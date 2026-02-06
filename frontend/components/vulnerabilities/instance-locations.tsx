// frontend/components/vulnerabilities/instance-locations.tsx
"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileCode, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface VulnerabilityInstance {
  id: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  package_name: string | null;
  package_version: string | null;
  detected_at: string;
  scans?: {
    id: string;
    created_at: string;
    branch: string | null;
    commit_hash: string | null;
  };
}

interface InstanceLocationsProps {
  instances: VulnerabilityInstance[];
  scannerType: string;
  totalCount?: number;
  currentPage?: number;
  totalPages?: number;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

/**
 * ✅ INSTANCE EXPLOSION CONTROL
 * This component displays vulnerability instances with:
 * - Collapsed by default (shows first 5)
 * - Pagination support for large instance counts
 * - "Show More" button to load additional instances
 * - Never renders all instances at once
 */
export function InstanceLocations({ 
  instances, 
  scannerType,
  totalCount,
  currentPage = 1,
  totalPages = 1,
  onLoadMore,
  isLoadingMore = false
}: InstanceLocationsProps) {
  // ✅ COLLAPSED BY DEFAULT: Only show first 5 instances initially
  const [isExpanded, setIsExpanded] = useState(false);
  const displayLimit = 5;
  const displayedInstances = isExpanded ? instances : instances.slice(0, displayLimit);
  const hasMore = instances.length > displayLimit || (currentPage < totalPages);
  const actualTotal = totalCount || instances.length;

  if (!instances || instances.length === 0) {
    return null;
  }

  const isFileBasedScanner = ["sast", "secret", "iac"].includes(scannerType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Affected Locations
          {/* ✅ TOTAL COUNT: Always visible to show scope */}
          <Badge variant="secondary" className="ml-auto">
            {actualTotal} {actualTotal === 1 ? "instance" : "instances"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* ✅ DETERMINISTIC DISPLAY: Show instances in stable order (most recent first) */}
          {displayedInstances.map((instance, index) => (
            <div
              key={instance.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <FileCode className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {isFileBasedScanner ? (
                  <>
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded block truncate">
                      {instance.file_path || "unknown"}
                      {instance.line_start && `:${instance.line_start}`}
                      {instance.line_end && instance.line_end !== instance.line_start && `-${instance.line_end}`}
                    </code>
                    {instance.scans && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>
                          Scan: {formatDistanceToNow(new Date(instance.scans.created_at), { addSuffix: true })}
                        </span>
                        {instance.scans.branch && (
                          <>
                            <span>•</span>
                            <span>Branch: {instance.scans.branch}</span>
                          </>
                        )}
                        {instance.scans.commit_hash && (
                          <>
                            <span>•</span>
                            <span>Commit: {instance.scans.commit_hash.substring(0, 7)}</span>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium">
                      {instance.package_name || "unknown package"}
                      {instance.package_version && (
                        <span className="text-muted-foreground ml-2">v{instance.package_version}</span>
                      )}
                    </div>
                    {instance.scans && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Detected {formatDistanceToNow(new Date(instance.scans.created_at), { addSuffix: true })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ✅ PAGINATION CONTROLS: Show More / Show Less buttons */}
        {hasMore && (
          <div className="mt-4 flex flex-col gap-2">
            {!isExpanded && instances.length > displayLimit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(true)}
                className="w-full"
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Show {instances.length - displayLimit} more on this page
              </Button>
            )}
            
            {isExpanded && instances.length > displayLimit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(false)}
                className="w-full"
              >
                <ChevronUp className="h-4 w-4 mr-2" />
                Show less
              </Button>
            )}

            {/* Load more from server if there are more pages */}
            {currentPage < totalPages && onLoadMore && (
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="w-full"
              >
                {isLoadingMore ? "Loading..." : `Load more instances (${actualTotal - instances.length} remaining)`}
              </Button>
            )}
          </div>
        )}

        {/* Show current pagination status */}
        {totalPages > 1 && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            Showing {instances.length} of {actualTotal} instances
            {currentPage > 1 && ` (Page ${currentPage} of ${totalPages})`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
