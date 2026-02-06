// components/dashboard/project-detail.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GitBranch,
  Settings,
  AlertCircle,
  Loader2,
  ExternalLink,
  Zap,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  FileCode,
  Shield,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { repositoriesApi } from "@/lib/api/repositories";
import { scansApi } from "@/lib/api/scans";
import { vulnerabilitiesApi } from "@/lib/api/vulnerabilities";
import type { Repository } from "@/lib/api/repositories";
import type { Scan } from "@/lib/api/scans";
import type { Vulnerability } from "@/lib/api/vulnerabilities";
import { toast } from "sonner";


export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Repository | null>(null);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [topVulnerabilities, setTopVulnerabilities] = useState<Vulnerability[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [vulnsLoading, setVulnsLoading] = useState(false);
  const [vulnsError, setVulnsError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectData, scansData] = await Promise.all([
        repositoriesApi.getById(projectId),
        scansApi.getHistory(projectId, { page: 1, limit: 5 }),
      ]);

      setProject(projectData);
      setRecentScans(scansData.scans);
      setTotalScans(scansData.total);

      // Load top 5 vulnerabilities from the latest completed scan
      const latestCompletedScan = scansData.scans.find(s => s.status === 'completed');
      if (latestCompletedScan) {
        loadTopVulnerabilities(latestCompletedScan.id);
      }
    } catch (err: any) {
      console.error('Failed to load project data:', err);
      setError(err.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  const loadTopVulnerabilities = async (scanId: string) => {
    try {
      setVulnsLoading(true);
      setVulnsError(null);
      
      console.log('🔍 Loading top vulnerabilities for scan:', scanId);
      
      // Fetch vulnerabilities without severity filter to avoid API validation error
      const vulnsData = await vulnerabilitiesApi.getVulnerabilitiesByScan(
        scanId,
        { limit: 100 } // Get more to filter client-side
      );
      
      console.log('✅ Loaded vulnerabilities:', vulnsData);
      
      // Filter and sort on client side to get top 5 critical/high severity
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const topVulns = vulnsData.vulnerabilities
        .filter(v => v.severity === 'critical' || v.severity === 'high')
        .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
        .slice(0, 5);
      
      // If we don't have 5 critical/high, fill with medium/low
      if (topVulns.length < 5) {
        const remaining = vulnsData.vulnerabilities
          .filter(v => v.severity !== 'critical' && v.severity !== 'high')
          .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
          .slice(0, 5 - topVulns.length);
        topVulns.push(...remaining);
      }
      
      setTopVulnerabilities(topVulns);
    } catch (err: any) {
      console.error('❌ Failed to load vulnerabilities:', err);
      setVulnsError(err.message || 'Failed to load vulnerabilities');
    } finally {
      setVulnsLoading(false);
    }
  };

  const handleRunScan = async () => {
    if (!project) return;

    try {
      setIsScanning(true);
      setError(null);

      const result = await scansApi.start(projectId, {
        branch: project.default_branch,
        scan_type: "full",
      });

      toast.success(
        <div>
          <strong>Scan started</strong>
          <p>Scanning {project.name}... Check the banner above for progress.</p>
        </div>
      );

      // Reload data to show new scan
      setTimeout(() => {
        loadData();
      }, 2000);

      // NO REDIRECT - Banner will show scan status
    } catch (err: any) {
      toast.error(
        <div>
          <strong>Failed to start scan</strong>
          <p className="text-sm">{err.message || "An error occurred"}</p>
        </div>
      );
      setError(err.message || "Failed to start scan");
    } finally {
      setIsScanning(false);
    }
  };

  const calculateRiskScore = (scan: Scan | null | undefined): number => {
    if (!scan || scan.status !== 'completed') return 0;
    
    const score = (scan.critical_count * 10) + (scan.high_count * 5) + 
                  (scan.medium_count || 0) * 2 + (scan.low_count || 0);
    return Math.min(100, score);
  };

  const getRiskScoreColor = (score: number): string => {
    if (score >= 80) return "bg-red-500/10 text-red-500 border-red-500/20";
    if (score >= 50) return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    if (score >= 20) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-primary/10 text-primary border-primary/20";
  };

  const getSeverityBadge = (severity: string) => {
    const config = {
      critical: { label: "C", className: "bg-red-500 text-white" },
      high: { label: "H", className: "bg-orange-500 text-white" },
      medium: { label: "M", className: "bg-yellow-500 text-white" },
      low: { label: "L", className: "bg-blue-500 text-white" },
      info: { label: "I", className: "bg-gray-500 text-white" },
    };
    return config[severity as keyof typeof config] || config.info;
  };

  const getScanStatusBadge = (status: Scan["status"]) => {
    const config = {
      pending: {
        label: "Pending",
        icon: Clock,
        className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400",
      },
      running: {
        label: "Running",
        icon: Activity,
        className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 animate-pulse",
      },
      normalizing: {
        label: "Processing",
        icon: Activity,
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400",
      },
      ai_enriching: {
        label: "AI Analysis",
        icon: Zap,
        className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400",
      },
      completed: {
        label: "Completed",
        icon: CheckCircle2,
        className: "bg-green-500/10 text-green-500 border-green-500/20",
      },
      failed: {
        label: "Failed",
        icon: XCircle,
        className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
      },
      cancelled: {
        label: "Cancelled",
        icon: XCircle,
        className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
      },
    };
    return config[status] || config.pending;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return "Just now";
    if (hours < 2) return "2 hours ago";
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
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

  const getVulnerabilityFilePath = (vuln: Vulnerability): string => {
    if ('file_path' in vuln) return vuln.file_path;
    if ('image_name' in vuln) return vuln.image_name;
    return 'Unknown';
  };

  const getVulnerabilityLineNumber = (vuln: Vulnerability): number | null => {
    if ('line_start' in vuln) return vuln.line_start;
    return null;
  };

  const latestScan = recentScans[0] || null;
  const riskScore = calculateRiskScore(latestScan);
  const riskColor = getRiskScoreColor(riskScore);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Project not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Project Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight mb-2">{project.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>{project.default_branch}</span>
            <span>•</span>
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              {project.full_name}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/projects/${projectId}/settings`}>
              <Settings className="mr-2 h-4 w-4" />
             Settings
            </Link>
          </Button>
          <Button 
            onClick={handleRunScan} 
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Run Scan
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards - 4 Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Risk Score Card */}
        <Card className="">
          <CardHeader className="pb-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Risk Score
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`${riskColor} text-2xl font-bold px-4 py-2`}>
                {riskScore}
              </Badge>
              <div className="flex items-center gap-1 text-xs">
                {riskScore >= 50 ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">High</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">Low</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Scan Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Last Scan
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {latestScan ? (
              <div className="space-y-1">
                <Badge 
                  variant="outline" 
                  className={getScanStatusBadge(latestScan.status).className}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {getScanStatusBadge(latestScan.status).label}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {formatDate(latestScan.created_at)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Never scanned</p>
            )}
          </CardContent>
        </Card>

        {/* Open Issues Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Open Issues
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {latestScan && latestScan.status === 'completed' ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {latestScan.critical_count > 0 && (
                  <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                    {latestScan.critical_count} critical
                  </Badge>
                )}
                {latestScan.high_count > 0 && (
                  <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">
                    {latestScan.high_count} high
                  </Badge>
                )}
                {latestScan.medium_count > 0 && (
                  <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs">
                    {latestScan.medium_count} medium
                  </Badge>
                )}
                {latestScan.vulnerabilities_found === 0 && (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                    No issues
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        {/* Total Scans Card - NEW */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Scans
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold">{totalScans}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {totalScans > 0 ? (
                  <>
                    <Shield className="h-3 w-3" />
                    <span>Monitored</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3 w-3" />
                    <span>Start scanning</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Scans Section - More Detailed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Recent Scans</CardTitle>
          <Link 
            href={`/dashboard/projects/${projectId}/scan-history`}
            className="text-sm text-primary hover:underline"
          >
            View All
          </Link>
        </CardHeader>
        <CardContent>
          {recentScans.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">No scans yet</p>
              <Button 
                onClick={handleRunScan} 
                disabled={isScanning}
              >
                <Zap className="mr-2 h-4 w-4" />
                Run First Scan
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentScans.slice(0, 3).map((scan, index) => {
                const scanBadge = getScanStatusBadge(scan.status);
                const StatusIcon = scanBadge.icon;

                return (
                  <Link
                    key={scan.id}
                    href={`/dashboard/scans/${scan.id}`}
                    className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${scan.status === 'running' ? 'animate-pulse' : ''}`} />
                        <Badge className={getScanStatusBadge(scan.status).className}>
                          {getScanStatusBadge(scan.status).label}
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
        </CardContent>
      </Card>

      {/* Top 5 Vulnerabilities Section - State-driven rendering */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Top Vulnerabilities</CardTitle>
          {latestScan && latestScan.status === "completed" && topVulnerabilities.length > 0 && (
            <Link 
              href={`/dashboard/scans/${latestScan.id}`}
              className="text-sm text-primary hover:underline"
            >
              View All
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {/* State A: No scans ever */}
          {!latestScan && (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Run a scan to view vulnerabilities</p>
              <p className="text-xs text-muted-foreground mb-4">Start your first security scan to see results here</p>
              <Button 
                onClick={handleRunScan} 
                disabled={isScanning}
                size="sm"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Run Scan
                  </>
                )}
              </Button>
            </div>
          )}

          {/* State B: Scan in progress */}
          {latestScan && (latestScan.status === "running" || latestScan.status === "pending" || latestScan.status === "normalizing" || latestScan.status === "ai_enriching") && (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Scanning in progress...</p>
              <p className="text-xs text-muted-foreground">Results will appear here when the scan completes</p>
            </div>
          )}

          {/* State C: Scan failed */}
          {latestScan && latestScan.status === "failed" && (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Scan failed</p>
              <p className="text-xs text-muted-foreground mb-4">The scan encountered an error. Please try again.</p>
              <Button 
                onClick={handleRunScan} 
                disabled={isScanning}
                size="sm"
                variant="outline"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Retry Scan
                  </>
                )}
              </Button>
            </div>
          )}

          {/* State D: Loading vulnerabilities */}
          {latestScan && latestScan.status === "completed" && vulnsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* State E: Error loading vulnerabilities */}
          {latestScan && latestScan.status === "completed" && vulnsError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{vulnsError}</AlertDescription>
            </Alert>
          )}

          {/* State F: Completed scan with zero vulnerabilities */}
          {latestScan && 
           latestScan.status === "completed" && 
           !vulnsLoading && 
           !vulnsError && 
           topVulnerabilities.length === 0 && (
            <div className="text-center py-8">
              <ShieldCheck className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-green-500 mb-1">No vulnerabilities found</p>
              <p className="text-xs text-muted-foreground">Your code is looking secure 🎉</p>
            </div>
          )}

          {/* State G: Completed scan with vulnerabilities */}
          {latestScan && 
           latestScan.status === "completed" && 
           !vulnsLoading && 
           !vulnsError && 
           topVulnerabilities.length > 0 && (
            <div className="space-y-2">
              {topVulnerabilities.map((vuln) => {
                const severityBadge = getSeverityBadge(vuln.severity);
                const filePath = getVulnerabilityFilePath(vuln);
                const lineNumber = getVulnerabilityLineNumber(vuln);
                
                return (
                  <div
                    key={vuln.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge className={`${severityBadge.className} w-7 h-7 flex items-center justify-center rounded text-xs font-bold`}>
                        {severityBadge.label}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{vuln.title}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <FileCode className="h-3 w-3" />
                          <span className="truncate">
                            {filePath}
                            {lineNumber && `:${lineNumber}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white text-xs"
                      asChild
                    >
                      <Link href={`/dashboard/scans/${latestScan?.id}#${vuln.id}`}>
                        Open
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}