// hooks/use-dashboard-data.ts
"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/stores/workspace-store';
import { dashboardApi } from '@/lib/api/dashboard';
import { repositoriesApi } from '@/lib/api/repositories';
import { entitlementsApi } from '@/lib/api/entitlements';
import { integrationsApi } from '@/lib/api/integrations';
import { useCallback } from 'react';

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
  entitlements: (workspaceId: string) => 
    [...workspaceKeys.all(workspaceId), 'entitlements'] as const,
  integrations: (workspaceId: string) => 
    [...workspaceKeys.all(workspaceId), 'integrations'] as const,
  github: (workspaceId: string) => 
    [...workspaceKeys.all(workspaceId), 'github'] as const,
  githubRepos: (workspaceId: string) => 
    [...workspaceKeys.github(workspaceId), 'repositories'] as const,
  githubStatus: (workspaceId: string) => 
    [...workspaceKeys.github(workspaceId), 'integration-status'] as const,
};

/**
 * Hook to fetch dashboard overview data
 * Automatically refetches when workspace changes
 */
export function useDashboardOverview() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace ? workspaceKeys.dashboard(workspace.id) : ['dashboard', 'none'],
    queryFn: () => {
      console.log('📊 Fetching dashboard for workspace:', workspace?.name);
      return dashboardApi.getOverview();
    },
    enabled: !!workspace,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: 'always', // Always refetch when component mounts
  });
}

/**
 * Hook to fetch projects list with filters
 * Supports pagination and search
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
    queryFn: () => {
      console.log('📦 Fetching projects for workspace:', workspace?.name, params);
      return repositoriesApi.list(params || {});
    },
    enabled: !!workspace,
    staleTime: 20 * 1000, // 20 seconds
    refetchOnMount: true, // Refetch when component mounts
    keepPreviousData: true, // For smooth pagination
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
    staleTime: 60 * 1000, // 1 minute
    refetchOnMount: true,
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch integrations for current workspace
 */
export function useIntegrations() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace 
      ? workspaceKeys.integrations(workspace.id)
      : ['integrations', 'none'],
    queryFn: () => {
      console.log('🔌 Fetching integrations for workspace:', workspace?.name);
      return integrationsApi.getIntegrations();
    },
    enabled: !!workspace,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: 'always',
  });
}

/**
 * Hook to invalidate all queries for current workspace
 * Useful after mutations or workspace switches
 */
export function useInvalidateWorkspaceQueries() {
  const workspace = useCurrentWorkspace();
  const queryClient = useQueryClient();

  return useCallback(() => {
    if (!workspace) return;
    console.log('♻️  Invalidating all queries for workspace:', workspace.name);
    queryClient.invalidateQueries({
      queryKey: workspaceKeys.all(workspace.id),
    });
  }, [workspace, queryClient]);
}

/**
 * Hook to prefetch data for a workspace
 * Useful for optimistic workspace switching
 */
export function usePrefetchWorkspace() {
  const queryClient = useQueryClient();

  return useCallback(
    async (workspaceId: string) => {
      console.log('⚡ Prefetching workspace data:', workspaceId);
      await Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: workspaceKeys.dashboard(workspaceId),
          queryFn: () => dashboardApi.getOverview(),
        }),
        queryClient.prefetchQuery({
          queryKey: workspaceKeys.projectsList(workspaceId),
          queryFn: () => repositoriesApi.list({}),
        }),
        queryClient.prefetchQuery({
          queryKey: workspaceKeys.integrations(workspaceId),
          queryFn: () => integrationsApi.getIntegrations(),
        }),
      ]);
    },
    [queryClient]
  );
}

/**
 * Hook to fetch GitHub repositories for import
 * Workspace-aware and prevents showing stale data
 */
export function useGitHubRepositories() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace 
      ? workspaceKeys.githubRepos(workspace.id)
      : ['github', 'repositories', 'none'],
    queryFn: async () => {
      console.log('📦 Fetching GitHub repositories for workspace:', workspace?.name);
      return repositoriesApi.getGitHubRepos();
    },
    enabled: !!workspace,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnMount: 'always',
  });
}

/**
 * Hook to fetch GitHub integration status
 * Workspace-aware
 */
export function useGitHubIntegrationStatus() {
  const workspace = useCurrentWorkspace();

  return useQuery({
    queryKey: workspace 
      ? workspaceKeys.githubStatus(workspace.id)
      : ['github', 'integration-status', 'none'],
    queryFn: async () => {
      console.log('🔌 Fetching GitHub integration status for workspace:', workspace?.name);
      return integrationsApi.getIntegrationStatus('github');
    },
    enabled: !!workspace,
    staleTime: 60 * 1000, // 1 minute
    refetchOnMount: 'always',
  });
}