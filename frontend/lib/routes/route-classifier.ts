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
    pattern: /^\/dashboard\/scans\/([^/]+)/,
    type: 'entity-dependent',
    redirectOnInvalid: '/dashboard/scans', // Redirect to main scans list
    requiresValidation: async (pathname, workspace, queryClient) => {
      const scanId = pathname.match(/\/scans\/([^/]+)/)?.[1];
      if (!scanId) return false;

      try {
        // Fetch scan details to verify workspace ownership
        const scan = await queryClient.fetchQuery({
          queryKey: ['workspace', workspace.id, 'scan', scanId],
          queryFn: () => 
            fetch(`/api/scans/${scanId}?workspace=${workspace.id}`)
              .then(res => {
                if (!res.ok) throw new Error('Scan not found');
                return res.json();
              }),
        });
        
        // Check if scan belongs to a project in this workspace
        // Usually scan object has project_id or repository_id, and we trust backend validation
        // But backend just returns 404 if not found in workspace, so scan fetch failing means invalid.
        return !!scan;
      } catch {
        return false;
      }
    },
  },
  {
    pattern: /^\/dashboard\/vulnerabilities\/([^/]+)/,
    type: 'entity-dependent',
    redirectOnInvalid: '/dashboard/vulnerabilities',
    requiresValidation: async (pathname, workspace, queryClient) => {
      const vulnId = pathname.match(/\/vulnerabilities\/([^/]+)/)?.[1];
      if (!vulnId) return false;

      try {
        const vuln = await queryClient.fetchQuery({
            queryKey: ['workspace', workspace.id, 'vulnerability', vulnId],
            queryFn: () =>
                fetch(`/api/vulnerabilities/${vulnId}?workspace=${workspace.id}`)
                    .then(res => {
                        if (!res.ok) throw new Error('Vulnerability not found');
                        return res.json();
                    }),
        });
        return !!vuln;
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