// components/dashboard/projects-skeleton.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MoreVertical, Plus, RefreshCw } from "lucide-react";

/**
 * Skeleton for the projects page header
 * Shows loading state for dynamic content (project count, workspace name)
 */
export function ProjectsHeaderSkeleton() {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <div className="mt-1">
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="mt-1">
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" disabled>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync
        </Button>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Import Project
        </Button>
      </div>
    </div>
  );
}

/**
 * Skeleton for individual project cards
 * Shows loading state for dynamic content while keeping card structure visible
 */
export function ProjectCardSkeleton() {
  return (
    <Card className="relative">
      <CardContent className="pt-6">
        {/* Header with name and actions */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <div className="flex items-center gap-2 mt-2">
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
          <Button variant="ghost" size="icon" disabled>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>

        {/* Scan info section */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Latest Scan</span>
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Skeleton className="h-5 w-28" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Full page skeleton for initial load
 */
export function ProjectsPageSkeleton() {
  return (
    <div className="space-y-6">
      <ProjectsHeaderSkeleton />
      
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full md:w-[180px]" />
        <Skeleton className="h-10 w-full md:w-[180px]" />
      </div>

      {/* Projects Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}