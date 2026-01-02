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

export function WorkspaceSwitcher() {
  const { 
    workspace, 
    workspaces, 
    isSwitching,
    // isValidating,
    switchWorkspace 
  } = useWorkspace();
  
  const prefetchWorkspace = usePrefetchWorkspace();

  // Show skeleton during initialization only
  if (!workspace) {
    return <Skeleton className="h-9 w-[200px]" />;
  }

  const personalWorkspaces = workspaces.filter((w) => w.type === "personal");
  const teamWorkspaces = workspaces.filter((w) => w.type === "team");
  const isLoading = isSwitching ;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 max-w-[200px]"
          disabled={isLoading}
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
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </div>
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
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </div>
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