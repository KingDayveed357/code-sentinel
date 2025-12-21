"use client"

import { Card, CardContent, CardHeader } from "@/components/ui/card"

/**
 * Premium skeleton loader - Now only shows dynamic content
 * Header is always visible in the main component
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Grid Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 bg-muted rounded shimmer" />
                <div className="h-4 w-4 bg-muted rounded shimmer" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-20 bg-muted rounded shimmer mb-2" />
              <div className="h-3 w-36 bg-muted rounded shimmer" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid Skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Security Score Skeleton */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="h-6 w-40 bg-muted rounded shimmer" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center mb-6">
              <div className="h-32 w-32 rounded-full bg-muted shimmer" />
            </div>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-24 bg-muted rounded shimmer" />
                  <div className="h-4 w-8 bg-muted rounded shimmer" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Critical Vulnerabilities Skeleton */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="h-6 w-48 bg-muted rounded shimmer" />
              <div className="h-8 w-20 bg-muted rounded shimmer" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 pb-4 border-b last:border-0">
                  <div className="h-5 w-5 bg-muted rounded shimmer flex-shrink-0 mt-1" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-full bg-muted rounded shimmer" />
                    <div className="h-3 w-3/4 bg-muted rounded shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart Skeleton */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="h-6 w-40 bg-muted rounded shimmer" />
        </CardHeader>
        <CardContent>
          <div className="h-[320px] bg-muted rounded-lg shimmer" />
        </CardContent>
      </Card>

      {/* Recent Scans Skeleton */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="h-6 w-32 bg-muted rounded shimmer" />
            <div className="h-8 w-32 bg-muted rounded shimmer" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-lg shimmer" />
            ))}
          </div>
        </CardContent>
      </Card>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }

        .shimmer {
          animation: shimmer 2s infinite linear;
          background: linear-gradient(
            to right,
            hsl(var(--muted)) 0%,
            hsl(var(--muted) / 0.5) 50%,
            hsl(var(--muted)) 100%
          );
          background-size: 1000px 100%;
        }
      `}</style>
    </div>
  )
}