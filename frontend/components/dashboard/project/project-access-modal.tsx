"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Check, UserPlus, UserMinus, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMembers, type WorkspaceMember } from "@/lib/api/workspaces";
import { repositoriesApi } from "@/lib/api/repositories";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

interface ProjectAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId: string;
  projectName: string;
}

export function ProjectAccessModal({
  open,
  onOpenChange,
  workspaceId,
  projectId,
  projectName,
}: ProjectAccessModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const queryClient = useQueryClient();

  // Fetch all workspace members
  const { data: workspaceMembers = [], isLoading: isLoadingWorkspaceMembers } = useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => getMembers(workspaceId),
    enabled: open,
  });

  // Fetch currently assigned members
  const { data: projectMembers = [], isLoading: isLoadingProjectMembers } = useQuery({
    queryKey: ["workspace", workspaceId, "project", projectId, "members"],
    queryFn: () => repositoriesApi.getMembers(workspaceId, projectId),
    enabled: open,
  });

  // Derive assigned user IDs
  const assignedUserIds = useMemo(() => {
    return new Set(projectMembers.map((m: any) => m.user_id));
  }, [projectMembers]);

  // Mutations
  const assignMutation = useMutation({
    mutationFn: (userId: string) => repositoriesApi.assignMember(workspaceId, projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "project", projectId, "members"] });
      toast.success("Member assigned to project");
    },
    onError: () => {
      toast.error("Failed to assign member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => repositoriesApi.removeMember(workspaceId, projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "project", projectId, "members"] });
      toast.success("Member removed from project");
    },
    onError: () => {
      toast.error("Failed to remove member");
    },
  });

  // Filter members based on search
  const filteredMembers = useMemo(() => {
    if (!workspaceMembers) return [];
    
    // Sort: Assigned first, then by name
    return [...workspaceMembers]
      .filter((member) => {
        const query = debouncedSearch.toLowerCase();
        const name = member.user?.full_name?.toLowerCase() || "";
        const email = member.user?.email.toLowerCase() || "";
        const role = member.role.toLowerCase();
        
        return name.includes(query) || email.includes(query) || role.includes(query);
      })
      .sort((a, b) => {
        const aAssigned = assignedUserIds.has(a.user_id);
        const bAssigned = assignedUserIds.has(b.user_id);
        
        if (aAssigned && !bAssigned) return -1;
        if (!aAssigned && bAssigned) return 1;
        
        return (a.user?.full_name || "").localeCompare(b.user?.full_name || "");
      });
  }, [workspaceMembers, debouncedSearch, assignedUserIds]);

  const isLoading = isLoadingWorkspaceMembers || isLoadingProjectMembers;

  const handleToggle = (userId: string, isAssigned: boolean) => {
    if (isAssigned) {
      removeMutation.mutate(userId);
    } else {
      assignMutation.mutate(userId);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "owner":
        return <Badge variant="default" className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">Owner</Badge>;
      case "admin":
        return <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">Admin</Badge>;
      case "developer":
        return <Badge variant="outline" className="border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-400">Developer</Badge>;
      case "viewer":
        return <Badge variant="outline" className="text-muted-foreground">Viewer</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Access</DialogTitle>
          <DialogDescription>
            Manage who has access to <span className="font-medium text-foreground">{projectName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="rounded-md border bg-muted/30">
            <div className="flex items-center justify-between p-3 border-b bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Workspace Members</span>
              <span className="text-xs text-muted-foreground">
                {assignedUserIds.size} assigned
              </span>
            </div>
            
            <ScrollArea className="h-[300px]">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <p className="text-sm">Loading members...</p>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground p-4 text-center">
                  <ShieldAlert className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm font-medium">No members found</p>
                  <p className="text-xs">Try adjusting your search terms</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredMembers.map((member) => {
                    const isAssigned = assignedUserIds.has(member.user_id);
                    const isMutating = assignMutation.isPending || removeMutation.isPending; // Simple lock, could be more granular

                    return (
                      <div key={member.id} className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.user?.avatar_url || ""} />
                            <AvatarFallback>{member.user?.full_name?.charAt(0) || member.user?.email.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{member.user?.full_name || "Unknown User"}</span>
                                {getRoleBadge(member.role)}
                            </div>
                            <span className="text-xs text-muted-foreground truncate">{member.user?.email}</span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant={isAssigned ? "secondary" : "outline"}
                          className={isAssigned 
                            ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 border-transparent ml-2" 
                            : "ml-2"
                          }
                          onClick={() => handleToggle(member.user_id, isAssigned)}
                          disabled={isMutating}
                        >
                          {isAssigned ? (
                            <>
                              <Check className="mr-1 h-3 w-3" />
                              Assigned
                            </>
                          ) : (
                            <>
                              <UserPlus className="mr-1 h-3 w-3" />
                              Assign
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2 sm:mt-0">
             <ShieldCheck className="h-3 w-3" />
             <span className="opacity-80">Changes apply immediately</span>
          </div>
          <Button onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
