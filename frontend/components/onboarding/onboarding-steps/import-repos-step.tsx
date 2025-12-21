// components/onboarding/onboarding-steps/import-repos-step.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Search, Loader2, AlertCircle, Github, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { onboardingApi } from "@/lib/api/onboarding";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  description: string | null;
  url: string;
  default_branch: string;
}

interface ImportReposStepProps {
  onNext: () => void;
  onSkip: () => void;
  onPrevious: () => void;
}

export function ImportReposStep({ onNext, onSkip, onPrevious }: ImportReposStepProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch repositories on mount
  useEffect(() => {
    fetchRepositories();
  }, []);

  // Filter repositories based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredRepos(repositories);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredRepos(
        repositories.filter(
          (repo) =>
            repo.name.toLowerCase().includes(query) ||
            repo.full_name.toLowerCase().includes(query) ||
            repo.description?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, repositories]);

  const fetchRepositories = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = (await onboardingApi.getRepositories()) as { repositories: Repository[] };
      setRepositories(result.repositories);
      setFilteredRepos(result.repositories);
    } catch (err) {
      console.error("Failed to fetch repositories:", err);
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRepo = (repoId: number) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedRepos.size === filteredRepos.length) {
      setSelectedRepos(new Set());
    } else {
      setSelectedRepos(new Set(filteredRepos.map((r) => r.id)));
    }
  };

  const handleImport = async () => {
    if (selectedRepos.size === 0) {
      alert("Please select at least one repository");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Get selected repositories
      const reposToSave = repositories
        .filter((repo) => selectedRepos.has(repo.id))
        .map((repo) => ({
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner,
          private: repo.private,
          url: repo.url,
          default_branch: repo.default_branch,
        }));

      // Import repositories
      await onboardingApi.saveRepositories(reposToSave);
      
      // NOTE: No need to mark step as "completed" explicitly
      // The existence of repositories will automatically hide the banner
      // when the dashboard checks onboarding state
      
      // Proceed to next step (complete onboarding)
      onNext();
    } catch (err) {
      console.error("Failed to import repositories:", err);
      setError(err instanceof Error ? err.message : "Failed to import repositories");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Mark this step as skipped in the backend
      // This triggers the banner to show on dashboard
      await onboardingApi.skipStep("import_repos");
      
      // Continue with onboarding completion
      onSkip();
    } catch (err) {
      console.error("Failed to mark step as skipped:", err);
      // Still allow skip even if API fails
      // The dashboard will handle the fallback (0 repos = show banner)
      onSkip();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Import Git Repositories</h2>
        <p className="text-muted-foreground">
          Select repositories to scan for security vulnerabilities (you can add more later)
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 rounded-lg"
          disabled={isLoading || isSaving}
        />
      </div>

      {/* Repository List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Loading repositories from GitHub...</p>
          </div>
        </div>
      ) : repositories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Github className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No repositories found</p>
          <Button onClick={fetchRepositories} variant="outline" size="sm">
            Retry
          </Button>
        </div>
      ) : (
        <>
          {/* Select All */}
          <div className="flex items-center justify-between py-2 px-4 bg-secondary/30 rounded-lg">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedRepos.size === filteredRepos.length && filteredRepos.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm font-medium">
                Select All ({selectedRepos.size} of {filteredRepos.length} selected)
              </span>
            </div>
          </div>

          {/* Repositories */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto border border-border rounded-lg">
            {filteredRepos.map((repo) => (
              <div
                key={repo.id}
                onClick={() => handleToggleRepo(repo.id)}
                className={`flex items-start gap-4 p-4 hover:bg-secondary/30 cursor-pointer transition-colors ${
                  selectedRepos.has(repo.id) ? "bg-primary/5 border-l-2 border-l-primary" : ""
                }`}
              >
                <Checkbox checked={selectedRepos.has(repo.id)} className="mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{repo.full_name}</p>
                    {repo.private && (
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Private
                      </Badge>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{repo.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button
          onClick={onPrevious}
          variant="outline"
          size="lg"
          className="rounded-lg bg-transparent"
          disabled={isLoading || isSaving}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleSkip}
          variant="outline"
          size="lg"
          className="rounded-lg"
          disabled={isLoading || isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Skipping...
            </>
          ) : (
            "Skip for Now"
          )}
        </Button>
        <Button
          onClick={handleImport}
          size="lg"
          className="rounded-lg flex-1"
          disabled={isLoading || isSaving || selectedRepos.size === 0}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              Import & Scan ({selectedRepos.size})
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}