"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface VerifiedFindingsBannerProps {
  findingsCount: number;
  scanId: string;
  workspaceId: string;
}

export function VerifiedFindingsBanner({
  findingsCount,
  scanId,
  workspaceId,
}: VerifiedFindingsBannerProps) {
  const router = useRouter();

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 to-teal-950/20 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Shield className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-100 mb-1">
                CodeSentinel Verified Findings™
              </h3>
              <p className="text-sm text-slate-400 mb-2">
                {findingsCount} {findingsCount === 1 ? 'finding' : 'findings'} • Deduplicated, confidence-scored, and context-aware
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  AI-powered analysis
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                  Cross-scan tracking
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400"></span>
                  Exploitability scored
                </span>
              </div>
            </div>
          </div>
          <Button
            onClick={() => router.push(`/dashboard/vulnerabilities?scan=${scanId}`)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            View Full Report
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
