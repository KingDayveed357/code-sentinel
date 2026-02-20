// components/dashboard/projects-list.tsx 
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { DisconnectProjectDialog } from "@/components/dashboard/project/disconnect-project-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceChangeListener } from "@/hooks/use-workspace-change-listener";
import { usePermissions } from "@/hooks/use-permissions";
import { workspaceKeys } from "@/hooks/use-dashboard-data";
import { ProjectCardSkeleton, ProjectsHeaderSkeleton } from "./projects-skeleton";
import { ScanStatusBadge } from "@/components/scans/scan-status-badge";
import { RunScanModal } from "@/components/scans/run-scan-modal";
import { toast } from "sonner"
import { useActiveScans } from "@/hooks/use-active-scans";
import type { Scan } from "@/lib/api/scans";

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
  const { isOwnerOrAdmin, isViewer, canCreateScans, canUpdateProject, canDeleteProjects, canImportRepos } = usePermissions();
  const requestedView = searchParams?.get("view");
  const initialViewFilter: "assigned" | "all" =
    requestedView === "assigned"
      ? "assigned"
      : requestedView === "all" && isOwnerOrAdmin
        ? "all"
        : isOwnerOrAdmin
          ? "all"
          : "assigned";
  const [viewFilter, setViewFilter] = useState<"assigned" | "all">(initialViewFilter);
  const [statusFilter, setStatusFilter] = useState(
    searchParams?.get("sort") === "risk" ? "completed" : (searchParams?.get("status") || "all")
  );
  const [page, setPage] = useState(Number(searchParams?.get("page")) || 1);
  const [projectToDelete, setProjectToDelete] = useState<{id: string, name: string} | null>(null);
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout>();
  const [scanningProjects, setScanningProjects] = useState<Set<string>>(new Set());
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectWithLatestScan | null>(null);
  const { activeScans } = useActiveScans();
  
  // Optimistic UI: Hidden projects (deleted but waiting for server confirmation)
  const [hiddenProjectIds, setHiddenProjectIds] = useState<Set<string>>(new Set());
  
  const limit = 15; // Maximum 15 projects per page

  // Workspace-aware query for projects
  const {
    data: projectsData,
    isLoading,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: workspace 
      ? [...workspaceKeys.projects(workspace.id), 'list', { searchQuery, providerFilter, statusFilter, viewFilter, sortBy, page, limit }]
      : ['projects', 'list', 'none'],
    queryFn: async () => {
      if (!workspace) throw new Error('Workspace not available');
      console.log('📦 Fetching projects for workspace:', workspace?.name);
      const params: any = { page, limit };
      if (searchQuery) params.search = searchQuery;
      if (providerFilter !== "all") params.provider = providerFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      if (viewFilter) params.view = viewFilter;

      const data = await repositoriesApi.list(workspace.id, params);
      
      // ... existing latest scan fetching logic ...
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
    staleTime: 10 * 1000, // 10 seconds - more responsive to scan changes
    refetchOnMount: 'always',
    // ✅ Smart polling: poll projects list when there are active scans
    // so scan status badges update in real-time
    refetchInterval: activeScans.some(
      (s) => s.status === 'processing' || s.status === 'queued'
    ) ? 8000 : false,
  });

  // Ensure persistent state is updated when a scan completes from the active tray
  const refetchedCompletedScans = useRef<Set<string>>(new Set());
  
  // Reset refetched set when workspace changes to avoid staleness across workspaces produces bugs
  useEffect(() => {
    refetchedCompletedScans.current.clear();
  }, [workspace?.id]);

  useEffect(() => {
    let shouldRefetch = false;
    activeScans.forEach(scan => {
      // If a scan is completed/failed and we haven't synced it yet, trigger a refetch
      if ((scan.status === 'completed' || scan.status === 'failed') && !refetchedCompletedScans.current.has(scan.id)) {
        refetchedCompletedScans.current.add(scan.id);
        shouldRefetch = true;
      }
    });

    if (shouldRefetch) {
      console.log('🔄 Scan completed, refreshing project list...');
      void refetch();
    }
  }, [activeScans, refetch]);

  useEffect(() => {
    if (!isOwnerOrAdmin && viewFilter !== "assigned") {
      setViewFilter("assigned");
      setPage(1);
    }
  }, [isOwnerOrAdmin, viewFilter]);

  const projects = projectsData?.projects 
    ? projectsData.projects.filter(p => !hiddenProjectIds.has(p.id)) 
    : [];
  const totalPages = projectsData?.pages ?? 1;
  const total = projectsData?.total ?? 0;
  const loading = isLoading || isSwitching || initializing;
  const error = queryError ? (queryError as Error).message || "Failed to load projects" : null;

  const updateURL = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (providerFilter !== "all") params.set("provider", providerFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (viewFilter) params.set("view", viewFilter);
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

  const handleOpenScanModal = (project: ProjectWithLatestScan, event: React.MouseEvent) => {
    // Stop propagation to prevent row click
    event.preventDefault();
    event.stopPropagation();
    setSelectedProject(project);
    setScanModalOpen(true);
  };

  const handleScanStarted = () => {
    // The useActiveScans hook will pick this up automatically
    // But we can also force a refetch if we want to be safe
    setTimeout(() => {
      refetch();
    }, 1000);
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
    // Project is already hidden via optimistic UI in the Dialog's onConfirm (if we wire it up)
    // Or we hide it here immediately
    setHiddenProjectIds(prev => new Set(prev).add(deletedId));
    toast.success("Project disconnected");
    
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
            {canImportRepos && (
              <Button asChild>
                <Link href="/dashboard/integrations/github">
                  <Plus className="mr-2 h-4 w-4" />
                  Import Project
                </Link>
              </Button>
            )}
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {isOwnerOrAdmin && (
            <Tabs 
              value={viewFilter} 
              onValueChange={(v: any) => {
                setViewFilter(v);
                setPage(1);
                updateURL();
              }}
              className="w-full md:w-auto"
            >
              <TabsList className="grid grid-cols-2 w-full md:w-[300px]">
                <TabsTrigger value="all">All Projects</TabsTrigger>
                <TabsTrigger value="assigned">My Projects</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          
          <div className="flex flex-1 items-center gap-2">
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

            {/* 
            Integration filter is removed for now since we only have GitHub, but can be easily re-enabled when we add more providers
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
            </Select> */}

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
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
      </div>
    

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
            {!searchQuery && providerFilter === "all" && statusFilter === "all" && canImportRepos && (
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
                      // ✅ REAL-TIME STATUS SYNC
                      // Check if there's an active scan for this project
                      const activeScan = activeScans.find(s => s.repository.id === project.id);
                      
                      // Use active scan if available, otherwise fall back to latest historical scan
                      // We intentionally use 'any' cast here because ActiveScan might have slightly different
                      // nullability than Scan, but they are compatible for our usage
                      const displayScan = activeScan || project.latestScan;
                      
                      const riskScore = calculateRiskScore(displayScan as Scan | null);
                      const riskColor = getRiskScoreColor(riskScore);
                      const isScanRunning = activeScan && (activeScan.status === 'queued' || activeScan.status === 'processing');
                      
                      return (
                        <tr
                          key={project.id}
                          className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer group"
                          onClick={(e) => {
                             // Only navigate if we didn't click a button/interactive element
                             if ((e.target as HTMLElement).closest('button, a, [role="menuitem"]')) return;
                             router.push(`/dashboard/projects/${project.id}`);
                          }}
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
                            {displayScan ? (
                              <div className="flex items-center gap-2">
                                <ScanStatusBadge
                                  status={displayScan.status}
                                  progressPercentage={displayScan.progress_percentage ?? undefined}
                                  progressStage={displayScan.progress_stage ?? undefined}
                                  showProgress={displayScan.status === "processing" || displayScan.status === "queued"}
                                  size="sm"
                                />
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(displayScan.created_at)}
                                </span>
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Never scanned
                              </Badge>
                            )}
                          </td>
                          <td className="py-4 px-6">
                            {displayScan && displayScan.status === 'completed' ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {displayScan.critical_count > 0 && (
                                  <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20">
                                    {displayScan.critical_count} 
                                  </Badge> 
                                )}
                                {displayScan.high_count > 0 && (
                                  <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20">
                                    {displayScan.high_count}
                                  </Badge>
                                )}
                                {displayScan.medium_count > 0 && (
                                  <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20">
                                    {displayScan.medium_count}
                                  </Badge>
                                )}
                                {displayScan.low_count > 0 && (
                                  <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">
                                    {displayScan.low_count}
                                  </Badge>
                                )}
                                {displayScan.vulnerabilities_found === 0 && (
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
                            {!isViewer ? (
                              <div className="flex items-center justify-center gap-2">
                                {canCreateScans && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={(e) => handleOpenScanModal(project, e)}
                                    // Prevent clicking if a scan is already running to avoid duplicates, 
                                    // but allow if it's completed/failed
                                    disabled={!!isScanRunning}
                                    className="h-8"
                                  >
                                    {isScanRunning ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Scanning
                                      </>
                                    ) : (
                                      <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Run Scan
                                      </>
                                    )}
                                  </Button>
                                )}
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={(e) => {
                                        // Stop propagation at the button level to ensure 
                                        // the row click handler doesn't fire
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
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
                                    
                                    {canUpdateProject && (
                                      <DropdownMenuItem asChild>
                                        <Link href={`/dashboard/projects/${project.id}/settings`}>
                                          <Settings className="mr-2 h-4 w-4" />
                                          Settings
                                        </Link>
                                      </DropdownMenuItem>
                                    )}
                                    
                                    {canDeleteProjects && (
                                      <>
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
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            ) : (
                               <div className="flex justify-center">
                                  <Button variant="ghost" size="sm" asChild>
                                    <Link href={`/dashboard/projects/${project.id}`}>
                                        View
                                    </Link>
                                  </Button>
                               </div>
                            )}
                            
                            {!isViewer && (
                              <ChevronRight className="hidden h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                            )}
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

      <DisconnectProjectDialog 
        project={projectToDelete}
        workspaceId={workspace?.id || ""}
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        onSuccess={onDisconnectSuccess}
      />

      {/* Run Scan Modal */}
      {selectedProject && workspace && (
        <RunScanModal
          open={scanModalOpen}
          onOpenChange={setScanModalOpen}
          repositoryId={selectedProject.id}
          repositoryName={selectedProject.name}
          defaultBranch={selectedProject.default_branch}
          workspaceId={workspace.id}
          workspacePlan={workspace.plan.toLowerCase() as "free" | "dev" | "team" | "enterprise"}
          onScanStarted={handleScanStarted}
        />
      )}
    </div>
  );
}
