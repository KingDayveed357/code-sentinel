// components/dashboard/breadcrumbs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home, Loader2 } from 'lucide-react';
import { useProjectBreadcrumbs } from '@/hooks/use-project-breadcrumbs';
import { useWorkspace } from '@/hooks/use-workspace';

interface BreadcrumbItem {
  label: string;
  href: string;
  loading?: boolean;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { workspace } = useWorkspace();

  // Parse project ID from URL
  const projectIdMatch = pathname.match(/\/projects\/([^\/]+)/);
  const projectId = projectIdMatch ? projectIdMatch[1] : null;

  // Only fetch project data if we're on a project route
  const project = useProjectBreadcrumbs(projectId);

  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard' },
    ];

    const pathSegments = pathname.split('/').filter(Boolean);

    // Remove 'dashboard' from segments as it's already in breadcrumbs
    const segments = pathSegments.slice(1);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const href = `/dashboard/${segments.slice(0, i + 1).join('/')}`;

      // Handle special routes
      if (segment === 'projects') {
        if (segments[i + 1] && segments[i + 1] !== 'new') {
          // We're in a specific project
          breadcrumbs.push({ label: 'Projects', href: '/dashboard/projects' });
          
          const projectIdSegment = segments[i + 1];
          
          // Add project name breadcrumb
          breadcrumbs.push({
            label: project.loading ? 'Loading...' : (project.name || 'Unknown Project'),
            href: `/dashboard/projects/${projectIdSegment}`,
            loading: project.loading,
          });

          // Skip the project ID segment
          i++;

          // Handle project sub-routes (settings, scans, etc.)
          if (segments[i + 1]) {
            const subRoute = segments[i + 1];
            breadcrumbs.push({
              label: formatLabel(subRoute),
              href: `/dashboard/projects/${projectIdSegment}/${subRoute}`,
            });
            i++;
          }
        } else if (segments[i + 1] === 'new') {
          // Handle /projects/new route
          breadcrumbs.push({ label: 'Projects', href: '/dashboard/projects' });
          breadcrumbs.push({ label: 'New Project', href: '/dashboard/projects/new' });
          i++;
        } else {
          // Just /projects
          breadcrumbs.push({ label: 'Projects', href });
        }
      } else if (segment === 'settings') {
        breadcrumbs.push({ label: 'Settings', href });
      } else if (segment === 'integrations') {
        breadcrumbs.push({ label: 'Integrations', href });
      } else if (segment === 'members') {
        breadcrumbs.push({ label: 'Members', href });
      } else if (segment === 'billing') {
        breadcrumbs.push({ label: 'Billing', href });
      } else if (segment === 'profile') {
        breadcrumbs.push({ label: 'Profile', href });
      } else if (!isUUID(segment)) {
        // Only add if it's not a UUID (to avoid showing IDs in breadcrumbs)
        breadcrumbs.push({
          label: formatLabel(segment),
          href,
        });
      }
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return null; // Don't show breadcrumbs if we're just on the dashboard
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center space-x-2 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={crumb.href} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 mx-2 flex-shrink-0" />
              )}
              
              {isLast ? (
                <span className="font-medium text-foreground flex items-center gap-2">
                  {crumb.loading && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-foreground transition-colors flex items-center gap-2"
                >
                  {index === 0 && <Home className="h-4 w-4" />}
                  {crumb.loading && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Helper functions
function formatLabel(segment: string): string {
  return segment
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}