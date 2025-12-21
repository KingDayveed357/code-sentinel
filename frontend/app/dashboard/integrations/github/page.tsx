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
  ArrowLeft,
  Search,
  Loader2,
  AlertCircle,
  Lock,
  Globe,
  RefreshCw,
  Check,
  Info,
  ChevronLeft,
  ExternalLink,
  Download,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { repositoriesApi } from "@/lib/api/repositories";
import type { GitHubRepository, GitHubAccount } from "@/lib/api/repositories";

export default function GitHubIntegrationPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadGitHubStatus();
  }, []);

  const loadGitHubStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await repositoriesApi.getProviders();
      const github = data.providers.find(p => p.id === "github");
      
      if (github?.connected) {
        setConnected(true);
        setAccount(github.account || null);
        await loadRepositories();
      }
    } catch (err: any) {
      setError(err.message || "Failed to load GitHub status");
    } finally {
      setLoading(false);
    }
  };

  const loadRepositories = async () => {
    try {
      const data = await repositoriesApi.getGitHubRepos();
      setRepositories(data.repositories);
    } catch (err: any) {
      setError(err.message || "Failed to load GitHub repositories");
    }
  };

  const handleConnect = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/github`;
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
        setSuccess(`Successfully imported ${result.imported} ${result.imported === 1 ? 'repository' : 'repositories'}`);
        setSelectedRepos(new Set());
        setTimeout(() => router.push("/dashboard/projects"), 2000);
      }
    } catch (err: any) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            <p className="text-muted-foreground">Import and scan GitHub repositories</p>
          </div>
        </div>
      </div>

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
            <Button onClick={handleConnect} size="lg">
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
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
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
                      } ${repo.already_imported ? "opacity-50" : ""}`}
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
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span>⭐ {repo.stars}</span>
                        <span>🔀 {repo.forks}</span>
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
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Disconnecting will not delete your imported projects, but will stop automatic syncing and webhooks.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}