// components/onboarding/onboarding-steps/import-repos-step.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  Search,
  Loader2,
  AlertCircle,
  Github,
  Lock,
  Globe,
  RefreshCw,
  Shield,
  Crown,
  Check,
  X,
  Star,
  GitFork,
  Filter,
} from "lucide-react";
import { onboardingApi } from "@/lib/api/onboarding";
import { authApi } from "@/lib/api/auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  description: string | null;
  url: string;
  default_branch: string;
  language?: string;
  stars?: number;
  forks?: number;
  already_imported?: boolean;
}

interface ImportReposStepProps {
  onNext: () => void;
  onSkip: () => void;
  onPrevious: () => void;
}

const FREE_PLAN_LIMIT = 5;

export function ImportReposStep({ onNext, onSkip }: ImportReposStepProps) {
  const { workspace } = useWorkspace();
  
  // State management
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());
  const [existingRepoCount, setExistingRepoCount] = useState(0);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [showPrivateOnly, setShowPrivateOnly] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const isPro = workspace?.plan !== "Free";
  const remainingSlots = isPro
    ? Infinity
    : Math.max(0, FREE_PLAN_LIMIT - existingRepoCount);
  const canSelectMore = selectedRepos.size < remainingSlots;

  // Initialize: Check GitHub connection and load repos
  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get onboarding status (includes GitHub connection state)
      const status = await onboardingApi.getStatus();
      const isConnected = status.state.github_connected;
      setGithubConnected(isConnected);

      if (isConnected) {
        // Fetch repositories and existing count in parallel
        const [reposResponse, dashboardData] = await Promise.all([
          onboardingApi.getRepositories(),
          fetch("/api/dashboard/overview", {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }).then((r) => r.json()).catch(() => ({ stats: { repositories_scanned: 0 } })),
        ]);

        setRepositories(reposResponse.repositories || []);
        setExistingRepoCount(dashboardData.stats?.repositories_scanned || 0);
      }
    } catch (err: any) {
      console.error("Failed to initialize:", err);
      setError(err.message || "Failed to load repositories");
      setGithubConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter repositories
  const filteredRepos = useMemo(() => {
    let filtered = repositories;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query) ||
          repo.full_name.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query)
      );
    }

    // Privacy filter
    if (showPrivateOnly) {
      filtered = filtered.filter((repo) => repo.private);
    }

    // Language filter
    if (selectedLanguage !== "all") {
      filtered = filtered.filter((repo) => repo.language === selectedLanguage);
    }

    // Exclude already imported
    filtered = filtered.filter((repo) => !repo.already_imported);

    return filtered;
  }, [repositories, searchQuery, showPrivateOnly, selectedLanguage]);

  // Get unique languages for filter
  const availableLanguages = useMemo(() => {
    const languages = new Set(
      repositories
        .filter((r) => r.language && !r.already_imported)
        .map((r) => r.language!)
    );
    return Array.from(languages).sort();
  }, [repositories]);

  // Toggle repository selection
  const toggleRepo = (repoId: number) => {
    const newSelected = new Set(selectedRepos);

    if (newSelected.has(repoId)) {
      // Always allow deselection
      newSelected.delete(repoId);
      setShowUpgradePrompt(false);
    } else {
      // Check limit before adding (STRICT enforcement)
      if (!isPro && newSelected.size >= remainingSlots) {
        // Show upgrade prompt and prevent selection
        setShowUpgradePrompt(true);
        setError(`Free plan limit: You can only import ${FREE_PLAN_LIMIT} repositories. Upgrade to Pro for unlimited imports.`);
        
        // Auto-hide error after 5 seconds
        setTimeout(() => setError(null), 5000);
        return;
      }
      newSelected.add(repoId);
      setError(null); // Clear any previous errors
    }

    setSelectedRepos(newSelected);
  };

  // Select all filtered repos (within limit)
  const handleSelectAll = () => {
    const newSelected = new Set(selectedRepos);
    const availableRepos = filteredRepos.filter((r) => !r.already_imported);
    
    let addedCount = 0;
    let hitLimit = false;

    availableRepos.forEach((repo) => {
      if (!isPro && newSelected.size >= remainingSlots) {
        hitLimit = true;
        return; // Stop at limit
      }
      if (!newSelected.has(repo.id)) {
        newSelected.add(repo.id);
        addedCount++;
      }
    });

    setSelectedRepos(newSelected);

    if (hitLimit && !isPro) {
      setShowUpgradePrompt(true);
      setError(`Free plan limit: You can only select ${FREE_PLAN_LIMIT} repositories. ${addedCount} repositories selected.`);
      
      // Auto-hide error after 5 seconds
      setTimeout(() => setError(null), 5000);
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedRepos(new Set());
    setShowUpgradePrompt(false);
  };

  // Import selected repositories
  const handleImport = async () => {
    if (selectedRepos.size === 0) return;

    // Defense in depth: Validate limit
    if (!isPro && selectedRepos.size > remainingSlots) {
      setError("Repository limit exceeded. Please upgrade to Pro.");
      return;
    }

    try {
      setIsImporting(true);
      setError(null);

      const selectedReposList = repositories.filter((r) =>
        selectedRepos.has(r.id)
      );

      await onboardingApi.importRepositories({
        repositories: selectedReposList.map((repo) => ({
          id: repo.id,
          full_name: repo.full_name,
          default_branch: repo.default_branch,
          private: repo.private,
        })),
      });

      onNext();
    } catch (err: any) {
      console.error("Failed to import repositories:", err);
      setError(err.message || "Failed to import repositories");
    } finally {
      setIsImporting(false);
    }
  };

  // Skip this step
  const handleSkip = async () => {
    try {
      setIsSkipping(true);
      setError(null);

      // Mark step as skipped (enables banner)
      await onboardingApi.skipStep("import_repos");

      onSkip();
    } catch (err: any) {
      console.error("Failed to skip step:", err);
      // Still proceed even if API call fails
      onSkip();
    } finally {
      setIsSkipping(false);
    }
  };

  // Connect GitHub
  const handleConnectGitHub = async () => {
    const { url } = await authApi.githubOAuth();
    window.location.href = url;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // GitHub not connected
  if (!githubConnected) {
    return (
      <div className="space-y-6">
        <GitHubNotConnectedState onConnect={handleConnectGitHub} />
        <div className="text-center">
          <Button variant="ghost" onClick={handleSkip} disabled={isSkipping}>
            {isSkipping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Skipping...
              </>
            ) : (
              "Skip for now →"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // No repositories found
  if (repositories.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyReposState onRetry={initializeData} />
        <div className="text-center">
          <Button variant="ghost" onClick={handleSkip} disabled={isSkipping}>
            {isSkipping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Skipping...
              </>
            ) : (
              "Continue without importing →"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Import Repositories</h2>
        <p className="text-muted-foreground">
          Select repositories to scan for security vulnerabilities
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-200">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="h-auto p-1 hover:bg-destructive/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Free Plan Warning */}
      {!isPro && existingRepoCount > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You have {existingRepoCount}{" "}
            {existingRepoCount === 1 ? "repository" : "repositories"} imported.
            Free plan allows up to {FREE_PLAN_LIMIT} repositories per workspace.
            You can import {remainingSlots} more.
          </AlertDescription>
        </Alert>
      )}

      {/* Free Plan Limit Reached */}
      {!isPro && remainingSlots === 0 && (
        <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
          <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">
            Repository Limit Reached
          </AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            You've reached the free plan limit ({FREE_PLAN_LIMIT} repositories).
            <Button
              variant="link"
              className="h-auto p-0 ml-1 text-amber-900 dark:text-amber-100 underline"
              onClick={() => (window.location.href = "/dashboard/settings/billing")}
            >
              Upgrade to Pro
            </Button>{" "}
            for unlimited imports.
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="space-y-4">
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

        {/* Advanced Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Privacy Filter */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="private-only"
              checked={showPrivateOnly}
              onCheckedChange={(checked) => setShowPrivateOnly(!!checked)}
            />
            <Label htmlFor="private-only" className="text-sm cursor-pointer">
              Private only
            </Label>
          </div>

          {/* Language Filter */}
          {availableLanguages.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="text-sm border rounded-md px-2 py-1 bg-background"
              >
                <option value="all">All languages</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Stats */}
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {filteredRepos.length}{" "}
              {filteredRepos.length === 1 ? "repository" : "repositories"}
            </span>
            {selectedRepos.size > 0 && (
              <Badge variant="secondary">{selectedRepos.size} selected</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Repository List */}
      <div className="border rounded-lg divide-y max-h-[420px] overflow-y-auto">
        {filteredRepos.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No repositories match your filters</p>
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const isSelected = selectedRepos.has(repo.id);
            const isDisabled =
              !isSelected && !isPro && selectedRepos.size >= remainingSlots;

            return (
              <label
                key={repo.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors",
                  isSelected && "bg-blue-50 dark:bg-blue-950/30",
                  isDisabled && "opacity-50 cursor-not-allowed",
                  !isSelected && !isDisabled && "hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleRepo(repo.id)}
                  disabled={isDisabled}
                  className="mt-1"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium truncate">{repo.name}</span>
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

                  <p className="text-sm text-muted-foreground mb-1">
                    {repo.full_name}
                  </p>

                  {repo.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {repo.description}
                    </p>
                  )}

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

                {isDisabled && (
                  <Badge variant="outline" className="text-xs">
                    Limit reached
                  </Badge>
                )}
              </label>
            );
          })
        )}
      </div>

      {/* Upgrade Prompt */}
      {showUpgradePrompt && !isPro && (
        <Alert className="border-violet-200 dark:border-violet-900 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
          <Crown className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <AlertTitle className="text-violet-900 dark:text-violet-100">
            Upgrade to import more repositories
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="text-sm text-violet-800 dark:text-violet-200">
              You've reached the free plan limit. Upgrade to Pro for unlimited
              repository imports and advanced features.
            </p>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() =>
                  (window.location.href = "/dashboard/settings/billing")
                }
              >
                View Plans
              </Button>
              <span className="text-sm text-violet-700 dark:text-violet-300">
                Starting at $29/month
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <Button
          variant="ghost"
          onClick={handleSkip}
          disabled={isSkipping || isImporting}
        >
          {isSkipping ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Skipping...
            </>
          ) : (
            "Skip for now →"
          )}
        </Button>

        <div className="flex items-center gap-3">
          {selectedRepos.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
                disabled={isImporting}
              >
                Clear
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={isImporting || (!isPro && remainingSlots === 0)}
              >
                Select All
              </Button>
            </>
          )}

          <Button
            onClick={handleImport}
            disabled={selectedRepos.size === 0 || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Import {selectedRepos.size > 0 && `(${selectedRepos.size})`}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Empty States
function GitHubNotConnectedState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-12">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800">
        <Github className="h-8 w-8 text-slate-600 dark:text-slate-400" />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-semibold">Connect GitHub</h3>
        <p className="text-muted-foreground">
          Connect your GitHub account to import and scan repositories
        </p>
      </div>

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          We only request read-only access to your repositories. Your code stays
          secure on GitHub.
        </AlertDescription>
      </Alert>

      <Button onClick={onConnect} size="lg" className="w-full">
        <Github className="mr-2 h-5 w-5" />
        Connect GitHub Account
      </Button>

      <p className="text-xs text-muted-foreground">
        By connecting, you agree to our Terms of Service
      </p>
    </div>
  );
}

function EmptyReposState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center space-y-4 py-12">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800">
        <Github className="h-6 w-6 text-slate-400" />
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">No repositories found</h3>
        <p className="text-sm text-muted-foreground">
          We couldn't find any repositories in your GitHub account
        </p>
      </div>

      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
        <Button variant="ghost" asChild>
          <a href="https://github.com/new" target="_blank" rel="noopener">
            Create Repository
          </a>
        </Button>
      </div>
    </div>
  );
}