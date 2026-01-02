// lib/routes/route-classifier.ts
import type { Workspace } from '@/lib/api/workspaces';

type RouteType = 'workspace-safe' | 'workspace-dependent' | 'entity-dependent';

interface RouteDefinition {
  pattern: RegExp;
  type: RouteType;
  redirectOnInvalid?: string;
  requiresValidation?: (
    pathname: string,
    workspace: Workspace,
    queryClient: any
  ) => Promise<boolean>;
}

const ROUTE_DEFINITIONS: RouteDefinition[] = [
  // Workspace-Safe Routes (no workspace needed)
  {
    pattern: /^\/dashboard\/settings/,
    type: 'workspace-safe',
  },
  {
    pattern: /^\/dashboard\/billing/,
    type: 'workspace-safe',
  },

  // Workspace-Dependent Routes (just need workspace context)
  {
    pattern: /^\/dashboard$/,
    type: 'workspace-dependent',
  },
  {
    pattern: /^\/dashboard\/projects$/,
    type: 'workspace-dependent',
  },
  {
    pattern: /^\/dashboard\/teams/,
    type: 'workspace-dependent',
  },
  {
    pattern: /^\/dashboard\/integrations/,
    type: 'workspace-dependent',
  },

  // Entity-Dependent Routes (need to validate entity exists)
  {
    pattern: /^\/dashboard\/projects\/([^/]+)/,
    type: 'entity-dependent',
    redirectOnInvalid: '/dashboard/projects',
    requiresValidation: async (pathname, workspace, queryClient) => {
      const projectId = pathname.match(/\/projects\/([^/]+)/)?.[1];
      if (!projectId) return false;

      try {
        const project = await queryClient.fetchQuery({
          queryKey: ['workspace', workspace.id, 'project', projectId],
          queryFn: () => 
            fetch(`/api/projects/${projectId}?workspace=${workspace.id}`)
              .then(r => r.json()),
          staleTime: 5000,
        });
        return project.workspace_id === workspace.id;
      } catch {
        return false;
      }
    },
  },
  {
    pattern: /^\/dashboard\/projects\/([^/]+)\/scans\/([^/]+)/,
    type: 'entity-dependent',
    redirectOnInvalid: '/dashboard/projects',
    requiresValidation: async (pathname, workspace, queryClient) => {
      const matches = pathname.match(/\/projects\/([^/]+)\/scans\/([^/]+)/);
      const projectId = matches?.[1];
      const scanId = matches?.[2];
      
      if (!projectId || !scanId) return false;

      try {
        // Check if project belongs to workspace
        const project = await queryClient.fetchQuery({
          queryKey: ['workspace', workspace.id, 'project', projectId],
          queryFn: () => 
            fetch(`/api/projects/${projectId}?workspace=${workspace.id}`)
              .then(r => r.json()),
        });
        
        // Check if scan belongs to project
        const scan = await queryClient.fetchQuery({
          queryKey: ['workspace', workspace.id, 'scan', scanId],
          queryFn: () => 
            fetch(`/api/scans/${scanId}?workspace=${workspace.id}`)
              .then(r => r.json()),
        });
        
        return (
          project.workspace_id === workspace.id &&
          scan.repository_id === projectId
        );
      } catch {
        return false;
      }
    },
  },
];

export function classifyRoute(pathname: string): RouteDefinition {
  const match = ROUTE_DEFINITIONS.find((def) => def.pattern.test(pathname));
  return match || { pattern: /.*/, type: 'workspace-dependent' };
}

export type { RouteType, RouteDefinition };