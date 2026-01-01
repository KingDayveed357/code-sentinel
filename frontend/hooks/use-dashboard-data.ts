// hooks/use-dashboard-data.ts
"use client";

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/stores/workspace-store';
import { dashboardApi } from '@/lib/api/dashboard';
import { repositoriesApi } from '@/lib/api/repositories';
import { scansApi } from '@/lib/api/scans';
import { entitlementsApi } from '@/lib/api/entitlements';
import { integrationsApi } from '@/lib/api/integrations';
import { teamsApi } from '@/lib/api/teams';

/**
 * Query key factory for workspace-scoped data
 * All keys include workspace ID to prevent cross-workspace data leakage
 */
export const workspaceKeys = {
  all: (workspaceId: string) => ['workspace', workspaceId] as const,
  dashboard: (workspaceId: string) => [...workspaceKeys.all(workspaceId), 'dashboard'] as const,
  projects: (workspaceId: string) => [...workspaceKeys.all(workspaceId), 'projects'] as const,
  projectsList: (workspaceId: string, params?: any) => 
    [...workspaceKeys.projects(workspaceId), 'list', params] as const,
  projectDetail: (workspaceId: string, projectId: string) => 
    [...workspaceKeys.projects(workspaceId), 'detail', projectId] as const,
  projectScans: (workspaceId: string, projectId: string, params?: any) =>
    [...workspaceKeys.projects(workspaceId), projectId, 'scans', params] as const,
  scan: (workspaceId: string, scanId: string) =>
    [...workspaceKeys.all(workspaceId), 'scan', scanId] as const,
  entitlements: (workspaceId: string) => 
    [...workspaceKeys.all(workspaceId), 'entitlements'] as const,
  integrations: (workspaceId: string) =>
    [...workspaceKeys.all(workspaceId), 'integrations'] as const,
  teams: (workspaceId: string) =>
    [...workspaceKeys.all(workspaceId), 'teams'] as const,
  teamDetail: (workspaceId: string, teamId: string) =>
    [...workspaceKeys.teams(workspaceId), teamId] as const,
};

/**
 * Hook to fetch dashboard overview data
 */
export function useDashboardOverview() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace ? workspaceKeys.dashboard(workspace.id) : ['dashboard', 'none'],
    queryFn: () => dashboardApi.getOverview(),
    enabled: !!workspace,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: 'always',
  });
}

/**
 * Hook to fetch projects list with filters
 */
export function useProjectsList(params?: {
  page?: number;
  limit?: number;
  search?: string;
  provider?: string;
  status?: string;
}) {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace 
      ? workspaceKeys.projectsList(workspace.id, params) 
      : ['projects', 'list', 'none'],
    queryFn: () => repositoriesApi.list(params || {}),
    enabled: !!workspace,
    staleTime: 20 * 1000,
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}

/**
 * Hook to fetch single project details
 */
export function useProjectDetail(projectId: string) {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace 
      ? workspaceKeys.projectDetail(workspace.id, projectId)
      : ['projects', 'detail', projectId, 'none'],
    queryFn: () => repositoriesApi.getById(projectId),
    enabled: !!workspace && !!projectId,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch project scan history
 */
export function useProjectScans(projectId: string, params?: {
  page?: number;
  limit?: number;
}) {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace
      ? workspaceKeys.projectScans(workspace.id, projectId, params)
      : ['scans', projectId, 'none'],
    queryFn: () => scansApi.getHistory(projectId, params || {}),
    enabled: !!workspace && !!projectId,
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to fetch scan details
 */
export function useScanDetail(scanId: string) {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace
      ? workspaceKeys.scan(workspace.id, scanId)
      : ['scan', scanId, 'none'],
    queryFn: () => scansApi.getStatus(scanId),
    enabled: !!workspace && !!scanId,
    staleTime: 10 * 1000, // Shorter stale time for active scans
    refetchInterval: (data) => {
      // Poll active scans every 3 seconds
      const scan = (data as any)?.scan;
      if (scan && ['running', 'normalizing', 'ai_enriching'].includes(scan.status)) {
        return 3000;
      }
      return false;
    },
  });
}

/**
 * Hook to fetch entitlements (usage limits)
 */
export function useEntitlements() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace 
      ? workspaceKeys.entitlements(workspace.id)
      : ['entitlements', 'none'],
    queryFn: () => entitlementsApi.getEntitlements(),
    enabled: !!workspace,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch integrations
 */
export function useIntegrations() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace
      ? workspaceKeys.integrations(workspace.id)
      : ['integrations', 'none'],
    queryFn: () => integrationsApi.getIntegrations(),
    enabled: !!workspace,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch teams list
 */
export function useTeamsList() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace
      ? workspaceKeys.teams(workspace.id)
      : ['teams', 'none'],
    queryFn: () => teamsApi.list(),
    enabled: !!workspace,
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch team details
 */
export function useTeamDetail(teamId: string) {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace
      ? workspaceKeys.teamDetail(workspace.id, teamId)
      : ['teams', teamId, 'none'],
    queryFn: () => teamsApi.get(teamId),
    enabled: !!workspace && !!teamId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to invalidate all queries for current workspace
 */
export function useInvalidateWorkspaceQueries() {
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();

  return () => {
    if (!workspace) return;
    queryClient.invalidateQueries({
      queryKey: workspaceKeys.all(workspace.id),
    });
  };
}

/**
 * Hook to prefetch data for a workspace
 */
export function usePrefetchWorkspace() {
  const queryClient = useQueryClient();

  return async (workspaceId: string) => {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: workspaceKeys.dashboard(workspaceId),
        queryFn: () => dashboardApi.getOverview(),
      }),
      queryClient.prefetchQuery({
        queryKey: workspaceKeys.projectsList(workspaceId),
        queryFn: () => repositoriesApi.list({}),
      }),
    ]);
  };
}

/**
 * Mutation to start a scan
 */
export function useStartScan() {
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, params }: { projectId: string; params: any }) =>
      scansApi.start(projectId, params),
    onSuccess: (_, { projectId }) => {
      if (!workspace) return;
      // Invalidate project and scans queries
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.projectDetail(workspace.id, projectId),
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.projectScans(workspace.id, projectId),
      });
    },
  });
}