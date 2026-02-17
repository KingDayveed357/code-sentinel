// components/scans/run-scan-modal.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Zap, Shield, Loader2, Crown, Info } from "lucide-react";
import { scansApi } from "@/lib/api/scans";
import { toast } from "sonner";

interface RunScanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryId: string;
  repositoryName: string;
  defaultBranch: string;
  workspaceId: string;
  userPlan?: "free" | "dev" | "team" | "enterprise";
  onScanStarted?: () => void;
}

export function RunScanModal({
  open,
  onOpenChange,
  repositoryId,
  repositoryName,
  defaultBranch,
  workspaceId,
  userPlan = "free",
  onScanStarted,
}: RunScanModalProps) {
  const [selectedType, setSelectedType] = useState<"quick" | "full">("quick");
  const [isStarting, setIsStarting] = useState(false);

  const handleStartScan = async () => {
    setIsStarting(true);
    try {
      await scansApi.start(workspaceId, repositoryId, {
        branch: defaultBranch,
        scan_type: selectedType,
      });

      toast.success(
        <div>
          <strong>Scan started successfully</strong>
          <p className="text-sm mt-1">
            {selectedType === "quick" ? "Quick scan" : "Full scan"} is now running on {repositoryName}
          </p>
        </div>
      );

      onOpenChange(false);
      onScanStarted?.();
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to start scan</strong>
          <p className="text-sm mt-1">{error.message || "An error occurred"}</p>
        </div>
      );
    } finally {
      setIsStarting(false);
    }
  };

  const isPremiumPlan = userPlan === "dev" || userPlan === "team" || userPlan === "enterprise";
  const canUseFullScan = isPremiumPlan;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Run Security Scan</DialogTitle>
          <DialogDescription>
            Choose the type of scan to run on <strong>{repositoryName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick Scan Option */}
          <button
            onClick={() => setSelectedType("quick")}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
              selectedType === "quick"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Zap className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Quick Scan</h3>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    Free
                  </Badge>
                </div>
              </div>
              {selectedType === "quick" && (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white" />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Fast security scan focusing on critical vulnerabilities and common issues.
              Perfect for quick checks and CI/CD integration.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                SAST
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                Secrets
              </Badge>
              <Badge variant="outline" className="text-xs">
                ~2-5 min
              </Badge>
            </div>
          </button>

          {/* Full Scan Option */}
          <button
            onClick={() => canUseFullScan && setSelectedType("full")}
            disabled={!canUseFullScan}
            className={`w-full text-left p-4 rounded-lg border-2 transition-all relative ${
              !canUseFullScan
                ? "opacity-60 cursor-not-allowed border-border"
                : selectedType === "full"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
            }`}
          >
            {!canUseFullScan && (
              <div className="absolute top-3 right-3">
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  <Crown className="h-3 w-3 mr-1" />
                  Premium
                </Badge>
              </div>
            )}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/10 to-pink-500/10">
                  <Shield className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Full Scan</h3>
                  <Badge variant="secondary" className="mt-1 text-xs bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700 dark:text-purple-300">
                    Dev, Team & Enterprise
                  </Badge>
                </div>
              </div>
              {selectedType === "full" && canUseFullScan && (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white" />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Comprehensive security analysis with all scanners, dependency checks, and
              infrastructure scanning. Maximum coverage for production deployments.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                SAST
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                SCA
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                Secrets
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Shield className="h-3 w-3 mr-1" />
                IaC
              </Badge>
              <Badge variant="outline" className="text-xs">
                ~5-15 min
              </Badge>
            </div>
          </button>

          {/* Upgrade Notice */}
          {!canUseFullScan && selectedType === "full" && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Full scans are available on Dev, Team, and Enterprise plans.{" "}
                <a href="/dashboard/settings/billing" className="font-medium underline">
                  Upgrade now
                </a>{" "}
                to unlock comprehensive security scanning.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isStarting}>
            Cancel
          </Button>
          <Button onClick={handleStartScan} disabled={isStarting || (!canUseFullScan && selectedType === "full")}>
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Start {selectedType === "quick" ? "Quick" : "Full"} Scan
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
