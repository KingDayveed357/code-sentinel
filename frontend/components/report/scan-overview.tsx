// components/report/scan-overview.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch,
  Timer,
  FileCode,
  Shield,
  Activity,
  Calendar,
  GitCommit,
} from "lucide-react";
import type { Scan } from "@/lib/api/scans";

interface ScanOverviewProps {
  scan: Scan;
}

export function ScanOverview({ scan }: ScanOverviewProps) {
  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt || !completedAt) return "N/A";
    const start = new Date(startedAt);
    const end = new Date(completedAt);
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Scan Overview
        </CardTitle>
        <CardDescription>Summary of scan execution and results</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4" />
              <span>Branch</span>
            </div>
            <p className="text-lg font-semibold font-mono break-all">{scan.branch}</p>
          </div>

          {scan.commit_sha && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <GitCommit className="h-4 w-4" />
                <span>Commit</span>
              </div>
              <p className="text-lg font-semibold font-mono text-xs">
                {scan.commit_sha.slice(0, 8)}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span>Duration</span>
            </div>
            <p className="text-lg font-semibold">
              {formatDuration(scan.started_at, scan.completed_at)}
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileCode className="h-4 w-4" />
              <span>Files Scanned</span>
            </div>
            <p className="text-lg font-semibold">{scan.files_scanned?.toLocaleString() || "N/A"}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Scan Type</span>
            </div>
            <Badge variant="outline" className="text-sm capitalize">{scan.scan_type}</Badge>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Started</span>
            </div>
            <p className="text-sm font-medium">
              {scan.started_at
                ? new Date(scan.started_at).toLocaleString()
                : "N/A"}
            </p>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Severity Distribution */}
        <div>
          <h3 className="font-semibold mb-4">Vulnerability Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
              <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">
                {scan.critical_count}
              </div>
              <div className="text-xs font-medium text-red-800 dark:text-red-300">Critical</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900">
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-1">
                {scan.high_count}
              </div>
              <div className="text-xs font-medium text-orange-800 dark:text-orange-300">High</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
              <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mb-1">
                {scan.medium_count}
              </div>
              <div className="text-xs font-medium text-yellow-800 dark:text-yellow-300">Medium</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                {scan.low_count}
              </div>
              <div className="text-xs font-medium text-blue-800 dark:text-blue-300">Low</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
              <div className="text-3xl font-bold text-gray-600 dark:text-gray-400 mb-1">
                {scan.info_count || 0}
              </div>
              <div className="text-xs font-medium text-gray-800 dark:text-gray-400">Info</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}