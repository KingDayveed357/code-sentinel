
"use client";

import { useEffect, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { useProgressRouter as useRouter } from '@/hooks/use-progress-router';
import { useQueryClient } from '@tanstack/react-query';
import { handleRouteGuardFailure } from '@/lib/routes/guard-feedback';
import { RouteDefinition } from '@/lib/routes/route-classifier';
import { Workspace } from '@/lib/api/workspaces';
import { DashboardSkeleton } from '@/components/loaders/dashboard-skeleton';

interface EntityGuardProps {
  children: React.ReactNode;
  route: RouteDefinition;
  workspace: Workspace;
}

export function EntityGuard({ children, route, workspace }: EntityGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [isValidating, setIsValidating] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function validate() {
      if (!route.requiresValidation) {
        setIsValidating(false);
        return;
      }

      try {
        const isValid = await route.requiresValidation(pathname, workspace, queryClient);
        
        if (!active) return;

        if (!isValid) {
          // Determine specific failure reason based on context logic in route classifier could be improved
          // but for now, generic entity failure
          
          // Check if we switched workspace recently? (Edge case handling)
          // But here we are just validating entity existence.
          
          handleRouteGuardFailure('ENTITY_NOT_FOUND', router, workspace.id);
        } else {
          setIsValidating(false);
        }
      } catch (error) {
        console.error("Entity validation error", error);
        if (active) {
            handleRouteGuardFailure('ENTITY_ACCESS_DENIED', router, workspace.id);
        }
      }
    }

    validate();

    return () => { active = false; };
  }, [pathname, workspace.id, route, queryClient, router, workspace]);

  if (isValidating || isPending) {
    return <DashboardSkeleton />;
  }

  return <>{children}</>;
}
