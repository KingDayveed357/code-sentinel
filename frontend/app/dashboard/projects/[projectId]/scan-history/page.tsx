// app/dashboard/projects/[projectId]/scan-history/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Activity,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { scansApi, type Scan } from "@/lib/api/scans";
import { repositoriesApi, type Repository } from "@/lib/api/repositories";

export default function ScanHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const [project, setProject] = useState<Repository | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const limit = 10;

  useEffect(() => {
    loadData();
  }, [projectId, page, statusFilter, severityFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectData, scansData] = await Promise.all([
        repositoriesApi.getById(projectId),
        scansApi.getHistory(projectId, { page, limit }),
      ]);

      setProject(projectData);
      setScans(scansData.scans);
      setTotal(scansData.total);
      setTotalPages(scansData.pages);
    } catch (err: any) {
      setError(err.message || "Failed to load scan history");
    } finally {
      setLoading(false);
    }
  };

  const getScanStatusBadge = (status: Scan["status"]) => {
    const config = {
      pending: { label: "Pending", icon: Clock, className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400" },
      running: { label: "Running", icon: Activity, className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 animate-pulse" },
      normalizing: { label: "Normalizing", icon: Activity, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400" },
      ai_enriching: { label: "AI Enriching", icon: Activity, className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400" },
      completed: { label: "Completed", icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400" },
      failed: { label: "Failed", icon: XCircle, className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400" },
      cancelled: { label: "Cancelled", icon: XCircle, className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400" },
    };
    return config[status] || config.pending;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt || !completedAt) return "N/A";
    const start = new Date(startedAt);
    const end = new Date(completedAt);
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="space-y-6">

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
            <p className="text-muted-foreground mt-1">
              View all security scans for {project?.name}
            </p>
          </div>
        </div>
      </div>

      {error && project && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <CardTitle>Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => {
                setStatusFilter("all");
                setSeverityFilter("all");
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scan List */}
      <Card>
        <CardHeader>
          <CardTitle>All Scans ({total})</CardTitle>
          <CardDescription>Complete history of security scans</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : scans.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">No scans found</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {statusFilter !== "all" || severityFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Start your first scan to see results here"}
              </p>
              <Button asChild>
                <Link href={`/dashboard/projects/${projectId}`}>Run First Scan</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {scans.map((scan) => {
                const statusBadge = getScanStatusBadge(scan.status);
                const StatusIcon = statusBadge.icon;

                return (
                  <Link
                    key={scan.id}
                    href={`/dashboard/projects/${projectId}/scans/${scan.id}/report`}
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${scan.status === 'running' ? 'animate-pulse' : ''}`} />
                        <Badge className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(scan.created_at)}
                        </span>
                      </div>
                      {scan.completed_at && scan.started_at && (
                        <span className="text-xs text-muted-foreground">
                          Duration: {formatDuration(scan.started_at, scan.completed_at)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-6 text-sm flex-wrap">
                      <div>
                        <span className="text-muted-foreground">Branch:</span>{" "}
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">
                          {scan.branch}
                        </code>
                      </div>

                      {scan.status === "completed" && (
                        <>
                          <div>
                            <span className="text-muted-foreground">Total Issues:</span>{" "}
                            <span className="font-semibold">{scan.vulnerabilities_found}</span>
                          </div>
                          <div className="flex gap-2">
                            {scan.critical_count > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {scan.critical_count} Critical
                              </Badge>
                            )}
                            {scan.high_count > 0 && (
                              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400 text-xs">
                                {scan.high_count} High
                              </Badge>
                            )}
                            {scan.medium_count > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {scan.medium_count} Medium
                              </Badge>
                            )}
                          </div>
                        </>
                      )}

                      {scan.files_scanned && (
                        <div>
                          <span className="text-muted-foreground">Files:</span>{" "}
                          <span className="font-medium">{scan.files_scanned}</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} scans
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}