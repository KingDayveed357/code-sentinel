"use client";

import { useWorkspace } from "@/hooks/use-workspace";
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
import { Building2, User, ChevronDown, Loader2 } from "lucide-react";

export function WorkspaceSwitcher() {
  const { workspace, workspaces, loading, switchWorkspace } = useWorkspace();

  if (loading || !workspace) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </Button>
    );
  }

  const personalWorkspaces = workspaces.filter((w) => w.type === "personal");
  const teamWorkspaces = workspaces.filter((w) => w.type === "team");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {workspace.type === "personal" ? (
            <User className="h-4 w-4" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          <span className="max-w-[120px] truncate">{workspace.name}</span>
          <Badge
            variant="secondary"
            className="text-xs px-1.5 py-0"
          >
            {workspace.type === "personal" ? "Personal" : "Team"}
          </Badge>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {personalWorkspaces.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Personal
            </DropdownMenuLabel>
            {personalWorkspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{ws.name}</span>
                </div>
                {workspace.id === ws.id && (
                  <span className="text-xs text-primary">Current</span>
                )}
              </DropdownMenuItem>
            ))}
            {teamWorkspaces.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {teamWorkspaces.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Team Workspaces
            </DropdownMenuLabel>
            {teamWorkspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
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
                    <span className="text-xs text-primary">Current</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {workspaces.length === 0 && (
          <DropdownMenuItem disabled>No workspaces available</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

