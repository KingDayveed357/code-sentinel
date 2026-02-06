// components/dashboard/layout/workspace-switcher.tsx
"use client";

import { useWorkspace } from "@/hooks/use-workspace";
import { usePrefetchWorkspace } from "@/hooks/use-dashboard-data";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, User, ChevronDown, Loader2, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useWorkspaceRefresh } from "@/hooks/use-workspace-refresh";
import { motion, AnimatePresence } from "framer-motion";

export function WorkspaceSwitcher() {
  const { 
    workspace, 
    workspaces, 
    isSwitching,
    switchWorkspace 
  } = useWorkspace();
  
  const prefetchWorkspace = usePrefetchWorkspace();
  
  // Smart refresh hook that listens for workspace updates
  const { isRefreshing } = useWorkspaceRefresh();

  // Show premium skeleton during initialization or refresh
  if (!workspace || isRefreshing) {
    return <WorkspaceSwitcherSkeleton />;
  }

  const personalWorkspaces = workspaces.filter((w) => w.type === "personal");
  const teamWorkspaces = workspaces.filter((w) => w.type === "team");
  const isLoading = isSwitching;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 max-w-[200px] relative overflow-hidden"
          disabled={isLoading}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={workspace.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 min-w-0"
            >
              {workspace.type === "personal" ? (
                <User className="h-4 w-4 flex-shrink-0" />
              ) : (
                <Building2 className="h-4 w-4 flex-shrink-0" />
              )}
              <span className="truncate">{workspace.name}</span>
              <Badge
                variant="secondary"
                className="text-xs px-1.5 py-0 hidden sm:inline-flex flex-shrink-0"
              >
                {workspace.plan}
              </Badge>
            </motion.div>
          </AnimatePresence>
          {isLoading ? (
            <Loader2 className="h-4 w-4 opacity-50 animate-spin flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Switch Workspace</span>
          <Badge variant="outline" className="text-xs">
            {workspaces.length} total
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Personal Workspaces */}
        {personalWorkspaces.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal px-2 py-1.5">
              Personal
            </DropdownMenuLabel>
            {personalWorkspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                onMouseEnter={() => prefetchWorkspace(ws.id)}
                disabled={workspace.id === ws.id || isLoading}
                className="flex items-center justify-between cursor-pointer"
              >
                <motion.div 
                  className="flex items-center gap-2 flex-1 min-w-0"
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </motion.div>
                {workspace.id === ws.id && (
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
            {teamWorkspaces.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {/* Team Workspaces */}
        {teamWorkspaces.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal px-2 py-1.5">
              Team Workspaces
            </DropdownMenuLabel>
            {teamWorkspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                onMouseEnter={() => prefetchWorkspace(ws.id)}
                disabled={workspace.id === ws.id || isLoading}
                className="flex items-center justify-between cursor-pointer"
              >
                <motion.div 
                  className="flex items-center gap-2 flex-1 min-w-0"
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </motion.div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {ws.plan}
                  </Badge>
                  {workspace.id === ws.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {workspaces.length === 0 && (
          <DropdownMenuItem disabled className="text-center">
            No workspaces available
          </DropdownMenuItem>
        )}

        {/* Create Team Action */}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/teams" className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create Team Workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Premium skeleton loader component
function WorkspaceSwitcherSkeleton() {
  return (
    <div className="relative h-9 w-[200px] overflow-hidden rounded-md border bg-background">
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-muted/50 to-transparent"
        animate={{
          x: ["-100%", "100%"],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      
      {/* Content skeleton */}
      <div className="flex items-center gap-2 px-3 h-full">
        <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
        <Skeleton className="h-4 flex-1 rounded" />
        <Skeleton className="h-5 w-12 rounded hidden sm:block flex-shrink-0" />
        <Skeleton className="h-4 w-4 rounded flex-shrink-0" />
      </div>
    </div>
  );
}