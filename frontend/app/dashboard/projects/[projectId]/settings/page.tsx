'use client'
import { use, useEffect, useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  GitBranch,
  Zap,
  Webhook,
  XCircle,
  Github,
  Plus,
  X,
  RefreshCw,
  Users,
  UserPlus,
  Shield,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { DisconnectProjectDialog } from "@/components/dashboard/project/disconnect-project-dialog";
import { repositoriesApi } from "@/lib/api/repositories";
import { membersApi } from "@/lib/api/members";
import type { Repository, RepositorySettings } from "@/lib/api/repositories";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from "@/components/ui/avatar";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { workspace } = useWorkspace();

  const [project, setProject] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBasicSettings, setSavingBasicSettings] = useState(false);
  const [savingScanSettings, setSavingScanSettings] = useState(false);
  const [savingIssueSettings, setSavingIssueSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic form state
  const [displayName, setDisplayName] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "error">("active");

  // Auto-scan settings
  const [settings, setSettings] = useState<RepositorySettings>({
    auto_scan_enabled: false,
    scan_on_push: true,
    scan_on_pr: false,
    branch_filter: ["main", "master"],
    excluded_branches: [],
    default_scan_type: "full",
    auto_create_issues: false,
    issue_severity_threshold: "high",
    issue_labels: ["security", "automated"],
    issue_assignees: [],
  });

  const [originalSettings, setOriginalSettings] = useState<RepositorySettings>(settings);
  const [webhookStatus, setWebhookStatus] = useState<"active" | "inactive" | "failed" | null>(null);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Project members state
  const [assignedMembers, setAssignedMembers] = useState<any[]>([]);
  const [availableWorkspaceMembers, setAvailableWorkspaceMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [assigningMember, setAssigningMember] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  const normalizedSearchQuery = memberSearchQuery.trim().toLowerCase();
  const assignedUserIds = new Set(assignedMembers.map((member) => member.user_id));
  const assignableMembers = availableWorkspaceMembers.filter((member) => {
    if (assignedUserIds.has(member.user_id)) return false;

    if (!normalizedSearchQuery) return true;

    const memberName = (member.full_name || "").toLowerCase();
    const memberEmail = (member.email || "").toLowerCase();
    return memberName.includes(normalizedSearchQuery) || memberEmail.includes(normalizedSearchQuery);
  });

  useEffect(() => {
    if (workspace?.id) {
      loadProject();
    }
  }, [projectId, workspace?.id]);

  const loadProject = async () => {
    if (!workspace?.id) {
      setError("Workspace not loaded");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load project data
      const projectData = await repositoriesApi.getById(workspace.id, projectId);
      setProject(projectData);
      setDisplayName(projectData.name);
      setDefaultBranch(projectData.default_branch);
      setStatus(projectData.status);

      // Load settings and webhook status
      const settingsResponse = await repositoriesApi.getSettings(workspace.id, projectId);

      if (settingsResponse?.settings) {
        setSettings(settingsResponse.settings);
        setOriginalSettings(settingsResponse.settings);
      }

      if (settingsResponse?.webhook_status) {
        setWebhookStatus(settingsResponse.webhook_status);
      }
    } catch (err: any) {
      console.error('Error loading project:', err);
      setError(err.message || "Failed to load project");
      toast.error(
        <div>
          <strong>Failed to load project settings</strong>
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    if (!workspace?.id) return;
    
    try {
      setLoadingMembers(true);
      const [assigned, allWorkspaceMembers] = await Promise.all([
        repositoriesApi.getMembers(workspace.id, projectId),
        membersApi.list(workspace.id)
      ]);
      setAssignedMembers(assigned);
      setAvailableWorkspaceMembers(allWorkspaceMembers.members);
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (workspace?.id) {
      loadMembers();
    }
  }, [projectId, workspace?.id]);

  const handleAssignMember = async (userId: string) => {
    if (!workspace?.id) return;

    try {
      setAssigningMember(userId);
      await repositoriesApi.assignMember(workspace.id, projectId, userId);
      toast.success("Member assigned successfully");
      loadMembers(); // Refresh list
    } catch (err: any) {
      toast.error(err.message || "Failed to assign member");
    } finally {
      setAssigningMember(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!workspace?.id) return;

    try {
      setRemovingMember(userId);
      await repositoriesApi.removeMember(workspace.id, projectId, userId);
      toast.success("Member removed from project");
      loadMembers(); // Refresh list
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member");
    } finally {
      setRemovingMember(null);
    }
  };

  const handleSaveBasic = async () => {
    if (!project || !workspace?.id) return;

    try {
      setSavingBasicSettings(true);
      setError(null);

      const updates: any = {};
      if (displayName !== project.name) updates.name = displayName;
      if (defaultBranch !== project.default_branch) updates.default_branch = defaultBranch;
      if (status !== project.status) updates.status = status;

      if (Object.keys(updates).length === 0) {
        toast(
          <div>
            <strong>No Changes</strong>
            <p>No changes to save</p>
          </div>
        );
        return;
      }

      const updated = await repositoriesApi.update(workspace.id, projectId, updates);
      setProject(updated);
      
      toast.success("Basic settings saved successfully");
    } catch (err: any) {
      console.error('Error saving basic settings:', err);
      setError(err.message || "Failed to save changes");
      toast.error(
        <div>
          <strong>Failed to save changes</strong>
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setSavingBasicSettings(false);
    }
  };

  const handleSaveScanSettings = async () => {
    if (!workspace?.id) return;

    try {
      setSavingScanSettings(true);
      setError(null);

      const scanSettingsOnly = {
        auto_scan_enabled: settings.auto_scan_enabled,
        scan_on_push: settings.scan_on_push,
        scan_on_pr: settings.scan_on_pr,
        branch_filter: settings.branch_filter,
        excluded_branches: settings.excluded_branches,
        default_scan_type: settings.default_scan_type,
      };

      await repositoriesApi.updateSettings(workspace.id, projectId, scanSettingsOnly);

      setOriginalSettings(settings);

      // Refresh webhook status if auto-scan is enabled
      if (settings.auto_scan_enabled && webhookStatus !== "active") {
        setTimeout(async () => {
          try {
            const settingsResponse = await repositoriesApi.getSettings(workspace.id, projectId);
            setWebhookStatus(settingsResponse.webhook_status);
          } catch (err) {
            console.error('Error refreshing webhook status:', err);
          }
        }, 1000);
      }

      toast.success("Auto-scan settings saved successfully");
    } catch (err: any) {
      console.error('Error saving scan settings:', err);
      setError(err.message || "Failed to save auto-scan settings");
      toast.error(
        <div>
          <strong>Failed to save auto-scan settings</strong>  
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setSavingScanSettings(false);
    }
  };

  const handleSaveIssueSettings = async () => {
    if (!workspace?.id) return;

    try {
      setSavingIssueSettings(true);
      setError(null);

      const issueSettingsOnly = {
        auto_create_issues: settings.auto_create_issues,
        issue_severity_threshold: settings.issue_severity_threshold,
        issue_labels: settings.issue_labels,
        issue_assignees: settings.issue_assignees,
      };

      await repositoriesApi.updateSettings(workspace.id, projectId, issueSettingsOnly);

      setOriginalSettings(settings);

      toast.success("Issue settings saved successfully");
    } catch (err: any) {
      console.error('Error saving issue settings:', err);
      setError(err.message || "Failed to save issue settings");
      toast.error(
        <div>
          <strong>Failed to save issue settings</strong>
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setSavingIssueSettings(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!workspace?.id) return;

    try {
      setRegisteringWebhook(true);
      setError(null);

      const response = await repositoriesApi.registerWebhook(workspace.id, projectId);

      if (response.success) {
        setWebhookStatus("active");
        toast.success("Webhook registered successfully");
      } else {
        throw new Error(response.error || "Failed to register webhook");
      }
    } catch (err: any) {
      console.error('Error registering webhook:', err);
      setError(err.message || "Failed to register webhook");
      toast.error(
        <div>
          <strong>Failed to register webhook</strong>
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const addBranch = () => {
    if (newBranch && !settings.branch_filter.includes(newBranch)) {
      setSettings({
        ...settings,
        branch_filter: [...settings.branch_filter, newBranch],
      });
      setNewBranch("");
    }
  };

  const removeBranch = (branch: string) => {
    setSettings({
      ...settings,
      branch_filter: settings.branch_filter.filter((b) => b !== branch),
    });
  };

  const addLabel = () => {
    if (newLabel && !settings.issue_labels.includes(newLabel)) {
      setSettings({
        ...settings,
        issue_labels: [...settings.issue_labels, newLabel],
      });
      setNewLabel("");
    }
  };

  const removeLabel = (label: string) => {
    setSettings({
      ...settings,
      issue_labels: settings.issue_labels.filter((l) => l !== label),
    });
  };

  // Detect changes for each section independently
  const hasScanSettingsChanges = 
    settings.auto_scan_enabled !== originalSettings.auto_scan_enabled ||
    settings.scan_on_push !== originalSettings.scan_on_push ||
    settings.scan_on_pr !== originalSettings.scan_on_pr ||
    JSON.stringify(settings.branch_filter) !== JSON.stringify(originalSettings.branch_filter) ||
    JSON.stringify(settings.excluded_branches) !== JSON.stringify(originalSettings.excluded_branches) ||
    settings.default_scan_type !== originalSettings.default_scan_type;

  const hasIssueSettingsChanges =
    settings.auto_create_issues !== originalSettings.auto_create_issues ||
    settings.issue_severity_threshold !== originalSettings.issue_severity_threshold ||
    JSON.stringify(settings.issue_labels) !== JSON.stringify(originalSettings.issue_labels) ||
    JSON.stringify(settings.issue_assignees) !== JSON.stringify(originalSettings.issue_assignees);

  const hasBasicChanges =
    project &&
    (displayName !== project.name ||
      defaultBranch !== project.default_branch ||
      status !== project.status);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace?.id) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Workspace not loaded</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl px-4 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Project Settings</h1>
        <p className="text-muted-foreground mt-1">Manage settings for {project?.name}</p>
      </div>

      {error && project && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="scanning">Scanning</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Basic project settings and configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="my-project"
            />
            <p className="text-xs text-muted-foreground">
              The name shown in CodeSentinel. This doesn't affect the actual repository.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name (Read-only)</Label>
            <Input
              id="full-name"
              value={project?.full_name || ""}
              disabled
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-branch">Default Branch</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="default-branch"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
                placeholder="main"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The primary branch to scan. Usually "main" or "master".
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Project Status</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Active - Monitoring enabled
                  </div>
                </SelectItem>
                <SelectItem value="inactive">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-500" />
                    Inactive - Monitoring paused
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSaveBasic} disabled={!hasBasicChanges || savingBasicSettings}>
              {savingBasicSettings ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
            {hasBasicChanges && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!project) return;
                  setDisplayName(project.name);
                  setDefaultBranch(project.default_branch);
                  setStatus(project.status);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="scanning" className="space-y-6">

      {/* Webhook Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Status
          </CardTitle>
          <CardDescription>GitHub webhook for automatic scanning</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {webhookStatus === "active" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : webhookStatus === "failed" ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : (
                <XCircle className="h-5 w-5 text-gray-400" />
              )}
              <div>
                <p className="font-medium">
                  {webhookStatus === "active" ? "Connected" : "Not Connected"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {webhookStatus === "active"
                    ? "Receiving events from GitHub"
                    : "Configure webhook to enable auto-scanning"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadProject}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              {webhookStatus !== "active" && (
                <Button onClick={handleRegisterWebhook} disabled={registeringWebhook}>
                  {registeringWebhook ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    "Register Webhook"
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Scan Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Automatic Scanning
          </CardTitle>
          <CardDescription>
            Automatically scan your repository on push events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-scan">Enable Auto-Scanning</Label>
              <p className="text-sm text-muted-foreground">
                Automatically trigger scans on new commits
              </p>
            </div>
            <Switch
              id="auto-scan"
              checked={settings.auto_scan_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, auto_scan_enabled: checked })
              }
            />
          </div>

          {settings.auto_scan_enabled && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Scan on Push</Label>
                  <p className="text-sm text-muted-foreground">
                    Trigger scans when commits are pushed
                  </p>
                </div>
                <Switch
                  checked={settings.scan_on_push}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, scan_on_push: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Scan on Pull Requests</Label>
                  <p className="text-sm text-muted-foreground">
                    Trigger scans when PRs are opened or updated
                  </p>
                </div>
                <Switch
                  checked={settings.scan_on_pr}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, scan_on_pr: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Scan Type</Label>
                <Select
                  value={settings.default_scan_type}
                  onValueChange={(v: any) =>
                    setSettings({ ...settings, default_scan_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quick">Quick - SAST & Secrets only</SelectItem>
                    <SelectItem value="full">Full - All scanners</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Branch Filter</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="e.g., develop"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && addBranch()}
                  />
                  <Button onClick={addBranch} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {settings.branch_filter.map((branch) => (
                    <Badge key={branch} variant="secondary">
                      <GitBranch className="h-3 w-3 mr-1" />
                      {branch}
                      <button
                        className="ml-2 hover:text-red-500"
                        onClick={() => removeBranch(branch)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only scan these branches. Leave empty to scan all branches.
                </p>
              </div>
            </>
          )}

          <Button 
            onClick={handleSaveScanSettings} 
            disabled={savingScanSettings || !hasScanSettingsChanges} 
            className="w-full"
          >
            {savingScanSettings ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Auto-Scan Settings
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="issues" className="space-y-6">

      {/* GitHub Issue Creation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Issue Creation
          </CardTitle>
          <CardDescription>
            Automatically create GitHub issues for vulnerabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Auto-Create Issues</Label>
              <p className="text-sm text-muted-foreground">
                Create GitHub issues for detected vulnerabilities
              </p>
            </div>
            <Switch
              checked={settings.auto_create_issues}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, auto_create_issues: checked })
              }
            />
          </div>

          {settings.auto_create_issues && (
            <>
              <div className="space-y-2">
                <Label>Minimum Severity</Label>
                <Select
                  value={settings.issue_severity_threshold}
                  onValueChange={(v: any) =>
                    setSettings({ ...settings, issue_severity_threshold: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical Only</SelectItem>
                    <SelectItem value="high">High & Critical</SelectItem>
                    <SelectItem value="medium">Medium & Above</SelectItem>
                    <SelectItem value="low">Low & Above</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only create issues for vulnerabilities at or above this severity
                </p>
              </div>

              <div className="space-y-2">
                <Label>Issue Labels</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="e.g., bug"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && addLabel()}
                  />
                  <Button onClick={addLabel} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {settings.issue_labels.map((label) => (
                    <Badge key={label} variant="secondary">
                      {label}
                      <button
                        className="ml-2 hover:text-red-500"
                        onClick={() => removeLabel(label)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button 
            onClick={handleSaveIssueSettings} 
            disabled={savingIssueSettings || !hasIssueSettingsChanges} 
            className="w-full"
          >
            {savingIssueSettings ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Issue Settings
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="access" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Project Access
            </CardTitle>
            <CardDescription>
              Manage who can view and manage this project. Owners and Admins always have full access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Assign Member Input */}
            <div className="space-y-4">
              <Label>Assign New Member</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search workspace members by name or email..." 
                    className="pl-9"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                  />
                  
                  {memberSearchQuery && (
                    <Card className="absolute top-full left-0 right-0 mt-1 z-10 shadow-lg max-h-[300px] overflow-y-auto">
                      <CardContent className="p-0">
                        {assignableMembers.map((member) => (
                            <button
                              key={member.user_id}
                              className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                              onClick={() => {
                                handleAssignMember(member.user_id);
                                setMemberSearchQuery("");
                              }}
                              disabled={assigningMember === member.user_id}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={member.avatar_url || ""} />
                                <AvatarFallback>{member.full_name?.charAt(0) || member.email?.charAt(0) || "U"}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{member.full_name || member.email}</p>
                                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                              </div>
                              {assigningMember === member.user_id ? (
                                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                              ) : (
                                <UserPlus className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                        ))}
                        {assignableMembers.length === 0 && (
                          <p className="p-4 text-sm text-muted-foreground text-center">No matching members found</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label>Assigned Members ({assignedMembers.length})</Label>
              <div className="border rounded-lg divide-y">
                {loadingMembers ? (
                   <div className="flex items-center justify-center py-8">
                     <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                   </div>
                ) : assignedMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-10 w-10 text-muted-foreground mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">Only workspace admins have access to this project.</p>
                  </div>
                ) : (
                  assignedMembers.map((assignment) => (
                    <div key={assignment.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                         <Avatar className="h-10 w-10">
                           <AvatarImage src={assignment.user?.avatar_url} />
                           <AvatarFallback>{assignment.user?.full_name?.charAt(0) || "?"}</AvatarFallback>
                         </Avatar>
                         <div>
                           <p className="font-semibold">{assignment.user?.full_name || assignment.user?.email}</p>
                           <p className="text-sm text-muted-foreground">{assignment.user?.email}</p>
                         </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveMember(assignment.user_id)}
                        disabled={removingMember === assignment.user_id}
                      >
                        {removingMember === assignment.user_id ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                           "Remove"
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible and destructive actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
            <div className="flex-1">
              <h4 className="font-semibold mb-1">Disconnect Project</h4>
              <p className="text-sm text-muted-foreground">
                Remove this project from CodeSentinel. This will delete all scan history and
                settings. This action cannot be undone.
              </p>
            </div>
            <DisconnectProjectDialog 
              project={project ? { id: projectId, name: project.name } : null}
              workspaceId={workspace.id}
              redirectTo="/dashboard/projects"
              trigger={
                <Button variant="destructive" className="ml-4 flex-shrink-0">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
