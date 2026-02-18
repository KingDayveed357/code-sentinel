"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  Users, 
  UserPlus, 
  Mail, 
  MoreVertical, 
  Shield, 
  Crown, 
  Eye,
  Trash2,
  RefreshCw,
  AlertCircle,
  Info,
  Clock,
  Activity,
  CheckCircle2,
  XCircle,
  Link as LinkIcon
} from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useWorkspace } from "@/hooks/use-workspace"
import { membersApi } from "@/lib/api/members"
import { useToast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { useWorkspaceMembers, useWorkspaceActivity, useWorkspaceInvitations } from "@/hooks/use-dashboard-data"
import {
  Tabs,
  TabsContent,
  TabsTrigger,
  TabsList
} from "@/components/ui/tabs"
import {
   Avatar,
   AvatarImage,
   AvatarFallback
} from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,  
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input} from "@/components/ui/input"
import { Label } from '@/components/ui/label'
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDistanceToNow } from "date-fns"



export default function MembersPage() {
  const { user } = useAuth()
  const { workspace, isTeamWorkspace } = useWorkspace()

  
  // Data Hooks
  const { 
    data: members = [], 
    isLoading: membersLoading, 
    error: membersError,
    refetch: refetchMembers 
  } = useWorkspaceMembers()

  const {
    data: invitations = [],
    isLoading: invitationsLoading,
    refetch: refetchInvitations
  } = useWorkspaceInvitations()

  const {
    data: activityLog =[],
    isLoading: activityLoading,
    refetch: refetchActivity
  } = useWorkspaceActivity(50)
  
  // Local State
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<'developer' | 'admin' | 'viewer'>('developer')
  const [inviting, setInviting] = useState(false)
  const [activeTab, setActiveTab] = useState("members")
  
  // Member Removal State
  const [memberToRemove, setMemberToRemove] = useState<{id: string, name: string} | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  // Permissions
  const currentUserRole = Array.isArray(members) ? members.find(m => m.user_id === user?.id)?.role : undefined
  const canInvite = currentUserRole && membersApi.canInviteMembers(currentUserRole)
  const canRemove = currentUserRole && membersApi.canRemoveMembers(currentUserRole)
  const canChangeRoles = currentUserRole && membersApi.canChangeRoles(currentUserRole)

  // Handlers
  const handleInviteMember = async () => {
    if (!workspace?.id || !inviteEmail) return
    // ... existing implementation ...
     try {
      const existingMember = members.find(m => m.email === inviteEmail)
      if (existingMember) {
        toast.info("User is already a member of this workspace.")
        setInviteDialogOpen(false)
        setInviteEmail("")
        return
      }

      setInviting(true)
      await membersApi.inviteMember(workspace.id, {
        email: inviteEmail,
        role: inviteRole,
      })
      
      toast( 
        <div>
          <strong>Invitation sent</strong>
          <p>An invitation has been sent to {inviteEmail}</p>
        </div>
      )
      
      setInviteDialogOpen(false)
      setInviteEmail("")
      setInviteRole('developer')
      refetchInvitations()
      refetchActivity()
    } catch (err: any) {
      toast.error(
        <div>
          <strong>Failed to send invitation</strong>
          <p>{err.message || "Please try again"}</p>
        </div>
    )
    } finally {
      setInviting(false)
    }
  }

  // ... handleCancelInvitation ...

  const confirmRemoveMember = (memberId: string, memberName: string) => {
      setMemberToRemove({ id: memberId, name: memberName })
  }

  const executeRemoveMember = async () => {
    if (!workspace?.id || !memberToRemove) return

    try {
      setIsRemoving(true)
      await membersApi.removeMember(workspace.id, memberToRemove.id)
      toast( 
        <div>
          <strong>Member removed</strong>
          <p>{memberToRemove.name} has been removed from the workspace</p>
        </div>
      )
      refetchMembers()
      refetchActivity()
      setMemberToRemove(null)
    } catch (err: any) {
      toast.error(
        <div>
          <strong>Failed to remove member</strong>
          <p>{err.message || "Please try again"}</p>
        </div>
      )
    } finally {
      setIsRemoving(false)
    }
  }

  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!workspace?.id) return
    
    try {
      setRevokingId(invitationId)
      // Use removeInvitation but backend now DELETEs it so it's gone for good.
      await membersApi.removeInvitation(workspace.id, invitationId)
      toast( 
      <div>
        <strong>Invitation revoked</strong>
        <p>Invitation to {email} has been cancelled</p>
      </div>
      )
      refetchInvitations()
      refetchActivity()
    } catch (err: any) {
      toast.error(
          <div>
            <strong>Failed to cancel invitation</strong>
            <p>{err.message || "Please try again"}</p>
          </div>
      )
    } finally {
        setRevokingId(null)
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!workspace?.id) return

    if (!confirm(`Are you sure you want to remove ${memberName} from this workspace?`)) {
        return
    }

    try {
      await membersApi.removeMember(workspace.id, memberId)
      toast( 
        <div>
          <strong>Member removed</strong>
          <p>{memberName} has been removed from the workspace</p>
        </div>
      )
      refetchMembers()
      refetchActivity()
    } catch (err: any) {
      toast.error(
        <div>
          <strong>Failed to remove member</strong>
          <p>{err.message || "Please try again"}</p>
        </div>
      )
    }
  }

  const handleUpdateRole = async (memberId: string, memberName: string, newRole: 'owner' | 'admin' | 'member' | 'viewer') => {
    if (!workspace?.id) return

    try {
      await membersApi.updateMemberRole(workspace.id, memberId, newRole)
      toast( 
        <div>
          <strong>Role updated</strong>
          <p>{memberName}'s role has been updated to {membersApi.getRoleDisplayName(newRole)}</p>
        </div>
      )
      refetchMembers()
      refetchActivity()
    } catch (err: any) {
      toast.error(
        <div>
          <strong>Failed to update role</strong>
          <p>{err.message || "Please try again"}</p>
        </div>
        )
    }
  }

  // Helpers
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Crown className="h-4 w-4 text-yellow-500" />
      case 'admin': return <Shield className="h-4 w-4 text-blue-500" />
      case 'viewer': return <Eye className="h-4 w-4 text-gray-500" />
      default: return <Users className="h-4 w-4 text-green-500" />
    }
  }

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    return (email || "").slice(0, 2).toUpperCase()
  }

  // Renderers
  if (membersLoading && members.length === 0) {
    return <div className="p-8 flex justify-center"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  if (!isTeamWorkspace) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Users className="h-8 w-8 text-primary" />
                    Workspace Members
                </h1>
                <p className="text-muted-foreground">Manage your workspace members and permissions</p>
            </div>
            
             <Alert className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-800 dark:text-blue-300 font-semibold">Personal Workspace</AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-400 mt-1">
                    You are viewing a personal workspace. Switch to a Team Workspace to invite members and collaborate.
                </AlertDescription>
            </Alert>

             <Card>
                <CardHeader>
                    <CardTitle>Owner</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={user?.avatar_url || ''} />
                            <AvatarFallback>{getInitials(user?.full_name || '', user?.email || '')}</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="font-semibold">{user?.full_name || 'You'}</div>
                            <div className="text-sm text-muted-foreground">{user?.email}</div>
                        </div>
                        <Badge className="ml-auto" variant="outline">Owner</Badge>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Team Members
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage access, roles, and view activity for {workspace?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetchMembers(); refetchInvitations(); refetchActivity(); }}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            {canInvite && (
                <Button onClick={() => setInviteDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" /> Invite Member
                </Button>
            )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="members" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Users className="h-4 w-4 mr-2" />
                Members
                <Badge variant="secondary" className="ml-2 h-5 min-w-[1.25rem] px-1">{members.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="invitations" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Mail className="h-4 w-4 mr-2" />
                Invitations
                {invitations.length > 0 && <Badge variant="secondary" className="ml-2 h-5 min-w-[1.25rem] px-1">{invitations.length}</Badge>}
            </TabsTrigger>
             <TabsTrigger value="activity" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Activity className="h-4 w-4 mr-2" />
                Activity Log
            </TabsTrigger>
        </TabsList>

        {/* MEMBERS CONTENT */}
        <TabsContent value="members" className="space-y-4 animate-in fade-in-50 duration-300">
             <div className="grid gap-4">
                {members.map((member) => (
                <Card key={member.id} className="group hover:border-primary/50 transition-colors">
                    <CardContent className="p-6 flex items-center gap-4">
                     <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                        <AvatarImage src={member.avatar_url || ''} />
                        <AvatarFallback className="bg-primary/5 text-primary font-semibold">
                            {getInitials(member.full_name, member.email)}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate text-base">{member.full_name || member.email}</h3>
                            {member.user_id === user?.id && <Badge variant="secondary" className="text-[10px] h-5">You</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{member.email}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Badge variant={membersApi.getRoleBadgeVariant(member.role)} className="px-3 py-1 flex items-center gap-1.5 capitalize">
                            {getRoleIcon(member.role)}
                            {membersApi.getRoleDisplayName(member.role)}
                        </Badge>

                        {/* Actions */}
                        {canChangeRoles && member.user_id !== user?.id && (
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                     {['admin', 'member', 'viewer'].map((role) => (
                                        <DropdownMenuItem 
                                            key={role}
                                            onClick={() => handleUpdateRole(member.id, member.full_name || member.email, role as any)}
                                            disabled={member.role === role}
                                        >
                                            {member.role === role && <CheckCircle2 className="h-4 w-4 mr-2 text-primary" />}
                                            <span className={member.role === role ? 'font-medium' : ''}>
                                            {membersApi.getRoleDisplayName(role)}
                                            </span>
                                        </DropdownMenuItem>
                                     ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => confirmRemoveMember(member.id, member.full_name || member.email)}>
                                        <Trash2 className="h-4 w-4 mr-2" /> Remove Member
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                        )}
                    </div>
                    </CardContent>
                </Card>
                ))}
             </div>
        </TabsContent>

        {/* INVITATIONS CONTENT */}
        <TabsContent value="invitations" className="space-y-4 animate-in fade-in-50 duration-300">
            {invitations.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
                    <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <h3 className="font-semibold text-lg">No pending invitations</h3>
                    <p className="text-muted-foreground">Invite team members to collaborate.</p>
                    {canInvite && (
                        <Button className="mt-4" variant="outline" onClick={() => setInviteDialogOpen(true)}>
                            Invite Member
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid gap-4">
                    {invitations.map((inv: any) => (
                        <Card key={inv.id} className="border-l-4 border-l-primary/50">
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                     <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Mail className="h-5 w-5 text-primary" />
                                     </div>
                                     <div>
                                        <div className="font-semibold">{inv.email}</div>
                                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs uppercase scale-90 origin-left">
                                                {inv.role}
                                            </Badge>
                                            <span>• Invited by {inv.invited_by_name || 'Admin'}</span>
                                            <span>• {new Date(inv.created_at).toLocaleDateString()}</span>
                                        </div>
                                     </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                     <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="text-destructive hover:bg-destructive/10 border-destructive/20" 
                                        onClick={() => handleCancelInvitation(inv.id, inv.email)}
                                        disabled={revokingId === inv.id}
                                     >
                                        {revokingId === inv.id ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                                        Revoke
                                     </Button>
                                     {process.env.NODE_ENV === 'development' && (
                                         <div className="flex items-center gap-2 text-xs truncate text-muted-foreground bg-muted p-1 rounded">
                                            <LinkIcon className="h-3 w-3" />
                                            <span className="max-w-[150px]  select-all font-mono">
                                                {window.location.origin}/accept-invite?token={inv.token}
                                            </span>
                                         </div>
                                     )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </TabsContent>

        {/* ACTIVITY CONTENT */}
        <TabsContent value="activity" className="space-y-4 animate-in fade-in-50 duration-300">
             <Card>
                <CardHeader>
                    <CardTitle>Activity Log</CardTitle>
                    <CardDescription>Recent actions and changes in this workspace</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[500px] pr-4">
                        {activityLoading ? (
                             <div className="space-y-4">
                                {[1,2,3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
                             </div>
                        ) : activityLog.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">No recent activity</div>
                        ) : (
                            <div className="space-y-6">
                                {activityLog.map((log: any) => (
                                    <div key={log.id} className="flex gap-4 relative">
                                        {/* Timeline Line */}
                                        <div className="absolute left-[19px] top-10 bottom-[-24px] w-[2px] bg-muted/50 last:hidden" />
                                        
                                        <Avatar className="h-10 w-10 border bg-background z-10">
                                            <AvatarImage src={log.actor?.avatar_url || ''} />
                                            <AvatarFallback className="text-xs bg-muted">
                                                {getInitials(log.actor?.full_name || null, log.actor?.email || log.metadata?.actor_email || '')}
                                            </AvatarFallback>
                                        </Avatar>
                                        
                                        <div className="flex-1 pt-1">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="text-sm font-medium flex flex-wrap items-center gap-1">
                                                    <span className="text-primary font-semibold">
                                                        {log.actor?.full_name || log.actor?.email || log.metadata?.actor_email || 'System'}
                                                    </span>
                                                    <span className="text-muted-foreground font-normal">
                                                        {log.action.replace(/\./g, ' ')}
                                                    </span>
                                                    <span className="font-medium text-foreground">
                                                        {log.metadata?.email 
                                                          ? log.metadata.email 
                                                          : log.resource_type === 'workspace_member' 
                                                            ? 'a member' 
                                                            : log.resource_type.replace(/_/g, ' ')
                                                        }
                                                    </span>
                                                </div>
                                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                            {/* Show metadata details if relevant, e.g. role change */}
                                            {(log.metadata?.role || log.metadata?.new_role) && (
                                                <div className="text-xs text-muted-foreground mt-1 bg-muted/30 p-1.5 rounded w-fit flex items-center gap-1">
                                                    {log.metadata.old_role && <span>{log.metadata.old_role} →</span>}
                                                    <span className="font-medium">{log.metadata.role || log.metadata.new_role}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
             </Card>
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Enter the email address of the person you want to invite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                placeholder="colleague@example.com" 
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(val: any) => setInviteRole(val)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                  <SelectItem value="developer">Member (Can scan/edit)</SelectItem>
                  <SelectItem value="admin">Admin (Full access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
             <Button onClick={handleInviteMember} disabled={inviting || !inviteEmail}>
                {inviting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                Send Invitation
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Alert Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <span className="font-medium text-foreground">{memberToRemove?.name}</span> from this workspace? 
              They will lose access to all projects and resources immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
                onClick={(e) => {
                    e.preventDefault();
                    executeRemoveMember();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isRemoving}
            >
              {isRemoving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}