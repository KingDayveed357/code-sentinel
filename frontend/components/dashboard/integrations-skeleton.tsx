// components/dashboard/integrations-skeleton.tsx
"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Premium skeleton loader for individual integration cards
 * Shows loading state only for dynamic content (connection status, account info)
 * Static content (icon, name, description) remains visible
 */
export function IntegrationCardSkeleton({ 
  icon: Icon, 
  name, 
  description 
}: { 
  icon: any; 
  name: string; 
  description: string;
}) {
  return (
    <Card className="relative transition-all">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Static icon and name - always visible */}
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="text-base font-semibold">{name}</div>
              <div className="flex items-center gap-2 mt-1">
                {/* Dynamic badge - skeleton */}
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Static description - always visible */}
        <p className="text-sm text-muted-foreground mb-4">
          {description}
        </p>

        {/* Dynamic content area - skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-9 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Workspace name skeleton for header
 */
export function WorkspaceNameSkeleton() {
  return (
    <p className="text-sm text-muted-foreground mt-2">
      Managing integrations for <Skeleton className="inline-block h-4 w-48 align-middle" />
    </p>
  );
}