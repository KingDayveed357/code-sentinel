"use client";

/**
 * ✅ TOP VULNERABILITIES LIST - "What Should I Fix First?"
 * 
 * Displays prioritized vulnerabilities from a scan with:
 * - Instance counts (e.g., "5 instances")
 * - Example locations (2-3 max, deterministic)
 * - Matches global vulnerabilities list format for consistency
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, FileCode } from "lucide-react";

interface VulnerabilityInstance {
  id: string;
  file_path: string | null;
  line_start: number | null;
  package_name: string | null;
  package_version: string | null;
}

interface Vulnerability {
  id: string;
  title: string;
  description?: string;
  severity: string;
  file_path: string | null;
  line_start: number | null;
  cwe: string | null;
  confidence: number | null;
  status: string;
  scanner_type: string;
  instance_count?: number;
  instances?: VulnerabilityInstance[];
}

interface TopVulnerabilitiesListProps {
  vulnerabilities: Vulnerability[];
}

export function TopVulnerabilitiesList({ vulnerabilities }: TopVulnerabilitiesListProps) {
  const router = useRouter();

  const getSeverityConfig = (severity: string) => {
    const configs: Record<string, { bg: string; text: string; border: string; icon: string }> = {
      critical: {
        bg: "bg-red-500/10",
        text: "text-red-400",
        border: "border-red-500/30",
        icon: "bg-red-500",
      },
      high: {
        bg: "bg-orange-500/10",
        text: "text-orange-400",
        border: "border-orange-500/30",
        icon: "bg-orange-500",
      },
      medium: {
        bg: "bg-yellow-500/10",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
        icon: "bg-yellow-500",
      },
      low: {
        bg: "bg-blue-500/10",
        text: "text-blue-400",
        border: "border-blue-500/30",
        icon: "bg-blue-500",
      },
    };

    return configs[severity.toLowerCase()] || configs.low;
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
      open: { variant: "destructive", className: "bg-red-600 hover:bg-red-700" },
      acknowledged: { variant: "secondary", className: "bg-yellow-600 hover:bg-yellow-700" },
      fixed: { variant: "default", className: "bg-emerald-600 hover:bg-emerald-700" },
      false_positive: { variant: "outline", className: "" },
    };

    const config = configs[status] || { variant: "outline" as const, className: "" };

    return (
      <Badge variant={config.variant} className={`${config.className} text-white text-xs`}>
        {status.replace("_", " ").charAt(0).toUpperCase() + status.replace("_", " ").slice(1)}
      </Badge>
    );
  };

  const getScannerTypeLabel = (scannerType: string) => {
    const labels: Record<string, string> = {
      sast: "SAST",
      sca: "SCA",
      secrets: "Secrets",
      iac: "IaC",
      container: "Container",
    };
    return labels[scannerType] || scannerType.toUpperCase();
  };

  return (
    <div className="space-y-3">
      {vulnerabilities.map((vuln) => {
        const severityConfig = getSeverityConfig(vuln.severity);
        
        return (
          <Card
            key={vuln.id}
            className={`border-slate-700 bg-slate-900/50 backdrop-blur-sm hover:border-slate-600 transition-all cursor-pointer group ${severityConfig.border}`}
            onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}`)}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {/* Severity indicator */}
                <div className={`flex-shrink-0 p-3 rounded-lg ${severityConfig.bg} border ${severityConfig.border}`}>
                  <div className={`w-2 h-2 rounded-full ${severityConfig.icon}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h4 className="font-semibold text-sm text-slate-100 group-hover:text-white transition-colors">
                      {vuln.title}
                    </h4>
                    <Badge className={`${severityConfig.bg} ${severityConfig.text} border-0 flex-shrink-0`}>
                      {vuln.severity.toUpperCase()}
                    </Badge>
                  </div>

                  {/* ✅ INSTANCE COUNT: Show total scope */}
                  {vuln.instance_count && vuln.instance_count > 0 && (
                    <div className="mb-2">
                      <Badge variant="secondary" className="text-xs">
                        {vuln.instance_count} {vuln.instance_count === 1 ? 'instance' : 'instances'}
                      </Badge>
                    </div>
                  )}

                  {/* ✅ EXAMPLE LOCATIONS: Show 2-3 examples max */}
                  {vuln.instances && vuln.instances.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {vuln.instances.slice(0, 2).map((instance, idx) => (
                        <code key={instance.id} className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700 text-slate-300 text-xs block truncate">
                          <FileCode className="h-3 w-3 flex-shrink-0" />
                          {instance.file_path ? (
                            <>
                              {instance.file_path}
                              {instance.line_start && `:${instance.line_start}`}
                            </>
                          ) : instance.package_name ? (
                            <>
                              {instance.package_name}
                              {instance.package_version && ` v${instance.package_version}`}
                            </>
                          ) : (
                            'unknown location'
                          )}
                        </code>
                      ))}
                      {vuln.instance_count && vuln.instance_count > 2 && (
                        <span className="text-xs text-slate-400 ml-2">
                          + {vuln.instance_count - 2} more location{vuln.instance_count - 2 !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    {vuln.cwe && (
                      <span className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                        <span className="font-medium text-slate-300">{vuln.cwe}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                      <span className="text-slate-500">{getScannerTypeLabel(vuln.scanner_type)}</span>
                    </span>
                    {vuln.confidence !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Confidence</span>
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.round(vuln.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-300">
                            {Math.round(vuln.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/vulnerabilities/${vuln.id}?explain=true`);
                    }}
                    className="gap-1.5 bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600"
                  >
                    <Sparkles className="h-3 w-3" />
                    Explain with AI
                  </Button>
                  <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {vulnerabilities.length === 0 && (
        <Card className="border-slate-700 bg-slate-900/50">
          <CardContent className="pt-6 text-center text-slate-400">
            No actionable vulnerabilities to display
          </CardContent>
        </Card>
      )}
    </div>
  );
}
