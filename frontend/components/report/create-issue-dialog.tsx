// components/report/create-issue-dialog.tsx - Bulk Issue Creation Dialog
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Github, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VulnerabilityData } from "./vulnerability-card";

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vulnerabilities: VulnerabilityData[];
  projectId: string;
  scanId: string;
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  vulnerabilities,
  projectId,
  scanId,
}: CreateIssueDialogProps) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [selectedVulns, setSelectedVulns] = useState<Set<string>>(new Set());

  // Filter out vulnerabilities that already have issues
  const availableVulns = vulnerabilities.filter((v) => !v.github_issue_url);

  const toggleVuln = (id: string) => {
    const newSet = new Set(selectedVulns);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedVulns(newSet);
  };

  const handleCreateIssues = async () => {
    try {
      setCreating(true);

      const promises = Array.from(selectedVulns).map(async (vulnId) => {
        const vuln = availableVulns.find((v) => v.id === vulnId);
        if (!vuln) return null;

        const response = await fetch(
          `/api/vulnerabilities/${vuln.source}/${vulnId}/create-issue`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        return response.json();
      });

      const results = await Promise.all(promises);
      const successful = results.filter((r) => r?.success).length;

      toast({
        title: "Issues Created",
        description: `Successfully created ${successful} GitHub issue(s)`,
      });

      onOpenChange(false);
      setSelectedVulns(new Set());

      // Refresh page to show updated issues
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Failed to Create Issues",
        description: err.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Create GitHub Issues
          </DialogTitle>
          <DialogDescription>
            Select vulnerabilities to create GitHub issues. Issues will be created automatically
            with detailed information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4">
          {availableVulns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">All vulnerabilities already have GitHub issues</p>
            </div>
          ) : (
            availableVulns.map((vuln) => (
              <div
                key={vuln.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleVuln(vuln.id)}
              >
                <Checkbox
                  checked={selectedVulns.has(vuln.id)}
                  onCheckedChange={() => toggleVuln(vuln.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant={
                        vuln.severity === "critical" || vuln.severity === "high"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {vuln.severity}
                    </Badge>
                    <Badge variant="outline" className="uppercase text-xs">
                      {vuln.source}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{vuln.title}</p>
                  <p className="text-xs text-muted-foreground">{vuln.file}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateIssues}
            disabled={creating || selectedVulns.size === 0}
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating {selectedVulns.size} Issue(s)...
              </>
            ) : (
              <>
                <Github className="mr-2 h-4 w-4" />
                Create {selectedVulns.size} Issue(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}