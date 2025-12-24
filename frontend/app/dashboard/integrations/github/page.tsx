// app/dashboard/integrations/github/page.tsx
"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { repositoriesApi } from "@/lib/api/repositories";
import { integrationsApi } from "@/lib/api/integrations";
import { useWorkspace } from "@/hooks/use-workspace";
import type { GitHubRepository, GitHubAccount } from "@/lib/api/repositories";

/**
 * GitHub Integration Page
 * 
 * Flow:
 * 1. User clicks "Connect GitHub Account" → redirects to OAuth
 * 2. OAuth completes → redirects back with token in URL
 * 3. handleOAuthCallback extracts token and calls connectGitHub API
 * 4. Integration is persisted to workspace
 * 5. Page loads repositories
 */
export default function GitHubIntegrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace } = useWorkspace();
  
  // Connection state
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  
  // Repository state
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    handleOAuthCallback();
  }, [searchParams]);

  /**
   * Handle OAuth callback or normal page load
   * 
   * This runs on mount and checks:
   * 1. Are we returning from OAuth? (token in URL)
   * 2. If yes → connect integration via API
   * 3. If no → load existing integration status
   */
  const handleOAuthCallback = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check for OAuth token in URL (supports both 'token' and 'access_token' params)
      const providerToken = searchParams.get('token') || searchParams.get('access_token');
      
      if (providerToken) {
        // ✅ User just completed OAuth - connect the integration
        await connectGitHubIntegration(providerToken);
        
        // Clean up URL (remove sensitive token)
        window.history.replaceState({}, '', '/dashboard/integrations/github');
      } else {
        // ✅ Normal page load - check existing connection
        await loadGitHubStatus();
      }
    } catch (err: any) {
      console.error('OAuth callback error:', err);
      setError(err.message || 'Failed to complete GitHub connection');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connect GitHub integration after OAuth
   * 
   * ✅ NEW: Uses proper API endpoint instead of manual database manipulation
   * 
   * This calls POST /api/integrations/github/connect which:
   * - Validates token with GitHub
   * - Persists integration to workspace
   * - Updates onboarding state
   * 
   * @param providerToken - GitHub access token from OAuth
   */
  const connectGitHubIntegration = async (providerToken: string) => {
    try {
      setConnecting(true);
      setError(null);
      
      // ✅ Call the proper API endpoint
      const result = await integrationsApi.connectGitHub(providerToken);
      
      if (result.success) {
        setSuccess('GitHub connected successfully!');
        
        // Load the connection status and repositories
        await loadGitHubStatus();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Failed to connect GitHub:', err);
      
      // Provide user-friendly error messages
      if (err.message?.includes('Invalid or expired')) {
        setError('GitHub token expired. Please try connecting again.');
      } else if (err.message?.includes('already exists')) {
        setError('GitHub is already connected. Refreshing...');
        await loadGitHubStatus();
      } else {
        setError(err.message || 'Failed to connect GitHub integration');
      }
    } finally {
      setConnecting(false);
    }
  };

  /**
   * Load GitHub connection status and account info
   * 
   * This fetches:
   * - Integration connection status
   * - GitHub account details
   * - Repository list (if connected)
   */
  const loadGitHubStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await repositoriesApi.getProviders();
      const github = data.providers.find(p => p.id === "github");
      
      if (github?.connected) {
        setConnected(true);
        setAccount(github.account || null);
        
        // Load repositories in background (don't block UI)
        loadRepositories().catch(err => {
          console.error('Failed to load repositories:', err);
          // Don't set error - connection is still valid
        });
      } else {
        setConnected(false);
        setAccount(null);
        setRepositories([]);
      }
    } catch (err: any) {
      console.error('Failed to load GitHub status:', err);
      setError(err.message || "Failed to load GitHub status");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load GitHub repositories
   * 
   * Fetches user's repositories from GitHub API via backend
   */
  const loadRepositories = async () => {
    try {
      const data = await repositoriesApi.getGitHubRepos();
      setRepositories(data.repositories || []);
    } catch (err: any) {
      console.error('Failed to load repositories:', err);
      
      // Handle specific error cases
      if (err.message?.includes('not connected')) {
        // Integration not found - user needs to connect
        setConnected(false);
        setAccount(null);
      } else if (err.message?.includes('expired')) {
        // Token expired - show reconnect prompt
        setError('GitHub token expired. Please reconnect your account.');
        setConnected(false);
      } else {
        setError(err.message || "Failed to load GitHub repositories");
      }
      
      throw err; // Re-throw for caller to handle
    }
  };

  /**
   * Initiate GitHub OAuth flow
   * 
   * Redirects user to backend OAuth endpoint which:
   * 1. Redirects to GitHub authorization
   * 2. GitHub redirects back to backend callback
   * 3. Backend redirects back to this page with token
   */
  const handleConnect = () => {
   if (!workspace) return;

   const params = new URLSearchParams({
    workspace_id: workspace.id,
    return_to: "/dashboard/integrations/github",
   });
    // Redirect to GitHub OAuth
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/github?${params.toString()}`;
  };

  /**
   * Disconnect GitHub integration
   * 
   * Removes integration from workspace but preserves imported projects
   */
  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect GitHub? This will not delete your imported projects.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await integrationsApi.disconnectIntegration('github');
      
      if (result.success) {
        setSuccess('GitHub disconnected successfully');
        setConnected(false);
        setAccount(null);
        setRepositories([]);
        setSelectedRepos(new Set());
        
        // If requires sign out (e.g., last auth method), redirect
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
      setLoading(false);
    }
  };

  /**
   * Import selected repositories
   * 
   * Creates projects from selected GitHub repositories
   */
  const handleImport = async () => {
    if (selectedRepos.size === 0) return;
    
    try {
      setImporting(true);
      setError(null);
      
      // Map selected repos to import format
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
        
        // Reload repositories to update "already_imported" status
        await loadRepositories();
        
        // Navigate to projects after short delay
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

  /**
   * Toggle repository selection
   */
  const toggleRepo = (repoFullName: string) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(repoFullName)) {
      newSelected.delete(repoFullName);
    } else {
      newSelected.add(repoFullName);
    }
    setSelectedRepos(newSelected);
  };

  /**
   * Filter repositories by search query
   */
  const filteredRepos = repositories.filter(repo => 
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Loading state
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

      {/* Workspace Context Banner */}
      {workspace && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Workspace:</strong> {workspace.name} ({workspace.type})
            {workspace.type === 'team' && ' — This integration will be shared with all team members.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {success && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-400">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Connection Status */}
      {!connected ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect Your GitHub Account</CardTitle>
            <CardDescription>
              Authorize CodeSentinel to access your GitHub repositories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
            
            <Button onClick={handleConnect} size="lg" className="w-full">
              <Github className="mr-2 h-5 w-5" />
              Connect GitHub Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Connected Account */}
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
                    <p className="text-2xl font-bold">{account.public_repos}</p>
                    <p className="text-xs text-muted-foreground">repositories</p>
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

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Create GitHub Issues</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically create issues for vulnerabilities
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Import Repositories */}
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
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{filteredRepos.length} repositories</span>
                {selectedRepos.size > 0 && (
                  <Badge variant="secondary">{selectedRepos.size} selected</Badge>
                )}
              </div>

              {/* Repository List */}
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
                        
                        {/* Stars and Forks */}
                        {((repo.stars !== undefined && repo.stars > 0) || 
                          (repo.forks !== undefined && repo.forks > 0)) && (
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            {repo.stars !== undefined && repo.stars > 0 && (
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3" />
                                {repo.stars}
                              </span>
                            )}
                            {repo.forks !== undefined && repo.forks > 0 && (
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

              {/* Import Button */}
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
                Remove GitHub integration and stop syncing repositories
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Disconnecting will not delete your imported projects, but will stop automatic syncing and webhooks.
                  {workspace?.type === 'team' && ' This will affect all team members.'}
                </AlertDescription>
              </Alert>
              
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect GitHub'
                )}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}