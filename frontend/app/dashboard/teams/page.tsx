// "use client";

// import { useState, useEffect } from "react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Alert, AlertDescription } from "@/components/ui/alert";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "@/components/ui/dialog";
// import { Users, Plus, Crown, Shield, Loader2, AlertCircle, ArrowRight } from "lucide-react";
// import Link from "next/link";
// import { teamsApi, type Team } from "@/lib/api/teams";
// import { useToast } from "@/hooks/use-toast";
// import { useWorkspace } from "@/hooks/use-workspace";
// import { useAuth } from "@/hooks/use-auth";
// import { RequireTeamPlan } from "@/components/guards/require-team-plan";

// export default function TeamsListPage() {
//   const { toast } = useToast();
//   const { workspace, isTeamWorkspace } = useWorkspace();
//   const { user } = useAuth();
//   const [loading, setLoading] = useState(true);
//   const [teams, setTeams] = useState<any[]>([]);
//   const [createDialogOpen, setCreateDialogOpen] = useState(false);
//   const [teamName, setTeamName] = useState("");
//   const [creating, setCreating] = useState(false);

//   // Check if user can create teams (only in personal workspace with Team/Enterprise plan)
//   const canCreateTeam = !isTeamWorkspace && ["Team", "Enterprise"].includes(user?.plan || "");

//   useEffect(() => {
//     loadTeams();
//   }, []);

//   const loadTeams = async () => {
//     try {
//       setLoading(true);
//       const data = await teamsApi.list();
//       setTeams(data.teams);
//       console.log(data.teams);
//     } catch (error: any) {
//       toast({
//         title: "Failed to Load Teams",
//         description: error.message || "Please try again",
//         variant: "destructive",
//       });
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleCreateTeam = async () => {
//     if (!teamName.trim()) return;

//     // Block creation if in team workspace
//     if (isTeamWorkspace) {
//       toast({
//         title: "Cannot Create Team",
//         description: "You cannot create a team while in a team workspace. Switch to your personal workspace first.",
//         variant: "destructive",
//       });
//       return;
//     }

//     try {
//       setCreating(true);
//       await teamsApi.create({ name: teamName });
//       // Re-fetch teams from API instead of manually constructing
//       await loadTeams();
//       setCreateDialogOpen(false);
//       setTeamName("");

//       toast({
//         title: "Team Created",
//         description: `${teamName} has been created successfully`,
//       });
//     } catch (error: any) {
//       toast({
//         title: "Failed to Create Team",
//         description: error.message || "Please try again",
//         variant: "destructive",
//       });
//     } finally {
//       setCreating(false);
//     }
//   };

//   const getRoleBadge = (role: string) => {
//     const configs: Record<string, { label: string; className: string }> = {
//       owner: { label: "Owner", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400" },
//       admin: { label: "Admin", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400" },
//       developer: { label: "Developer", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400" },
//       viewer: { label: "Viewer", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400" },
//     };
//     return configs[role] || configs.developer;
//   };

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center min-h-[400px]">
//         <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
//       </div>
//     );
//   }

//   // If in personal workspace and user doesn't have Team/Enterprise plan, show unlock page
//   if (!isTeamWorkspace && !["Team", "Enterprise"].includes(user?.plan || "")) {
//     return <RequireTeamPlan />;
//   }

//   return (
//     <div className="space-y-6">
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-3xl font-bold flex items-center gap-2">
//             <Users className="h-8 w-8 text-primary" />
//             Teams
//           </h1>
//           <p className="text-muted-foreground mt-1">
//             {isTeamWorkspace 
//               ? "View and manage team members" 
//               : "Manage your teams and collaborate with others"}
//           </p>
//         </div>
//         {canCreateTeam && (
//           <Button onClick={() => setCreateDialogOpen(true)}>
//             <Plus className="mr-2 h-4 w-4" />
//             Create Team
//           </Button>
//         )}
//         {isTeamWorkspace && (
//           <div className="text-sm text-muted-foreground">
//             You're viewing teams in a team workspace. Switch to your personal workspace to create new teams.
//           </div>
//         )}
//       </div>

//       {teams.length === 0 ? (
//         <Card>
//           <CardContent className="flex flex-col items-center justify-center py-12">
//             <Users className="h-12 w-12 text-muted-foreground mb-4" />
//             <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
//             <p className="text-sm text-muted-foreground text-center mb-6">
//               Create your first team to collaborate with others
//             </p>
//             {canCreateTeam ? (
//               <Button onClick={() => setCreateDialogOpen(true)}>
//                 <Plus className="mr-2 h-4 w-4" />
//                 Create Your First Team
//               </Button>
//             ) : (
//               <Alert>
//                 <AlertCircle className="h-4 w-4" />
//                 <AlertDescription>
//                   {isTeamWorkspace 
//                     ? "Switch to your personal workspace to create teams."
//                     : "Upgrade to Team or Enterprise plan to create teams."}
//                 </AlertDescription>
//               </Alert>
//             )}
//           </CardContent>
//         </Card>
//       ) : (
//         <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
//           {teams.map((item) => (
//             <Card
//               key={item.team_id}
//               className="transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer"
//             >
//               <CardHeader>
//                 <CardTitle className="flex items-center justify-between">
//                   <span className="truncate">{item.team_name}</span>
//                   <Badge className={getRoleBadge(item.user_role).className}>
//                     {getRoleBadge(item.user_role).label}
//                   </Badge>
//                 </CardTitle>
//                 <CardDescription>
//                   {item.member_count} member{item.member_count !== 1 ? 's' : ''}
//                 </CardDescription>
//               </CardHeader>
//               <CardContent>
//                 <Button className="w-full" asChild>
//                   <Link href={`/dashboard/teams/${item.team_id}`}>
//                     Manage Team
//                     <ArrowRight className="ml-2 h-4 w-4" />
//                   </Link>
//                 </Button>
//               </CardContent>
//             </Card>
//           ))}
//         </div>
//       )}

//       <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
//         <DialogContent>
//           <DialogHeader>
//             <DialogTitle>Create New Team</DialogTitle>
//             <DialogDescription>
//               Create a team to collaborate with others on security scans
//             </DialogDescription>
//           </DialogHeader>
//           <div className="space-y-4 py-4">
//             <div className="space-y-2">
//               <Label htmlFor="teamName">Team Name</Label>
//               <Input
//                 id="teamName"
//                 placeholder="Engineering Team"
//                 value={teamName}
//                 onChange={(e) => setTeamName(e.target.value)}
//                 onKeyDown={(e) => {
//                   if (e.key === 'Enter' && teamName.trim()) {
//                     handleCreateTeam();
//                   }
//                 }}
//               />
//             </div>
//           </div>
//           <DialogFooter>
//             <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
//               Cancel
//             </Button>
//             <Button onClick={handleCreateTeam} disabled={!teamName.trim() || creating}>
//               {creating ? (
//                 <>
//                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                   Creating...
//                 </>
//               ) : (
//                 "Create Team"
//               )}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Plus, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { teamsApi } from "@/lib/api/teams";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { RequireTeamPlan } from "@/components/guards/require-team-plan";

export default function TeamsListPage() {
  const { toast } = useToast();
  const { workspace, isTeamWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<any[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // Check if user can create teams:
  // 1. In personal workspace: must be owner with Team/Enterprise plan
  // 2. In team workspace: must be the owner of that team workspace
  const canCreateTeam = isTeamWorkspace 
    ? workspace?.owner_id === user?.id
    : ["Team", "Enterprise"].includes(user?.plan || "") && workspace?.owner_id === user?.id;

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const data = await teamsApi.list();
      setTeams(data.teams);
    } catch (error: any) {
      toast({
        title: "Failed to Load Teams",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;

    // Block creation if user is not the owner of current workspace
    if (workspace?.owner_id !== user?.id) {
      toast({
        title: "Cannot Create Team",
        description: "Only workspace owners can create teams.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreating(true);
      await teamsApi.create({ name: teamName });
      await loadTeams();
      setCreateDialogOpen(false);
      setTeamName("");

      toast({
        title: "Team Created",
        description: `${teamName} has been created successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to Create Team",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      owner: { label: "Owner", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400" },
      admin: { label: "Admin", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400" },
      developer: { label: "Developer", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400" },
      viewer: { label: "Viewer", className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400" },
    };
    return configs[role] || configs.developer;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If in personal workspace and user doesn't have Team/Enterprise plan, show unlock page
  if (!isTeamWorkspace && !["Team", "Enterprise"].includes(user?.plan || "")) {
    return <RequireTeamPlan />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Teams
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTeamWorkspace 
              ? "View and manage team members" 
              : "Manage your teams and collaborate with others"}
          </p>
        </div>
        {canCreateTeam && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Team
          </Button>
        )}
        {isTeamWorkspace && workspace?.owner_id !== user?.id && (
          <div className="text-sm text-muted-foreground">
            Only the team workspace owner can create new teams.
          </div>
        )}
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Create your first team to collaborate with others
            </p>
            {canCreateTeam ? (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Team
              </Button>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {workspace?.owner_id !== user?.id
                    ? "Only workspace owners can create teams."
                    : !isTeamWorkspace && "Upgrade to Team or Enterprise plan to create teams."}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((item) => (
            <Card
              key={item.team_id}
              className="transition-all hover:-translate-y-1 hover:shadow-lg cursor-pointer"
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="truncate">{item.team_name}</span>
                  <Badge className={getRoleBadge(item.user_role).className}>
                    {getRoleBadge(item.user_role).label}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {item.member_count} member{item.member_count !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" asChild>
                  <Link href={`/dashboard/teams/${item.team_id}`}>
                    Manage Team
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
            <DialogDescription>
              Create a team to collaborate with others on security scans
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                placeholder="Engineering Team"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && teamName.trim()) {
                    handleCreateTeam();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={!teamName.trim() || creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Team"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}