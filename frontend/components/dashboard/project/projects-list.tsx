// components/dashboard/projects-list.tsx 
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search,
  Plus,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  GitBranch,
  ChevronLeft,
  Filter,
  Zap,
  Settings,
  MoreVertical,
  Play,
} from "lucide-react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { repositoriesApi } from "@/lib/api/repositories";
import { scansApi } from "@/lib/api/scans";
import type { Repository } from "@/lib/api/repositories";
import type { Scan } from "@/lib/api/scans";
import { DisconnectProjectDialog } from "@/components/dashboard/project/disconnect-project-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceChangeListener } from "@/hooks/use-workspace-change-listener";
import { workspaceKeys } from "@/hooks/use-dashboard-data";
import { ProjectCardSkeleton, ProjectsHeaderSkeleton } from "./projects-skeleton";
import { ScanStatusBadge } from "@/components/scans/scan-status-badge";
import { toast } from "sonner"

interface ProjectWithLatestScan extends Repository {
  latestScan?: Scan | null;
}

export function ProjectsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { workspace, isSwitching, initializing } = useWorkspace();
  
  // Listen to workspace changes
  useWorkspaceChangeListener();

  const [searchQuery, setSearchQuery] = useState(searchParams?.get("search") || "");
  const [providerFilter, setProviderFilter] = useState(searchParams?.get("provider") || "all");
  const [sortBy, setSortBy] = useState(searchParams?.get("sort") || "recent");
  // When sorting by risk, force status to completed
  const [statusFilter, setStatusFilter] = useState(
    searchParams?.get("sort") === "risk" ? "completed" : (searchParams?.get("status") || "all")
  );
  const [page, setPage] = useState(Number(searchParams?.get("page")) || 1);
  const [projectToDelete, setProjectToDelete] = useState<{id: string, name: string} | null>(null);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout>();
  const [scanningProjects, setScanningProjects] = useState<Set<string>>(new Set());
  
  const limit = 15; // Maximum 15 projects per page

  // Workspace-aware query for projects
  const {
    data: projectsData,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: workspace 
      ? [...workspaceKeys.projects(workspace.id), 'list', { searchQuery, providerFilter, statusFilter, sortBy, page, limit }]
      : ['projects', 'list', 'none'],
    queryFn: async () => {
      if (!workspace) throw new Error('Workspace not available');
      console.log('📦 Fetching projects for workspace:', workspace?.name);
      const params: any = { page, limit };
      if (searchQuery) params.search = searchQuery;
      if (providerFilter !== "all") params.provider = providerFilter;
      if (statusFilter !== "all") params.status = statusFilter;

      const data = await repositoriesApi.list(workspace.id, params);
      
      // Fetch latest scan for each project
      const projectsWithScans = await Promise.all(
        data.repositories.map(async (project) => {
          try {
            const scansData = await scansApi.getHistory(workspace!.id, project.id, { page: 1, limit: 1 });
            return {
              ...project,
              latestScan: scansData.scans.length > 0 ? scansData.scans[0] : null,
            };
          } catch (err) {
            console.error(`Failed to load scan for ${project.name}:`, err);
            return {
              ...project,
              latestScan: null,
            };
          }
        })
      );

      // Sort projects based on sortBy
      const sortedProjects = [...projectsWithScans].sort((a, b) => {
        if (sortBy === "risk") {
          const scoreA = calculateRiskScore(a.latestScan);
          const scoreB = calculateRiskScore(b.latestScan);
          return scoreB - scoreA; // Highest risk first
        } else {
          // Most recent
          const dateA = a.latestScan?.created_at ? new Date(a.latestScan.created_at).getTime() : 0;
          const dateB = b.latestScan?.created_at ? new Date(b.latestScan.created_at).getTime() : 0;
          return dateB - dateA;
        }
      });

      return {
        projects: sortedProjects,
        total: data.total,
        pages: data.pages
      };
    },
    enabled: !!workspace,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  });

  const projects = projectsData?.projects ?? [];
  const totalPages = projectsData?.pages ?? 1;
  const total = projectsData?.total ?? 0;
  const loading = isLoading || isSwitching || initializing;
  const error = queryError ? (queryError as Error).message || "Failed to load projects" : null;

  const updateURL = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (providerFilter !== "all") params.set("provider", providerFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortBy !== "recent") params.set("sort", sortBy);
    if (page > 1) params.set("page", String(page));
    
    const queryString = params.toString();
    router.push(`/dashboard/projects${queryString ? `?${queryString}` : ""}`, { scroll: false });
  };

  const handleSync = async () => {
    try {
      await repositoriesApi.sync(workspace.id);
      refetch();
      toast.success("Projects synced successfully");
    } catch (err: any) {
      console.error('Sync failed:', err);
      toast.error(
        <div>
          <strong>Sync failed</strong>
          <p>{err.message}</p>
        </div>
      );
    }
  };

  const handleQuickScan = async (projectId: string, projectName: string, defaultBranch: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent row click navigation
    
    try {
      setScanningProjects(prev => new Set(prev).add(projectId));
      
      const result = await scansApi.start(workspace!.id, projectId, {
        branch: defaultBranch || "main",
        scan_type: "quick",
      });

      toast.success(
        <div>
          <strong>Scan started</strong>
          <p>Scanning {projectName}... Check the banner above for progress.</p>
        </div>
      );

      // Refetch projects to update scan status
      setTimeout(() => {
        refetch();
      }, 2000);

      // NO REDIRECT - Banner will show scan status
    } catch (err: any) {
      console.error('Quick scan failed:', err);
      toast.error(
        <div>
          <strong>Failed to start scan</strong>
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setScanningProjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    }
  };

  const handleSearchChange = (value: string) => {
    if (searchDebounce) clearTimeout(searchDebounce);
    setSearchDebounce(
      setTimeout(() => {
        setSearchQuery(value);
        setPage(1);
        updateURL();
      }, 300)
    );
  };

  const onDisconnectSuccess = (deletedId: string) => {
    if (workspace) {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.projects(workspace.id)
      });
    }
  };

  const calculateRiskScore = (scan: Scan | null | undefined): number => {
    if (!scan || scan.status !== 'completed') return 0;
    
    // Weight: Critical=10, High=5, Medium=2, Low=1
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

  // Removed getScanStatusBadge - using unified ScanStatusBadge component instead

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
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      {loading && !workspace ? (
        <ProjectsHeaderSkeleton />
      ) : (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">
              Manage your connected repositories
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSync} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Sync
            </Button>
            <Button asChild>
              <Link href="/dashboard/integrations/github">
                <Plus className="mr-2 h-4 w-4" />
                Import Project
              </Link>
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                className="pl-9"
                defaultValue={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                disabled={loading}
              />
            </div>

            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v);
                // When sorting by risk, force status to completed
                if (v === "risk") {
                  setStatusFilter("completed");
                }
                setPage(1);
                updateURL();
              }}
              disabled={loading}
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most Recent</SelectItem>
                <SelectItem value="risk">Highest Risk</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={providerFilter}
              onValueChange={(v) => {
                setProviderFilter(v);
                setPage(1);
                updateURL();
              }}
              disabled={loading}
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Integration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Integrations</SelectItem>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="gitlab" disabled>GitLab (Soon)</SelectItem>
                <SelectItem value="bitbucket" disabled>Bitbucket (Soon)</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                setPage(1);
                updateURL();
              }}
              disabled={loading || sortBy === "risk"}
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Scan Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="never_scanned">Never Scanned</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="normalizing">Processing</SelectItem>
                <SelectItem value="ai_enriching">AI Analysis</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && projects.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects found</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {searchQuery || providerFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Get started by importing your first project"}
            </p>
            {!searchQuery && providerFilter === "all" && statusFilter === "all" && (
              <Button asChild>
                <Link href="/dashboard/integrations/github">
                  <Plus className="mr-2 h-4 w-4" />
                  Import Project
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Projects Table */}
      {!loading && projects.length > 0 && (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Project
                      </th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Risk Score
                      </th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Last Scan
                      </th>
                      <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Issues
                      </th>
                      <th className="text-center py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => {
                      const latestScan = project.latestScan;
                      const riskScore = calculateRiskScore(latestScan);
                      const riskColor = getRiskScoreColor(riskScore);
                      const isScanning = scanningProjects.has(project.id);
                      const isActiveScan = latestScan && (
                        latestScan.status === 'running' || 
                        latestScan.status === 'normalizing' || 
                        latestScan.status === 'ai_enriching'
                      );

                      return (
                        <tr
                          key={project.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                        >
                          <td className="py-4 px-6">
                            <div className="flex flex-col">
                              <Link
                                href={`/dashboard/projects/${project.id}`}
                                className="font-medium hover:text-primary transition-colors"
                              >
                                {project.name}
                              </Link>
                              <a
                                href={project.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {project.full_name}
                              </a>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge variant="outline" className={`${riskColor} text-xl font-bold px-3 py-1`}>
                              {riskScore}
                            </Badge>
                          </td>
                          <td className="py-4 px-6">
                            {latestScan ? (
                              <div className="flex items-center gap-2">
                                <ScanStatusBadge
                                  status={latestScan.status}
                                  progressPercentage={latestScan.progress_percentage}
                                  progressStage={latestScan.progress_stage}
                                  showProgress={latestScan.status === "running"}
                                  size="sm"
                                />
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(latestScan.created_at)}
                                </span>
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Never scanned
                              </Badge>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            {latestScan && latestScan.status === 'completed' ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {latestScan.critical_count > 0 && (
                                  <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20">
                                    {latestScan.critical_count} 
                                  </Badge> 
                                )}
                                {latestScan.high_count > 0 && (
                                  <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20">
                                    {latestScan.high_count}
                                  </Badge>
                                )}
                                {latestScan.medium_count > 0 && (
                                  <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20">
                                    {latestScan.medium_count}
                                  </Badge>
                                )}
                                {latestScan.low_count > 0 && (
                                  <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">
                                    {latestScan.low_count}
                                  </Badge>
                                )}
                                {latestScan.vulnerabilities_found === 0 && (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                                    Clean
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => handleQuickScan(project.id, project.name, project.default_branch, e)}
                                disabled={isScanning || !!isActiveScan}
                                className="h-8 w-8 p-0"
                                title="Quick Scan"
                              >
                                {isScanning || isActiveScan ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4" />
                                )}
                              </Button>
                              
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/projects/${project.id}`}>
                                      View Details
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/projects/${project.id}/settings`}>
                                      <Settings className="mr-2 h-4 w-4" />
                                      Settings
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setProjectToDelete({ id: project.id, name: project.name });
                                    }}
                                  >
                                    Disconnect
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              
                              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Premium Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} projects
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPage(p => Math.max(1, p - 1));
                    updateURL();
                  }}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setPage(pageNum);
                          updateURL();
                        }}
                        className="w-10"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPage(p => Math.min(totalPages, p + 1));
                    updateURL();
                  }}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* <DisconnectProjectDialog 
        project={projectToDelete}
        workspaceId={workspace!.id}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        onSuccess={onDisconnectSuccess}
      /> */}
    </div>
  );
}