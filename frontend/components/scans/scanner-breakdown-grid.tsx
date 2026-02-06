"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, Shield, Package, Key, Cloud } from "lucide-react";

interface ScannerBreakdown {
  sast: { findings: number; status: string; duration_seconds: number | null };
  sca: { findings: number; status: string; duration_seconds: number | null };
  secrets: { findings: number; status: string; duration_seconds: number | null };
  iac: { findings: number; status: string; duration_seconds: number | null };
  container?: { findings: number; status: string; duration_seconds: number | null };
}

interface ScannerBreakdownGridProps {
  breakdown: ScannerBreakdown;
}

export function ScannerBreakdownGrid({ breakdown }: ScannerBreakdownGridProps) {
  const scanners = [
    {
      key: "sast",
      name: "Static Analysis",
      icon: Shield,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-400",
      progressColor: "bg-blue-500",
      data: breakdown.sast,
    },
    {
      key: "sca",
      name: "Dependency Scan",
      icon: Package,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-400",
      progressColor: "bg-purple-500",
      data: breakdown.sca,
    },
    {
      key: "secrets",
      name: "Secrets Detection",
      icon: Key,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-400",
      progressColor: "bg-red-500",
      data: breakdown.secrets,
    },
    {
      key: "iac",
      name: "IaC Security",
      icon: Cloud,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
      progressColor: "bg-emerald-500",
      data: breakdown.iac,
    },
  ];

  const getStatusIcon = (status: string) => {
    if (status === "completed") {
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    }
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {scanners.map((scanner) => {
        const Icon = scanner.icon;
        const isCompleted = scanner.data.status === "completed";
        const progress = isCompleted ? 100 : 50;

        return (
          <Card key={scanner.key} className="border-slate-700 bg-slate-900/50 backdrop-blur-sm hover:border-slate-600 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${scanner.iconBg} border border-slate-700`}>
                    <Icon className={`h-5 w-5 ${scanner.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-100">{scanner.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {scanner.data.findings} {scanner.data.findings === 1 ? "finding" : "findings"}
                    </p>
                  </div>
                </div>
                {getStatusIcon(scanner.data.status)}
              </div>

              {/* Progress bar */}
              <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${scanner.progressColor} transition-all duration-500 ease-out`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
