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
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { teamsApi } from "@/lib/api/teams";
import { useToast } from "@/hooks/use-toast";

export default function TeamSettingsPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const { teamId } = use(params);

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedTeamId, setCopiedTeamId] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

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
      setTeamName(data.team.teamData.name);
      console.log("Loaded team data:", data);
    } catch (error: any) {
      toast({
        title: "Failed to Load Team",
        description: error.message || "Please try again",
        variant: "destructive",
      });
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
      const result = await teamsApi.updateTeam(teamId, { name: teamName });
      setTeam(result.team);
      toast({
        title: "Team Updated",
        description: "Team name has been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Failed to Update Team",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async () => {
    try {
      setDeleting(true);
      await teamsApi.deleteTeam(teamId);
      toast({
        title: "Team Deleted",
        description: "The team has been deleted successfully",
      });
      router.push("/dashboard/teams");
    } catch (error: any) {
      toast({
        title: "Failed to Delete Team",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleCopyTeamId = () => {
    navigator.clipboard.writeText(teamId);
    setCopiedTeamId(true);
    setTimeout(() => setCopiedTeamId(false), 2000);
    toast({
      title: "Copied",
      description: "Team ID copied to clipboard",
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
      </div>

      {/* Team Name */}
      <Card>
        <CardHeader>
          <CardTitle>Team Name</CardTitle>
          <CardDescription>Change your team's display name</CardDescription>
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
          </div>
          {canEdit && (
            <Button onClick={handleUpdateTeamName} disabled={saving || teamName === team.name}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
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

