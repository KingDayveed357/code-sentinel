"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import type {
  AiExplanationState,
  VulnerabilityExplanation,
} from "@/lib/api/vulnerabilities";

interface AIExplanationPanelProps {
  state: AiExplanationState;
  explanation: VulnerabilityExplanation | null;
  errorMessage?: string | null;
  onGenerate: () => void;
  onRetry: () => void;
}

export function AIExplanationPanel({
  state,
  explanation,
  errorMessage,
  onGenerate,
  onRetry,
}: AIExplanationPanelProps) {
  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            AI-Powered Vulnerability Brief
          </CardTitle>
          {state === "ready" && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              Ready
            </Badge>
          )}
          {(state === "queued" || state === "processing") && (
            <Badge variant="secondary">Running</Badge>
          )}
          {state === "failed" && <Badge variant="destructive">Failed</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {state === "idle" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Generate an AI title, root cause summary, and first remediation step.
            </p>
            <Button size="sm" onClick={onGenerate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate AI Explanation
            </Button>
          </div>
        )}

        {(state === "queued" || state === "processing") && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-background/70 p-3">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">AI analysis in progress</p>
              <p className="text-xs text-muted-foreground">
                This runs asynchronously and does not block the vulnerability page.
              </p>
            </div>
          </div>
        )}

        {state === "failed" && (
          <div className="space-y-3">
            <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{errorMessage || "Failed to generate AI explanation."}</span>
            </div>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry AI Generation
            </Button>
          </div>
        )}

        {state === "ready" && explanation && (
          <div className="space-y-4">
            <div className="rounded-md border bg-background/70 p-3">
              <h4 className="mb-1 text-sm font-semibold">AI Title</h4>
              <p className="text-sm leading-relaxed">{explanation.refined_title}</p>
            </div>

            <div>
              <h4 className="mb-1 text-sm font-semibold">Root Cause</h4>
              <p className="text-sm text-muted-foreground">
                {explanation.root_cause_summary}
              </p>
            </div>

            <div>
              <h4 className="mb-1 text-sm font-semibold">First Remediation Step</h4>
              <p className="text-sm text-muted-foreground">
                {explanation.remediation_step}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {explanation.provider && (
                <Badge variant="outline">{explanation.provider}</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
