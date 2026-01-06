// components/dashboard/billing-skeleton.tsx
"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loader for billing page during workspace transitions
 * Shows premium loading states with shimmer effect
 */
export function BillingPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Current Usage Card Skeleton */}
      <Card className="border-primary">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Usage bars skeleton */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Plans Grid Skeleton */}
      <div>
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="grid gap-6 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 w-32 mt-2" />
                <Skeleton className="h-4 w-48 mt-2" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
                <Skeleton className="h-10 w-full mt-4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
