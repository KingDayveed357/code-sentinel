"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Settings,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Trash2,
  CreditCard,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { teamsApi } from "@/lib/api/teams";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { notifyWorkspaceUpdate } from "@/hooks/use-workspace-refresh";

export default function TeamSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  
  const router = useRouter();
  const { teamId } = use(params);
  const { workspace, updateWorkspace } = useWorkspaceStore();

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  // Track if current workspace is this team
  const isCurrentWorkspace = workspace?.id === teamId;

  useEffect(() => {
    if (teamId) {
      loadTeam();
    }
  }, [teamId]);

  const loadTeam = async () => {
    try {
      setLoading(true);
      const data = await teamsApi.get(teamId);
      setTeam(data.team);
      setTeamName(data.team.name || "Team");
      console.log("Loaded team data:", data);
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Load Team</strong>
          <p>{error.message}</p>
        </div>
      );
      // Redirect if not authorized
      if (error.message?.includes("forbidden") || error.message?.includes("not found")) {
        router.push("/dashboard/teams");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTeamName = async () => {
    if (!teamName.trim() || teamName === team.name) return;

    try {
      setSaving(true);

      // Optimistic update for current workspace
      if (isCurrentWorkspace) {
        updateWorkspace(teamId, { name: teamName });
      }

      // API call to persist changes
      const result = await teamsApi.updateTeam(teamId, { name: teamName });
      
      // Update local team state
      setTeam((prev: any) => ({
        ...prev,
        ...result.team,
      }));

      // Notify workspace switcher and all workspace-dependent components
      // This triggers intelligent refresh across the entire app
      notifyWorkspaceUpdate(teamId);

      toast.success("Team name has been updated successfully");

      console.log("✅ Team name updated, workspace refresh triggered");
    } catch (error: any) {
      // Rollback optimistic update on error
      if (isCurrentWorkspace && team.name) {
        updateWorkspace(teamId, { name: team.name });
      }

      toast.error(
        <div>
          <strong>Failed to Update Team</strong>
          <p>{error.message}</p>
        </div>
      );
      
      console.error("❌ Failed to update team:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    try {
      setDeleting(true);
      await teamsApi.deleteTeam(teamId);
      
      // If deleting current workspace, the workspace switcher will handle fallback
      if (isCurrentWorkspace) {
        console.log("⚠️ Deleted current workspace, system will redirect to personal workspace");
      }

      toast.success("The team has been deleted successfully");
      
      router.push("/dashboard/teams");
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Delete Team</strong>
          <p>{error.message}</p>
        </div>
      );
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleCopyTeamId = () => {
    navigator.clipboard.writeText(teamId);
    setCopiedTeamId(true);
    setTimeout(() => setCopiedTeamId(false), 2000);
    toast.success("Team ID copied to clipboard");
  };

  // Manual refresh trigger for team data
  const handleRefreshTeam = async () => {
    await loadTeam();
    if (isCurrentWorkspace) {
      notifyWorkspaceUpdate(teamId);
    }
    toast.success("Team data has been refreshed");
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

  // Check permissions
  const isOwner = team.role === "owner";
  const isAdmin = team.role === "admin";
  const canEdit = isOwner;
  const canView = isOwner || isAdmin;

  if (!canView) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access team settings. Only owners and admins can view settings.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/teams/${teamId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Team
          </Link>
        </Button>
      </div>
    );
  }

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
            <BreadcrumbLink asChild>
              <Link href={`/dashboard/teams/${teamId}`}>{team.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/dashboard/teams/${teamId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Settings className="h-8 w-8 text-primary" />
              Team Settings
            </h1>
          </div>
          <p className="text-muted-foreground ml-14">
            Manage your team settings and configuration
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshTeam}
          title="Refresh team data"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Active Workspace Indicator */}
      {isCurrentWorkspace && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This is your current active workspace. Changes will be reflected immediately in the workspace switcher.
          </AlertDescription>
        </Alert>
      )}

      {/* Team Name */}
      <Card>
        <CardHeader>
          <CardTitle>Team Name</CardTitle>
          <CardDescription>
            Change your team's display name
            {isCurrentWorkspace && " (updates workspace switcher in real-time)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teamName">Team Name</Label>
            <Input
              id="teamName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              disabled={!canEdit}
              placeholder="Enter team name"
            />
            {isCurrentWorkspace && teamName !== team.name && (
              <p className="text-xs text-muted-foreground">
                💡 Changes will update the workspace switcher without page reload
              </p>
            )}
          </div>
          {canEdit && (
            <Button 
              onClick={handleUpdateTeamName} 
              disabled={saving || teamName === team.name || !teamName.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving & Syncing...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          )}
          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              Only the team owner can change the team name.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Team Information */}
      <Card>
        <CardHeader>
          <CardTitle>Team Information</CardTitle>
          <CardDescription>View your team's details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Team ID</Label>
            <div className="flex items-center gap-2">
              <Input value={teamId} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyTeamId}
                title="Copy Team ID"
              >
                {copiedTeamId ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Input value={team.plan} readOnly />
          </div>
          <div className="space-y-2">
            <Label>Subscription Status</Label>
            <Input
              value={team.subscription_status || "No subscription"}
              readOnly
            />
          </div>
          <div className="space-y-2">
            <Label>Created</Label>
            <Input
              value={new Date(team.created_at).toLocaleDateString()}
              readOnly
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing & Subscription
            </CardTitle>
            <CardDescription>
              Manage your team's subscription and billing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/dashboard/billing?teamId=${teamId}`}>
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Billing
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Deleting a team will permanently remove all team data, members, projects, scans, and findings.
                This action cannot be undone.
                {isCurrentWorkspace && " You will be redirected to your personal workspace."}
              </AlertDescription>
            </Alert>
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Team
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setConfirmDeleteName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              Are you absolutely sure you want to delete this team? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This will permanently delete:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All team members and invitations</li>
                <li>All projects and repositories</li>
                <li>All scans and findings</li>
                <li>All activity logs</li>
              </ul>
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="confirmName">
              Type <strong>{team.name}</strong> to confirm:
            </Label>
            <Input
              id="confirmName"
              placeholder={team.name}
              value={confirmDeleteName}
              onChange={(e) => setConfirmDeleteName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTeam}
              disabled={deleting || confirmDeleteName !== team.name}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Team"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}