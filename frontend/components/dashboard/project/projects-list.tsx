// components/dashboard/projects-list.tsx 
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search,
  Plus,
  MoreVertical,
  Clock,
  AlertCircle,
  Loader2,
  Github,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Settings,
  Trash2,
  FileText,
  Zap,
  GitBranch,
  Activity,
  CheckCircle2,
  XCircle,
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
  const [statusFilter, setStatusFilter] = useState(searchParams?.get("status") || "all");
  const [page, setPage] = useState(Number(searchParams?.get("page")) || 1);
  const [scanningProjectId, setScanningProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{id: string, name: string} | null>(null);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout>();
  
  const limit = 9;

  // Workspace-aware query for projects
  const {
    data: projectsData,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: workspace 
      ? [...workspaceKeys.projects(workspace.id), 'list', { searchQuery, providerFilter, statusFilter, page, limit }]
      : ['projects', 'list', 'none'],
    queryFn: async () => {
      console.log('📦 Fetching projects for workspace:', workspace?.name);
      const params: any = { page, limit };
      if (searchQuery) params.search = searchQuery;
      if (providerFilter !== "all") params.provider = providerFilter;
      if (statusFilter !== "all") params.status = statusFilter;

      const data = await repositoriesApi.list(params);
      
      // Fetch latest scan for each project
      const projectsWithScans = await Promise.all(
        data.repositories.map(async (project) => {
          try {
            const scansData = await scansApi.getHistory(project.id, { page: 1, limit: 1 });
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

      return {
        projects: projectsWithScans,
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
    if (page > 1) params.set("page", String(page));
    
    const queryString = params.toString();
    router.push(`/dashboard/projects${queryString ? `?${queryString}` : ""}`, { scroll: false });
  };

  const handleSync = async () => {
    try {
      await repositoriesApi.sync();
      refetch();
    } catch (err: any) {
      console.error('Sync failed:', err);
    }
  };

  const handleRunScan = async (projectId: string) => {
    try {
      setScanningProjectId(projectId);
      
      const project = projects.find(p => p.id === projectId);
      const result = await scansApi.start(projectId, {
        branch: project?.default_branch || "main",
        scan_type: "full",
      });

      router.push(`/dashboard/projects/${projectId}/scans/${result.scan_id}/report`);
    } catch (err: any) {
      console.error('Scan failed:', err);
    } finally {
      setScanningProjectId(null);
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
    // Invalidate projects query to refetch
    if (workspace) {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.projects(workspace.id)
      });
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "github": return Github;
      case "gitlab":
      case "bitbucket":
      case "jenkins": return GitBranch;
      default: return GitBranch;
    }
  };

  const getProviderBadge = (provider: string) => {
    const isActive = provider === "github";
    return {
      label: provider.charAt(0).toUpperCase() + provider.slice(1),
      className: isActive 
        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
      isActive
    };
  };

  const getScanStatusBadge = (status: string) => {
    const config = {
      pending: {
        label: "Pending",
        icon: Clock,
        className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400",
      },
      running: {
        label: "Scanning",
        icon: Activity,
        className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
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
    return config[status as keyof typeof config] || config.pending;
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
    });
  };

  return (
    <div className="space-y-6">
      {/* Header - Static with dynamic workspace name */}
      {loading && !workspace ? (
        <ProjectsHeaderSkeleton />
      ) : (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">
              {loading ? (
                "Loading projects..."
              ) : (
                <>Manage your connected projects ({total} total)</>
              )}
            </p>
            {workspace && (
              <p className="text-sm text-muted-foreground mt-1">
                Workspace: <span className="font-medium">{workspace.name}</span>
              </p>
            )}
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

      {/* Filters - Always visible */}
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
          disabled={loading}
        >
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Scan Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="never_scanned">Never Scanned</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading State - Show skeletons */}
      {loading && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
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

      {/* Projects Grid */}
      {!loading && projects.length > 0 && (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const ProviderIcon = getProviderIcon(project.provider);
              const providerBadge = getProviderBadge(project.provider);
              const isScanning = scanningProjectId === project.id;
              const latestScan = project.latestScan;
              const scanStatusBadge = latestScan ? getScanStatusBadge(latestScan.status) : null;
              const ScanStatusIcon = scanStatusBadge?.icon;
              const isActiveScan = latestScan && (
                latestScan.status === 'running' || 
                latestScan.status === 'normalizing' || 
                latestScan.status === 'ai_enriching'
              );

              return (
                <Card
                  key={project.id}
                  className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="text-lg font-semibold hover:text-primary transition-colors block truncate"
                        >
                          {project.name}
                        </Link>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge className={providerBadge.className}>
                            <ProviderIcon className="h-3 w-3 mr-1" />
                            {providerBadge.label}
                          </Badge>
                          {!providerBadge.isActive && (
                            <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/projects/${project.id}`}>View Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/projects/${project.id}/scan-history`}>
                              <FileText className="mr-2 h-4 w-4" />
                              Scan History
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
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onClick={() => setProjectToDelete({ id: project.id, name: project.name })}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Latest Scan Info */}
                    <div className="space-y-3 mb-4">
                      {latestScan ? (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Latest Scan</span>
                            <div className="flex items-center gap-2">
                              {ScanStatusIcon && (
                                <ScanStatusIcon className={`h-3.5 w-3.5 ${isActiveScan ? 'animate-pulse' : ''}`} />
                              )}
                              <span className="text-xs">{formatDate(latestScan.created_at)}</span>
                            </div>
                          </div>
                          
                          {scanStatusBadge && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Status</span>
                              <Badge className={scanStatusBadge.className} variant="outline">
                                {scanStatusBadge.label}
                              </Badge>
                            </div>
                          )}

                          {latestScan.status === 'completed' && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Issues Found</span>
                              <div className="flex items-center gap-1">
                                {latestScan.critical_count > 0 && (
                                  <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                    {latestScan.critical_count}
                                  </Badge>
                                )}
                                {latestScan.high_count > 0 && (
                                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400 text-xs px-1.5 py-0">
                                    {latestScan.high_count}
                                  </Badge>
                                )}
                                {latestScan.vulnerabilities_found === 0 && (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 text-xs">
                                    Clean
                                  </Badge>
                                )}
                                {latestScan.vulnerabilities_found > 0 && (
                                  <span className="text-xs font-medium ml-1">
                                    {latestScan.vulnerabilities_found} total
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Status</span>
                          <Badge variant="outline" className="text-xs">
                            Never Scanned
                          </Badge>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        asChild
                        disabled={!latestScan}
                      >
                        {latestScan ? (
                          <Link href={`/dashboard/projects/${project.id}/scans/${latestScan.id}/report`}>
                            <FileText className="mr-2 h-3 w-3" />
                            {isActiveScan ? "View Progress" : "Latest Report"}
                          </Link>
                        ) : (
                          <span className="opacity-50 cursor-not-allowed">
                            <FileText className="mr-2 h-3 w-3" />
                            Latest Report
                          </span>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleRunScan(project.id)}
                        disabled={isScanning || !!isActiveScan}
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            Starting
                          </>
                        ) : isActiveScan ? (
                          <>
                            <Activity className="mr-2 h-3 w-3 animate-pulse" />
                            Scanning
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-3 w-3" />
                            Scan Now
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
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
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
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
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DisconnectProjectDialog 
        project={projectToDelete}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        onSuccess={onDisconnectSuccess}
      />
    </div>
  );
}