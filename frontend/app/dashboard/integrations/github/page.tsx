// app/dashboard/integrations/github/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Github,
  Search,
  Loader2,
  AlertCircle,
  Lock,
  Globe,
  RefreshCw,
  Check,
  Info,
  ChevronLeft,
  Download,
  Star,
  GitFork,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { repositoriesApi } from "@/lib/api/repositories";
import { integrationsApi } from "@/lib/api/integrations";
import { useWorkspace } from "@/hooks/use-workspace";
import { useGitHubRepositories, useGitHubIntegrationStatus, workspaceKeys } from "@/hooks/use-dashboard-data";
import type { GitHubRepository, GitHubAccount } from "@/lib/api/repositories";

export default function GitHubIntegrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, isSwitching } = useWorkspace();
  const queryClient = useQueryClient();
  
  // Use workspace-aware React Query hooks
  const {
    data: integrationStatus,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useGitHubIntegrationStatus();
  
  const {
    data: reposData,
    isLoading: isLoadingRepos,
    isFetching: isFetchingRepos,
    refetch: refetchRepos,
  } = useGitHubRepositories();
  
  // Derived state from queries
  const connected = integrationStatus?.connected ?? false;
  const account: GitHubAccount | null = integrationStatus?.account ? {
    username: integrationStatus.account.username,
    avatar_url: integrationStatus.account.avatar_url,
    name: integrationStatus.account.name || null,
    email: integrationStatus.account.email || null,
    public_repos: reposData?.repositories?.length ?? 0, // Use actual count from repos data
  } : null;
  
  const repositories = reposData?.repositories ?? [];
  
  // Local UI state
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Disconnect modal
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // Determine loading state - show loading when switching workspace or fetching data
  const loading = isLoadingStatus || isSwitching;
  const loadingRepos = isLoadingRepos || isFetchingRepos || isSwitching;

  // Reset selected repos when workspace changes
  useEffect(() => {
    setSelectedRepos(new Set());
  }, [workspace?.id]);

  const loadConnectionStatus = useCallback(async () => {
    try {
      setError(null);
      // Refetch integration status - React Query will handle the loading state
      await refetchStatus();
      
      // If connected, also load repositories
      if (integrationStatus?.connected) {
        await refetchRepos();
      }
    } catch (err: any) {
      console.error('Failed to load connection status:', err);
      setError(err.message || "Failed to load GitHub status");
    }
  }, [refetchStatus, refetchRepos, integrationStatus?.connected]);

  const connectGitHubIntegration = useCallback(async (providerToken: string) => {
    if (!workspace) {
      setError('No workspace selected');
      return;
    }
    
    try {
      setConnecting(true);
      setError(null);
      
      const result = await integrationsApi.connectGitHub(providerToken);
      
      if (result.success) {
        setSuccess('GitHub connected successfully!');
        // Invalidate queries to refetch with new connection
        queryClient.invalidateQueries({
          queryKey: workspaceKeys.all(workspace.id),
        });
        await loadConnectionStatus();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Failed to connect GitHub:', err);
      setError(err.message || 'Failed to connect GitHub integration');
    } finally {
      setConnecting(false);
    }
  }, [workspace, queryClient, loadConnectionStatus]);

  const handlePageLoad = useCallback(async () => {
    if (!workspace) return; // Wait for workspace to be available
    
    const providerToken = searchParams.get('token') || searchParams.get('access_token');
    const installSuccess = searchParams.get('success');
    const installError = searchParams.get('error');
    
    if (providerToken) {
      // OAuth callback (personal workspace only)
      await connectGitHubIntegration(providerToken);
      // Clean URL
      window.history.replaceState({}, '', '/dashboard/integrations/github');
    } else if (installSuccess) {
      // GitHub App installation success
      setSuccess('GitHub App installed successfully!');
      // Invalidate queries to refetch with new connection
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.all(workspace.id),
      });
      await loadConnectionStatus();
      // Clean URL
      window.history.replaceState({}, '', '/dashboard/integrations/github');
      setTimeout(() => setSuccess(null), 5000);
    } else if (installError) {
      // GitHub App installation error
      setError('Failed to install GitHub App. Please try again.');
      await loadConnectionStatus();
      // Clean URL
      window.history.replaceState({}, '', '/dashboard/integrations/github');
    }
    // Normal load - React Query will handle fetching automatically
  }, [searchParams, workspace, queryClient, connectGitHubIntegration, loadConnectionStatus]);

  // Handle OAuth callbacks and workspace changes
  useEffect(() => {
    handlePageLoad();
  }, [handlePageLoad]); // Reload when workspace or search params change

  // const loadConnectionStatus = useCallback(async () => {
  //   try {
  //     setError(null);
  //     // Refetch integration status - React Query will handle the loading state
  //     await refetchStatus();
      
  //     // If connected, also load repositories
  //     if (integrationStatus?.connected) {
  //       await refetchRepos();
  //     }
  //   } catch (err: any) {
  //     console.error('Failed to load connection status:', err);
  //     setError(err.message || "Failed to load GitHub status");
  //   }
  // }, [refetchStatus, refetchRepos, integrationStatus?.connected]);

  const loadRepositories = useCallback(async () => {
    try {
      setError(null);
      // Refetch repositories - React Query will handle the loading state
      await refetchRepos();
    } catch (err: any) {
      console.error('Failed to load repositories:', err);
      
      if (err.message?.includes('not connected')) {
        // Status will be updated by React Query
      } else if (err.message?.includes('expired')) {
        setError('GitHub token expired. Please reconnect your account.');
      } else {
        setError(err.message || "Failed to load GitHub repositories");
      }
      
      throw err;
    }
  }, [refetchRepos]);

  /**
   * 🚨 CRITICAL FIX: Workspace-aware GitHub connection
   * 
   * Personal workspace → OAuth flow
   * Team workspace → GitHub App installation
   */
  const handleConnect = async () => {
    if (!workspace) {
      setError('No workspace selected');
      return;
    }

    try {
      setConnecting(true);
      setError(null);

      // Call backend to get appropriate connection flow
      const result = await integrationsApi.connectGitHub();

      if (result.mode === 'oauth') {
        // Personal workspace → Redirect to OAuth
        const params = new URLSearchParams({
          workspace_id: workspace.id,
          return_to: "/dashboard/integrations/github",
        });
        window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/github?${params.toString()}`;
      } else if (result.mode === 'github_app') {
        if (result.status === 'already_connected') {
          setSuccess('GitHub App already connected');
          await loadConnectionStatus();
        } else if (result.install_url) {
          // Team workspace → Redirect to GitHub App installation
          window.location.href = result.install_url;
        }
      }
    } catch (err: any) {
      console.error('Failed to initiate connection:', err);
      setError(err.message || 'Failed to connect GitHub');
      setConnecting(false);
    }
    // Don't set connecting to false - we're redirecting
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      setError(null);
      
      const result = await integrationsApi.disconnectIntegration('github');
      
      if (result.success) {
        setSuccess('GitHub disconnected successfully');
        setSelectedRepos(new Set());
        setShowDisconnectModal(false);
        
        // Invalidate queries to clear cached data
        if (workspace) {
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.all(workspace.id),
          });
        }
        
        // If requires sign out (personal workspace only auth method)
        if (result.requiresSignOut) {
          setTimeout(() => {
            window.location.href = '/auth/signin';
          }, 2000);
        }
      }
    } catch (err: any) {
      console.error('Failed to disconnect GitHub:', err);
      setError(err.message || 'Failed to disconnect GitHub');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleImport = async () => {
    if (selectedRepos.size === 0) return;
    
    try {
      setImporting(true);
      setError(null);
      
      const reposToImport = repositories
        .filter(r => selectedRepos.has(r.full_name))
        .map(r => ({
          name: r.name,
          full_name: r.full_name,
          owner: r.owner,
          private: r.private,
          url: r.url,
          default_branch: r.default_branch,
          description: r.description
        }));
      
      const result = await repositoriesApi.import(reposToImport, "github");
      
      if (result.success) {
        const count = result.imported;
        setSuccess(`Successfully imported ${count} ${count === 1 ? 'repository' : 'repositories'}`);
        setSelectedRepos(new Set());
        
        // Invalidate queries to refresh project list
        if (workspace) {
          queryClient.invalidateQueries({
            queryKey: workspaceKeys.all(workspace.id),
          });
        }
        
        await loadRepositories();
        
        setTimeout(() => {
          router.push("/dashboard/projects");
        }, 2000);
      }
    } catch (err: any) {
      console.error('Failed to import repositories:', err);
      setError(err.message || "Failed to import repositories");
    } finally {
      setImporting(false);
    }
  };

  const toggleRepo = (repoFullName: string) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(repoFullName)) {
      newSelected.delete(repoFullName);
    } else {
      newSelected.add(repoFullName);
    }
    setSelectedRepos(newSelected);
  };

  const filteredRepos = repositories.filter(repo => 
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || connecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {connecting ? 'Connecting GitHub...' : 'Loading...'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-4" asChild>
          <Link href="/dashboard/integrations">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Integrations
          </Link>
        </Button>

        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
            <Github className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">GitHub Integration</h1>
            <p className="text-muted-foreground">
              {workspace ? `Import repositories for ${workspace.name}` : 'Import and scan GitHub repositories'}
            </p>
          </div>
        </div>
      </div>

      {workspace && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Workspace:</strong> {workspace.name} ({workspace.type})
            {workspace.type === 'team' && ' — This integration will be shared with all team members.'}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-400">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {!connected ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {workspace?.type === 'personal' 
                ? 'Connect Your GitHub Account' 
                : 'Install GitHub App'}
            </CardTitle>
            <CardDescription>
              {workspace?.type === 'personal'
                ? 'Authorize CodeSentinel to access your GitHub repositories'
                : 'Install the CodeSentinel GitHub App on your organization'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workspace?.type === 'personal' ? (
              <>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">This integration will allow CodeSentinel to:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                    <li>Read your repository code for security scanning</li>
                    <li>Access repository metadata and settings</li>
                    <li>Create issues and pull requests (optional)</li>
                  </ul>
                </div>
                
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    We only request read-only access. Your code stays secure on GitHub.
                  </AlertDescription>
                </Alert>
                
                <Button onClick={handleConnect} size="lg" className="w-full" disabled={connecting}>
                  {connecting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Github className="mr-2 h-5 w-5" />
                      Connect GitHub Account
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Installing the GitHub App will allow CodeSentinel to:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                    <li>Access repositories in your organization</li>
                    <li>Scan code for security vulnerabilities</li>
                    <li>Create issues and pull requests</li>
                    <li>Receive webhooks for automatic scanning</li>
                  </ul>
                </div>
                
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    You can choose which repositories the app has access to during installation.
                  </AlertDescription>
                </Alert>
                
                <Button onClick={handleConnect} size="lg" className="w-full" disabled={connecting}>
                  {connecting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Github className="mr-2 h-5 w-5" />
                      Install GitHub App
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Connected Account
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400">
                      <Check className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {account && (
                <div className="flex items-center gap-3 mb-6">
                  {account.avatar_url && (
                    <img 
                      src={account.avatar_url} 
                      alt={account.username}
                      className="w-12 h-12 rounded-full"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{account.name || account.username}</p>
                    <p className="text-sm text-muted-foreground">@{account.username}</p>
                  </div>
                  <div className="text-right">
                    {loadingRepos ? (
                      <div className="flex flex-col items-end">
                        <div className="h-8 w-12 bg-muted rounded animate-pulse mb-1" />
                        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    ) : (
                      <>
                        <p className="text-2xl font-bold">{account.public_repos}</p>
                        <p className="text-xs text-muted-foreground">repositories</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Separator className="my-4" />

              <div className="space-y-4">
                <h3 className="font-semibold">Integration Settings</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Access Private Repositories</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow importing private repositories
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-scan New Commits</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically scan when new code is pushed
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Import Repositories</CardTitle>
                  <CardDescription>
                    Select repositories to import into CodeSentinel
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadRepositories}
                  disabled={loadingRepos}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingRepos ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{filteredRepos.length} repositories</span>
                {selectedRepos.size > 0 && (
                  <Badge variant="secondary">{selectedRepos.size} selected</Badge>
                )}
              </div>

              {/* Premium Skeleton Loader */}
              {loadingRepos ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-4 border rounded-lg animate-pulse"
                    >
                      <div className="w-4 h-4 bg-muted rounded" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-4 bg-muted rounded w-32" />
                          <div className="h-3 bg-muted rounded w-12" />
                          <div className="h-5 bg-muted rounded w-16" />
                        </div>
                        <div className="h-3 bg-muted rounded w-48" />
                        <div className="flex items-center gap-3">
                          <div className="h-3 bg-muted rounded w-12" />
                          <div className="h-3 bg-muted rounded w-12" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredRepos.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No repositories found</p>
                    </div>
                  ) : (
                    filteredRepos.map((repo) => (
                      <label
                        key={repo.full_name}
                        className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedRepos.has(repo.full_name)
                            ? "bg-primary/5 border-primary"
                            : "hover:bg-muted/50"
                        } ${repo.already_imported ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <Checkbox
                          checked={selectedRepos.has(repo.full_name)}
                          onCheckedChange={() => toggleRepo(repo.full_name)}
                          disabled={repo.already_imported}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium truncate">{repo.name}</p>
                            {repo.private ? (
                              <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            )}
                            {repo.language && (
                              <Badge variant="secondary" className="text-xs">
                                {repo.language}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {repo.full_name}
                          </p>
                          {repo.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {repo.description}
                            </p>
                          )}
                          
                          {((repo.stars > 0) || (repo.forks > 0)) && (
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {repo.stars > 0 && (
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3" />
                                  {repo.stars}
                                </span>
                              )}
                              {repo.forks > 0 && (
                                <span className="flex items-center gap-1">
                                  <GitFork className="h-3 w-3" />
                                  {repo.forks}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {repo.already_imported && (
                          <Badge variant="secondary">Already Imported</Badge>
                        )}
                      </label>
                    ))
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleImport}
                  disabled={selectedRepos.size === 0 || importing}
                  className="flex-1"
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Import {selectedRepos.size > 0 ? `(${selectedRepos.size})` : ""}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Disconnect GitHub</CardTitle>
              <CardDescription>
                Remove GitHub integration from this workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Disconnecting will not delete your imported projects, but will stop automatic syncing.
                  {workspace?.type === 'team' && ' This will affect all team members.'}
                </AlertDescription>
              </Alert>
              
              <Button 
                variant="destructive" 
                onClick={() => setShowDisconnectModal(true)}
                disabled={disconnecting}
              >
                Disconnect GitHub
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Disconnect Confirmation Modal */}
      <Dialog open={showDisconnectModal} onOpenChange={setShowDisconnectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Disconnect GitHub Integration?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-4">
              <p>
                This will disconnect GitHub from <strong>{workspace?.name}</strong>.
              </p>
              
              {workspace?.type === 'personal' ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">What happens next:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Your imported projects will remain intact</li>
                    <li>You won't be able to import new repositories</li>
                    <li>Automatic scanning will be disabled</li>
                    <li>You can reconnect at any time</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">What happens next:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>The GitHub App will be uninstalled</li>
                    <li>All team members will lose access</li>
                    <li>Imported projects will remain intact</li>
                    <li>Automatic scanning will be disabled</li>
                    <li>A team admin can reinstall the app</li>
                  </ul>
                </div>
              )}
              
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  This action cannot be undone. You'll need to reconnect to restore access.
                </AlertDescription>
              </Alert>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisconnectModal(false)}
              disabled={disconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                'Disconnect GitHub'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}