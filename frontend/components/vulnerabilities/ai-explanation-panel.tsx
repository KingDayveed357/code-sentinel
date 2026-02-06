"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertCircle } from "lucide-react";

interface AIExplanation {
  summary: string;
  why_it_matters?: string;
  annotated_code?: string;
  generated_at: string;
  model_version: string;
}

interface AIExplanationPanelProps {
  explanation: AIExplanation | null;
  vulnerableCode?: string;
}

export function AIExplanationPanel({ explanation, vulnerableCode }: AIExplanationPanelProps) {
  if (!explanation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Explanation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No AI explanation available yet. Click "Explain with AI" to generate one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Explanation
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Cached
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm leading-relaxed">{explanation.summary}</p>
          </div>
        </div>

        {/* Why It Matters */}
        {explanation.why_it_matters && (
          <div>
            <h4 className="font-semibold text-sm mb-2">
              Why It Matters in Your Codebase
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {explanation.why_it_matters}
            </p>
          </div>
        )}

        {/* Annotated Code */}
        {(explanation.annotated_code || vulnerableCode) && (
          <div>
            <h4 className="font-semibold text-sm mb-2">
              Annotated Vulnerable Code
            </h4>
            <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono">
              {explanation.annotated_code || vulnerableCode}
            </pre>
            {explanation.annotated_code && (
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-yellow-500">→</span> AI-generated inline comments explain the vulnerability
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Generated {new Date(explanation.generated_at).toLocaleDateString()} •{" "}
          Model: {explanation.model_version}
        </div>
      </CardContent>
    </Card>
  );
}
