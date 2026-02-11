"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronLeft, 
  ExternalLink, 
  CheckCircle2, 
  Loader2, 
  XCircle, 
  Clock,
  GitBranch,
  GitCommit,
  Calendar,
  Shield,
  AlertTriangle,
  Info,
  FileCode,
  Activity
} from "lucide-react";
import Link from "next/link";
import { scansApi } from "@/lib/api/scans";
import { formatDistanceToNow } from "date-fns";
import { ScanLogsWithProgress } from "@/components/scans/scan-logs-with-progress";
import { TopVulnerabilitiesList } from "@/components/vulnerabilities/top-vulnerabilities-list";

interface ScanDetail {
  id: string;
  status: string;
  branch: string;
  commit_hash: string | null;
  created_at: string;
  completed_at: string | null;
  progress_percentage?: number | null;
  progress_stage?: string | null;
  vulnerabilities_found?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
  info_count?: number;
  files_scanned?: number;
  lines_of_code?: number;
  duration_seconds?: number;
  repository: {
    id: string;
    name: string;
    full_name: string;
    url: string;
  };
  scanner_breakdown: {
    sast: { findings: number; status: string; duration_seconds: number | null };
    sca: { findings: number; status: string; duration_seconds: number | null };
    secrets: { findings: number; status: string; duration_seconds: number | null };
    iac: { findings: number; status: string; duration_seconds: number | null };
    container?: { findings: number; status: string; duration_seconds: number | null };
  };
  top_vulnerabilities: any[];
  logs: string | null;
}

export default function ScanDetailPage() {
  const { workspaceId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const scanId = params?.scanId as string;
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !scanId) return;

    const fetchScan = async () => {
      try {
        const data = await scansApi.getById(workspaceId, scanId);
        setScan(data);
        setError(null);
      } catch (err: any) {
        console.error("Failed to fetch scan:", err);
        setError(err.message || "Failed to load scan details");
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchScan();

    // ✅ FIX: Set up polling based on current scan status
    // This will be re-evaluated when scan changes
    const isRunning = scan?.status === "running" || 
                      scan?.status === "pending" || 
                      scan?.status === "normalizing" ||
                      scan?.status === "ai_enriching";
    
    let pollInterval: NodeJS.Timeout | null = null;
    if (isRunning) {
      pollInterval = setInterval(fetchScan, 3000); // Poll every 3 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [workspaceId, scanId, scan?.status]); 
  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Error state
  if (error || !scan) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/scans")}
          className="mb-6"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Scans
        </Button>
        <Card>
          <CardContent className="text-center py-12">
            <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {error || "Scan not found"}
            </p>
            <Button onClick={() => router.push("/dashboard/scans")}>
              Return to Scans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isRunning = scan.status === "running" || scan.status === "pending" || scan.status === "normalizing";
  const totalFindings = scan.vulnerabilities_found || 0;
  const hasFindings = totalFindings > 0;

  // Status configuration
  const getStatusConfig = () => {
    switch (scan.status) {
      case "completed":
        return {
          icon: CheckCircle2,
          iconColor: "text-green-600",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          textColor: "text-green-700",
          label: "Completed",
        };
      case "running":
        return {
          icon: Loader2,
          iconColor: "text-blue-600 animate-spin",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-200",
          textColor: "text-blue-700",
          label: "Running",
        };
      case "normalizing":
        return {
          icon: Loader2,
          iconColor: "text-purple-600 animate-spin",
          bgColor: "bg-purple-50",
          borderColor: "border-purple-200",
          textColor: "text-purple-700",
          label: "Finalizing",
        };
      case "pending":
        return {
          icon: Clock,
          iconColor: "text-amber-600",
          bgColor: "bg-amber-50",
          borderColor: "border-amber-200",
          textColor: "text-amber-700",
          label: "Queued",
        };
      case "failed":
        return {
          icon: XCircle,
          iconColor: "text-red-600",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-700",
          label: "Failed",
        };
      default:
        return {
          icon: Clock,
          iconColor: "text-gray-600",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          textColor: "text-gray-700",
          label: scan.status,
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/scans")}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">
                {scan.repository.name}
              </h1>
              <a
                href={scan.repository.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {scan.repository.full_name}
            </p>
          </div>
        </div>
      </div>

      {/* Status Card */}
      <Card className={`${statusConfig.borderColor} border-2`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${statusConfig.bgColor}`}>
                <StatusIcon className={`h-6 w-6 ${statusConfig.iconColor}`} />
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-foreground">
                      Scan {statusConfig.label}
                    </h3>
                    <Badge variant="outline" className={`${statusConfig.textColor} ${statusConfig.borderColor}`}>
                      {statusConfig.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Started {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}
                    {scan.completed_at && ` • Completed ${formatDistanceToNow(new Date(scan.completed_at), { addSuffix: true })}`}
                  </p>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <GitBranch className="h-3.5 w-3.5" />
                    <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
                      {scan.branch}
                    </code>
                  </div>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <GitCommit className="h-3.5 w-3.5" />
                    <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">
                      {scan.commit_hash?.substring(0, 7) || 'unknown'}
                    </code>
                  </div>
                  {scan.duration_seconds !== undefined && scan.duration_seconds !== null && (
                    <>
                      <Separator orientation="vertical" className="h-4" />
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span className="text-xs">
                          {scan.duration_seconds >= 60
                            ? `${Math.floor(scan.duration_seconds / 60)}m ${scan.duration_seconds % 60}s`
                            : `${scan.duration_seconds}s`}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Progress Bar */}
                {isRunning && scan.progress_percentage !== null && scan.progress_percentage !== undefined && (
                  <div className="space-y-1.5 min-w-[300px]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {scan.progress_stage || "Processing..."}
                      </span>
                      <span className="font-medium text-foreground">
                        {Math.round(scan.progress_percentage)}%
                      </span>
                    </div>
                    <Progress value={scan.progress_percentage} className="h-2" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      {scan.status === "completed" && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Findings */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Findings</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{totalFindings}</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Critical + High */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Critical + High</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {(scan.critical_count || 0) + (scan.high_count || 0)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Files Scanned */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Files Scanned</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{scan.files_scanned || 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-purple-50">
                  <FileCode className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lines of Code */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Lines of Code</p>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {scan.lines_of_code?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-green-50">
                  <Activity className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Severity Breakdown */}
      {scan.status === "completed" && hasFindings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Findings by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Critical</span>
                  <span className="text-sm font-bold text-red-600">{scan.critical_count || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-red-100">
                  <div 
                    className="h-full rounded-full bg-red-600" 
                    style={{ width: `${totalFindings > 0 ? ((scan.critical_count || 0) / totalFindings) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">High</span>
                  <span className="text-sm font-bold text-orange-600">{scan.high_count || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-orange-100">
                  <div 
                    className="h-full rounded-full bg-orange-600" 
                    style={{ width: `${totalFindings > 0 ? ((scan.high_count || 0) / totalFindings) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Medium</span>
                  <span className="text-sm font-bold text-yellow-600">{scan.medium_count || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-yellow-100">
                  <div 
                    className="h-full rounded-full bg-yellow-600" 
                    style={{ width: `${totalFindings > 0 ? ((scan.medium_count || 0) / totalFindings) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Low</span>
                  <span className="text-sm font-bold text-blue-600">{scan.low_count || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-blue-100">
                  <div 
                    className="h-full rounded-full bg-blue-600" 
                    style={{ width: `${totalFindings > 0 ? ((scan.low_count || 0) / totalFindings) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Info</span>
                  <span className="text-sm font-bold text-gray-600">{scan.info_count || 0}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div 
                    className="h-full rounded-full bg-gray-600" 
                    style={{ width: `${totalFindings > 0 ? ((scan.info_count || 0) / totalFindings) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scanner Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scanner Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.entries(scan.scanner_breakdown).map(([scanner, data]) => (
              <div key={scanner} className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground uppercase">{scanner}</span>
                  {data.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : data.status === "running" ? (
                    <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <p className="text-2xl font-bold text-foreground">{data.findings}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.findings === 1 ? 'finding' : 'findings'}
                  {data.duration_seconds && ` • ${data.duration_seconds}s`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Scan Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scan Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {workspaceId && <ScanLogsWithProgress scanId={scan.id} workspaceId={workspaceId} isRunning={isRunning} />}
        </CardContent>
      </Card>

      {/* Top Vulnerabilities - Only show if scan is completed AND has vulnerabilities */}
      {scan.status === "completed" && 
       scan.top_vulnerabilities && 
       Array.isArray(scan.top_vulnerabilities) && 
       scan.top_vulnerabilities.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">What Should I fix first?</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/vulnerabilities?scan=${scanId}`)}
              >
                View All {totalFindings}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TopVulnerabilitiesList vulnerabilities={scan.top_vulnerabilities} />
          </CardContent>
        </Card>
      )}

      {/* Zero Findings State */}
      {scan.status === "completed" && !hasFindings && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Vulnerabilities Found</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Great news! This scan didn't detect any security vulnerabilities in your code.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Running State */}
      {isRunning && (
        <Card className="border-blue-200 ">
          <CardContent className="text-center py-8">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Scan in Progress</h3>
            <p className="text-sm text-muted-foreground">
              Your scan is currently running. Results will appear here as they become available.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
