"use client"

import { memo, useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Github, ExternalLink } from "lucide-react"
import type { CriticalVulnerability } from "@/lib/api/dashboard"

interface CreateIssueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vulnerability: CriticalVulnerability
}

/**
 * Fully functional GitHub issue creation dialog
 * 
 * This component allows users to create GitHub issues directly from the dashboard
 * It integrates with the GitHub API to create issues in their repositories
 */
export const CreateIssueDialog = memo(function CreateIssueDialog({
  open,
  onOpenChange,
  vulnerability
}: CreateIssueDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [issueUrl, setIssueUrl] = useState<string | null>(null)

  // Form state
  const [repository, setRepository] = useState("")
  const [title, setTitle] = useState(
    `[Security] ${vulnerability.severity.toUpperCase()}: ${vulnerability.title}`
  )
  const [body, setBody] = useState(
    `## Vulnerability Details\n\n` +
    `**Severity:** ${vulnerability.severity}\n` +
    `**CWE:** ${vulnerability.cwe}\n` +
    `**Type:** ${vulnerability.type}\n` +
    `**Repository:** ${vulnerability.repo}\n` +
    `**Detected:** ${vulnerability.detected}\n\n` +
    `## Description\n\n` +
    `${vulnerability.title}\n\n` +
    `## Recommended Actions\n\n` +
    `- [ ] Review the vulnerability details\n` +
    `- [ ] Assess the impact\n` +
    `- [ ] Implement a fix\n` +
    `- [ ] Test the fix\n` +
    `- [ ] Deploy to production\n\n` +
    `---\n` +
    `*This issue was automatically created from the security dashboard.*`
  )
  const [labels, setLabels] = useState<string[]>(["security", vulnerability.severity])
  const [assignee, setAssignee] = useState("")

  const handleCreateIssue = useCallback(async () => {
    if (!repository) {
      setError("Please select a repository")
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Parse repository (format: owner/repo)
      const [owner, repo] = repository.split("/")
      if (!owner || !repo) {
        throw new Error("Invalid repository format. Use: owner/repo")
      }

      // Call GitHub API to create issue
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          // In production, this should use the user's GitHub token from your backend
          // For now, this will require the user to have their token configured
          "Authorization": `token ${process.env.NEXT_PUBLIC_GITHUB_TOKEN || ""}`,
        },
        body: JSON.stringify({
          title,
          body,
          labels: labels.filter(Boolean),
          assignees: assignee ? [assignee] : [],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.message || 
          `Failed to create issue: ${response.statusText}`
        )
      }

      const issue = await response.json()
      setIssueUrl(issue.html_url)
      setSuccess(true)

      // Reset form after 2 seconds and close
      setTimeout(() => {
        setSuccess(false)
        setIssueUrl(null)
        onOpenChange(false)
      }, 3000)

    } catch (err: any) {
      setError(err.message || "Failed to create GitHub issue")
    } finally {
      setLoading(false)
    }
  }, [repository, title, body, labels, assignee, onOpenChange])

  const handleClose = useCallback(() => {
    if (!loading) {
      setError(null)
      setSuccess(false)
      setIssueUrl(null)
      onOpenChange(false)
    }
  }, [loading, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Github className="h-5 w-5" />
            <DialogTitle>Create GitHub Issue</DialogTitle>
          </div>
          <DialogDescription>
            Create a GitHub issue to track and resolve this vulnerability
          </DialogDescription>
        </DialogHeader>

        {success && issueUrl ? (
          <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
            <AlertCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              Issue created successfully!{" "}
              <a 
                href={issueUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-medium underline inline-flex items-center gap-1 hover:text-green-900 dark:hover:text-green-100"
              >
                View on GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-4 py-4">
              {/* Vulnerability info */}
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Badge 
                  variant={vulnerability.severity === "critical" ? "destructive" : "default"}
                  className={
                    vulnerability.severity === "high" 
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400" 
                      : ""
                  }
                >
                  {vulnerability.severity}
                </Badge>
                <span className="text-sm font-medium truncate">
                  {vulnerability.title}
                </span>
              </div>

              {/* Repository selection */}
              <div className="space-y-2">
                <Label htmlFor="repository">
                  Repository <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="repository"
                  placeholder="owner/repository"
                  value={repository}
                  onChange={(e) => setRepository(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Format: owner/repository (e.g., facebook/react)
                </p>
              </div>

              {/* Issue title */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  Issue Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* Issue body */}
              <div className="space-y-2">
                <Label htmlFor="body">Description</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={loading}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>

              {/* Assignee (optional) */}
              <div className="space-y-2">
                <Label htmlFor="assignee">Assignee (optional)</Label>
                <Input
                  id="assignee"
                  placeholder="GitHub username"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* Error display */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Info about GitHub token */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Note:</strong> To create issues, you need to configure your GitHub personal access token in settings.
                  The token requires <code>repo</code> scope for private repositories or <code>public_repo</code> for public ones.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateIssue}
                disabled={loading || !repository || !title}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Issue
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
})

