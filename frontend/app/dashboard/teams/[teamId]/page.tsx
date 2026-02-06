"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  Trash2,
  Shield,
  Crown,
  Settings,
  Mail,
  MoreVertical,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Activity,
  Eye,
} from "lucide-react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { teamsApi, type TeamMember, type TeamInvitation } from "@/lib/api/teams";
import { toast } from "sonner";

export default function TeamManagementPage({params}: {params: Promise<{teamId: string}>}) {
  const { teamId } = use(params);

  // State
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);

  // Invite Dialog State
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "developer" | "viewer">("developer");
  const [inviting, setInviting] = useState(false);

  // Remove Member Dialog State
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean;
    member: TeamMember | null;
  }>({ open: false, member: null });
  const [removing, setRemoving] = useState(false);

  // Update Role Dialog State
  const [updateRoleDialog, setUpdateRoleDialog] = useState<{
    open: boolean;
    member: TeamMember | null;
  }>({ open: false, member: null });
  const [roleToUpdate, setRoleToUpdate] = useState<"admin" | "developer" | "viewer">("developer");
  const [updatingRole, setUpdatingRole] = useState(false);

  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

  // Load team data
  useEffect(() => {
    if (teamId) {
      loadTeamData();
    }
  }, [teamId]);

  // Sync role selection when opening update dialog
  useEffect(() => {
    if (updateRoleDialog.member && updateRoleDialog.member.role !== 'owner') {
      setRoleToUpdate(updateRoleDialog.member.role as "admin" | "developer" | "viewer");
    }
  }, [updateRoleDialog.member]);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      const data = await teamsApi.get(teamId);
      setTeam(data.team);
      setMembers(data.members);
      console.log("Members:", data.members);
      setInvitations(data.invitations);
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Load Team</strong>
          <p>{error.message}</p>
        </div>
      );
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMember = async () => {
    if (!inviteEmail || !teamId) return;

    try {
      setInviting(true);
      const result = await teamsApi.invite(teamId, {
        email: inviteEmail,
        role: inviteRole,
      });

      setInvitations([...invitations, result.invitation]);
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("developer");

      toast.success(`Invitation sent to ${inviteEmail}`);
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Send Invitation</strong>
          <p>{error.message}</p>
        </div>
      );
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberDialog.member || !teamId) return;

    try {
      setRemoving(true);
      await teamsApi.removeMember(teamId, removeMemberDialog.member.id);

      setMembers(members.filter((m) => m.id !== removeMemberDialog.member!.id));
      setRemoveMemberDialog({ open: false, member: null });

      toast.success(`${removeMemberDialog.member.users.full_name} has been removed from the team`);
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Remove Member</strong>
          <p>{error.message}</p>
        </div>
      );
    } finally {
      setRemoving(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!updateRoleDialog.member || !teamId) return;

    try {
      setUpdatingRole(true);
      const result = await teamsApi.updateMemberRole(
        teamId,
        updateRoleDialog.member.id,
        roleToUpdate
      );


        setMembers(members.map(m => 
        m.id === updateRoleDialog.member?.id
          ? { ...m, role: result.member.role }
          : m
      ));

      setUpdateRoleDialog({ open: false, member: null });

      toast.success(`${updateRoleDialog.member.users.full_name}'s role changed to ${roleToUpdate}`);
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Update Role</strong>
          <p>{error.message}</p>
        </div>
      );
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleCopyInviteLink = (invitation: TeamInvitation) => {
    const inviteUrl = `${window.location.origin}/dashboard/teams/invite/${invitation.token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvite(invitation.id);
    setTimeout(() => setCopiedInvite(null), 2000);

    toast.success("Invitation link copied to clipboard");
  };

  const getRoleBadge = (role: string) => {
    const configs = {
      owner: { 
        label: "Owner", 
        icon: Crown, 
        className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400" 
      },
      admin: { 
        label: "Admin", 
        icon: Shield, 
        className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400" 
      },
      developer: { 
        label: "Developer", 
        icon: Users, 
        className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400" 
      },
      viewer: { 
        label: "Viewer", 
        icon: Eye, 
        className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400" 
      },
    };
    return configs[role as keyof typeof configs] || configs.developer;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Team not found or you don't have access.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/dashboard/teams">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Teams
          </Link>
        </Button>
      </div>
    );
  }

  const canManageMembers = team.role === "owner" || team.role === "admin";
  const isOwner = team.role === "owner";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/teams">Teams</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{team?.name || "Team"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link href="/dashboard/teams">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Users className="h-7 w-7 md:h-8 md:w-8 text-primary" />
              {team.name}
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage team members and permissions
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 md:flex-initial">
            <Link href={`/dashboard/teams/${teamId}/activity`}>
              <Activity className="mr-2 h-4 w-4" />
              Activity
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="flex-1 md:flex-initial">
            <Link href={`/dashboard/teams/${teamId}/settings`}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
          {canManageMembers && (
            <Button onClick={() => setInviteDialogOpen(true)} className="flex-1 md:flex-initial">
              <Plus className="mr-2 h-4 w-4" />
              Invite
            </Button>
          )}
        </div>
      </div>

      {/* Team Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">
              {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Your Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge className={getRoleBadge(team.role).className}>
                {getRoleBadge(team.role).label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {team.isOwner ? "You own this team" : "Team member"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members ({members.length})</CardTitle>
          <CardDescription>Manage who has access to your repositories and scans</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => {
              const roleBadge = getRoleBadge(member.role);
              const RoleIcon = roleBadge.icon;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage src={member.users.avatar_url || ""} />
                      <AvatarFallback>
                        {member.users.full_name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase() || member.users.email[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">
                        {member.users.full_name || member.users.email}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {member.users.email}
                      </p>
                      {member.joined_at && (
                        <p className="text-xs text-muted-foreground">
                          Joined {formatDate(member.joined_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className={roleBadge.className}>
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {roleBadge.label}
                    </Badge>
                    {member.role !== "owner" && canManageMembers && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {isOwner && (
                            <>
                              <DropdownMenuItem
                                onClick={() => setUpdateRoleDialog({ open: true, member })}
                              >
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRemoveMemberDialog({ open: true, member })}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove from Team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations ({invitations.length})</CardTitle>
            <CardDescription>Invitations waiting to be accepted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{invitation.email}</h3>
                      <p className="text-sm text-muted-foreground">
                        Invited {formatDate(invitation.created_at)} • Expires{" "}
                        {formatDate(invitation.expires_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant="outline">{invitation.role}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyInviteLink(invitation)}
                      title="Copy invitation link"
                    >
                      {copiedInvite === invitation.id ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Role Permissions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-4 w-4 text-yellow-600" />
              <h4 className="font-medium">Owner</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Full access to all repositories, team management, billing, and can delete the team
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium">Admin</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Can manage repositories, view all scans, invite/remove members, and assign vulnerabilities
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-gray-600" />
              <h4 className="font-medium">Developer</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Can view assigned repositories, trigger scans, and work on assigned vulnerabilities
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-purple-600" />
              <h4 className="font-medium">Viewer</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Can view repositories and scan results, but cannot make changes or trigger scans
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your team. They'll receive an email with a link to accept.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteMember} disabled={!inviteEmail || inviting}>
              {inviting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Update Role Dialog */}
      <Dialog
        open={updateRoleDialog.open}
        onOpenChange={(open) => setUpdateRoleDialog({ open, member: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Member Role</DialogTitle>
            <DialogDescription>
              Change the role permissions for {updateRoleDialog.member?.users.full_name || "this user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="update-role">Role</Label>
              <Select 
                value={roleToUpdate} 
                onValueChange={(v: "admin" | "developer" | "viewer") => setRoleToUpdate(v)}
              >
                <SelectTrigger id="update-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpdateRoleDialog({ open: false, member: null })}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateRole} disabled={updatingRole}>
              {updatingRole ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog
        open={removeMemberDialog.open}
        onOpenChange={(open) => setRemoveMemberDialog({ open, member: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member from the team?
              They will lose access to all team repositories and scans.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This action cannot be undone. The member will need to be re-invited to regain access.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveMemberDialog({ open: false, member: null })}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={removing}>
              {removing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Member"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}