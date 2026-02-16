// lib/routes/route-classifier.ts
import type { Workspace } from '@/lib/api/workspaces';
import {scansApi} from '@/lib/api/scans';
import { repositoriesApi } from '@/lib/api/repositories';
import { vulnerabilitiesApi } from '@/lib/api/vulnerabilities';

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
        await queryClient.fetchQuery({
          queryKey: ['workspace', workspace.id, 'project', projectId],
          queryFn: () =>  
            repositoriesApi.getById(workspace.id, projectId),
          retry: false, // Don't retry on 404s
        });
        return true;
      } catch (error: any) {
        // Strictly block if not found or access denied
        if (error.status === 404 || error.status === 403 || error.status === 401) {
          return false;
        }
        // Allow other errors (500, network) to pass through so the page can show a specific error
        return true;
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
        await queryClient.fetchQuery({
          queryKey: ['workspace', workspace.id, 'scan', scanId],
          queryFn: () => 
            scansApi.getById(workspace.id, scanId),
          retry: false,
        });
        return true;
      } catch (error: any) {
        if (error.status === 404 || error.status === 403 || error.status === 401) {
          return false;
        }
        return true;
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
        await queryClient.fetchQuery({
            queryKey: ['workspace', workspace.id, 'vulnerability', vulnId],
            queryFn: () =>
                vulnerabilitiesApi.getById(workspace.id, vulnId),
            retry: false,
        });
        return true;
      } catch (error: any) {
        if (error.status === 404 || error.status === 403 || error.status === 401) {
          return false;
        }
        return true;
      }
    },
  },
];

export function classifyRoute(pathname: string): RouteDefinition {
  const match = ROUTE_DEFINITIONS.find((def) => def.pattern.test(pathname));
  return match || { pattern: /.*/, type: 'workspace-dependent' };
}

export type { RouteType, RouteDefinition };