// components/dashboard/project-detail.tsx (UPDATED WITH BREADCRUMBS & IMPROVED UX)
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import {
//   Breadcrumb,
//   BreadcrumbItem,
//   BreadcrumbLink,
//   BreadcrumbList,
//   BreadcrumbPage,
//   BreadcrumbSeparator,
// } from "@/components/ui/breadcrumb";
import {
  GitBranch,
  Settings,
  AlertCircle,
  Loader2,
  ExternalLink,
  Lock,
  Globe,
  User,
  Link2,
  Zap,
  Shield,
  CheckCircle2,
  XCircle,
  Activity,
  ArrowRight,
  Calendar,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { repositoriesApi } from "@/lib/api/repositories";
import { scansApi } from "@/lib/api/scans";
import type { Repository } from "@/lib/api/repositories";
import type { Scan } from "@/lib/api/scans";


export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Repository | null>(null);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectData, scansData] = await Promise.all([
        repositoriesApi.getById(projectId),
        scansApi.getHistory(projectId, { page: 1, limit: 3 }),
      ]);

      setProject(projectData);
      setRecentScans(scansData.scans);
    } catch (err: any) {
      setError(err.message || "Failed to load project");
    } finally {
      setLoading(false);
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

      router.push(`/dashboard/projects/${projectId}/scans/${result.scan_id}/report`);
    } catch (err: any) {
      setError(err.message || "Failed to start scan");
    } finally {
      setIsScanning(false);
    }
  };

  const getStatusBadge = (status: Repository["status"]) => {
    const config = {
      active: {
        label: "Active",
        className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
        description: "Project is active and being monitored",
      },
      inactive: {
        label: "Inactive",
        className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
        description: "Project is not being monitored",
      },
      error: {
        label: "Error",
        className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
        description: "There was an error accessing this project",
      },
    };
    return config[status] || config.inactive;
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
        label: "Normalizing",
        icon: Activity,
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400",
      },
      ai_enriching: {
        label: "AI Enriching",
        icon: Zap,
        className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400",
      },
      completed: {
        label: "Completed",
        icon: CheckCircle2,
        className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
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

  const getProviderIcon = (provider: string) => {
    return provider === "github" ? "🔷" : "📦";
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

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

  const latestScan = recentScans[0] || null;

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
        {/* <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/projects">Projects</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Project Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb> */}

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Project not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const statusBadge = getStatusBadge(project.status);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      {/* <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/projects">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb> */}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-3xl">{getProviderIcon(project.provider)}</div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{project.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
            {project.private ? (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Private
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Public
              </Badge>
            )}
            <Badge variant="outline" className="capitalize">
              {project.provider}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/projects/${projectId}/settings`}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button onClick={handleRunScan} disabled={isScanning}>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scans">
            Recent Scans
            {recentScans.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {recentScans.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Project Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>Owner</span>
                  </div>
                  <span className="font-medium text-sm">{project.owner}</span>
                </div>

                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <GitBranch className="h-4 w-4" />
                    <span>Default Branch</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    {project.default_branch}
                  </Badge>
                </div>

                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Last Scan</span>
                  </div>
                  <span className="text-sm">{formatDate(project.last_scan)}</span>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ExternalLink className="h-4 w-4" />
                    <span>Repository</span>
                  </div>
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1"
                  >
                    View on {project.provider}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Latest Scan Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latest Scan</CardTitle>
              </CardHeader>
              <CardContent>
                {latestScan ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge className={getScanStatusBadge(latestScan.status).className}>
                        {getScanStatusBadge(latestScan.status).label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Date</span>
                      <span className="text-sm">{formatDate(latestScan.created_at)}</span>
                    </div>

                    {latestScan.status === "completed" && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Total Issues</span>
                          <span className="font-semibold">{latestScan.vulnerabilities_found}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {latestScan.critical_count}
                            </div>
                            <div className="text-xs text-muted-foreground">Critical</div>
                          </div>
                          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
                            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                              {latestScan.high_count}
                            </div>
                            <div className="text-xs text-muted-foreground">High</div>
                          </div>
                        </div>
                      </>
                    )}

                    <Button asChild className="w-full" size="sm">
                      <Link href={`/dashboard/projects/${projectId}/scans/${latestScan.id}/report`}>
                        View Full Report
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No scans yet</p>
                    <Button onClick={handleRunScan} disabled={isScanning} size="sm">
                      <Zap className="mr-2 h-4 w-4" />
                      Run First Scan
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{recentScans.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Scans</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {recentScans.filter((s) => s.status === "completed").length}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Completed</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {latestScan?.vulnerabilities_found || 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Latest Issues</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold capitalize">{project.status}</div>
                  <div className="text-xs text-muted-foreground mt-1">Status</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Scans Tab */}
        <TabsContent value="scans" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Recent Scans</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Last 3 security scans for this project
                </p>
              </div>
              <Button onClick={handleRunScan} disabled={isScanning} size="sm">
                <Zap className="mr-2 h-4 w-4" />
                New Scan
              </Button>
            </CardHeader>
            <CardContent>
              {recentScans.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <h3 className="text-lg font-semibold mb-2">No scans yet</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Start your first security scan to identify vulnerabilities
                  </p>
                  <Button onClick={handleRunScan} disabled={isScanning}>
                    <Zap className="mr-2 h-4 w-4" />
                    Run First Scan
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {recentScans.map((scan) => {
                      const scanBadge = getScanStatusBadge(scan.status);
                      const StatusIcon = scanBadge.icon;

                      return (
                        <Link
                          key={scan.id}
                          href={`/dashboard/projects/${projectId}/scans/${scan.id}/report`}
                          className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <StatusIcon className={`h-4 w-4 ${scan.status === "running" ? "animate-pulse" : ""}`} />
                              <Badge className={scanBadge.className}>{scanBadge.label}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {formatDate(scan.created_at)}
                              </span>
                            </div>
                            {scan.completed_at && scan.started_at && (
                              <span className="text-xs text-muted-foreground">
                                {formatDuration(scan.started_at, scan.completed_at)}
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
                                  <span className="text-muted-foreground">Issues:</span>{" "}
                                  <span className="font-semibold">{scan.vulnerabilities_found}</span>
                                </div>
                                <div className="flex gap-2">
                                  {scan.critical_count > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                      {scan.critical_count} Critical
                                    </Badge>
                                  )}
                                  {scan.high_count > 0 && (
                                    <Badge
                                      className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400 text-xs"
                                    >
                                      {scan.high_count} High
                                    </Badge>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  {/* View All Scans Button */}
                  <div className="mt-6 pt-6 border-t">
                    <Button variant="outline" className="w-full" asChild>
                      <Link href={`/dashboard/projects/${projectId}/scan-history`}>
                        View All Scan History
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}