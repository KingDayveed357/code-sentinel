"use client";

/**
 * ✅ GLOBAL VULNERABILITIES PAGE - BIRD'S-EYE VIEW
 * 
 * This page displays ONE ROW PER UNIFIED VULNERABILITY, providing a clear overview of risk.
 * 
 * DATA MODEL:
 * - Source: vulnerabilities_unified table (single source of truth)
 * - Each vulnerability is deduplicated by fingerprint
 * - Instance data is AGGREGATED (count only), never expanded in list view
 * 
 * DISPLAY RULES:
 * - Show vulnerability title, description, severity
 * - Show instance count badge (e.g., "5 instances")
 * - Show 1-2 example locations only (first-seen, deterministic)
 * - Never render all instances on this page
 * - Click through to detail page to see all instances (paginated)
 * 
 * SEPARATION OF CONCERNS:
 * - This page: Bird's-eye view of all vulnerabilities
 * - Detail page: Deep dive into one vulnerability with paginated instances
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumPagination } from "@/components/ui/premium-pagination";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import { vulnerabilitiesApi } from "@/lib/api/vulnerabilities";
import { useWorkspace } from "@/hooks/use-workspace";
import { useVulnerabilities, useVulnerabilityStats } from "@/hooks/use-vulnerabilities";

interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: string;
  scanner_type: string;
  file_path: string | null;
  line_start: number | null;
  cwe: string | null;
  confidence: number | null;
  status: string;
  first_detected_at: string;
  instance_count?: number;
}

interface VulnerabilityStats {
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  verified_findings: {
    likely_exploitable_percent: number;
    likely_false_positive_percent: number;
  };
}

export default function VulnerabilitiesPage() {
  const { workspace } = useWorkspace(); // Use useWorkspace instead of useAuth for reactivity
  const workspaceId = workspace?.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("severity");
  const perPage = 15;

  // Fetch stats reactively
  const { data: stats = null } = useVulnerabilityStats(workspaceId);

  // Fetch vulnerabilities reactively
  const { 
    vulnerabilities, 
    loading, 
    total,
    pages: totalPages 
  } = useVulnerabilities({
    workspaceId,
    filters: {
      page: currentPage,
      limit: perPage,
      sort: sortBy,
      search: searchQuery || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    }
  });

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
      critical: { variant: "destructive", className: "bg-red-500 hover:bg-red-600" },
      high: { variant: "destructive", className: "bg-orange-500 hover:bg-orange-600" },
      medium: { variant: "secondary", className: "bg-yellow-500 hover:bg-yellow-600 text-black" },
      low: { variant: "outline", className: "" },
      info: { variant: "outline", className: "" },
    };

    const config = variants[severity.toLowerCase()] || variants.low;

    return (
      <Badge variant={config.variant} className={config.className}>
        {severity.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vulnerabilities</h1>
        <p className="text-muted-foreground mt-2">
          All security findings across your projects
        </p>
      </div>

      {/* CodeSentinel Verified Banner */}
      {stats && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  CodeSentinel Verified Findings™
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.verified_findings.likely_exploitable_percent}% likely exploitable •{" "}
                  {stats.verified_findings.likely_false_positive_percent}% false positives
                </p>
              </div>
              <Badge variant="outline" className="border-primary text-primary">
                AI-Verified
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Severity Breakdown */}
      {stats && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Severity:</span>
          <Badge variant="destructive" className="bg-red-500">
            Critical ({stats.by_severity.critical})
          </Badge>
          <Badge variant="destructive" className="bg-orange-500">
            High ({stats.by_severity.high})
          </Badge>
          <Badge variant="secondary" className="bg-yellow-500 text-black">
            Medium ({stats.by_severity.medium})
          </Badge>
          <Badge variant="outline">
            Low ({stats.by_severity.low})
          </Badge>
          <Badge variant="outline">
            Info ({stats.by_severity.info})
          </Badge>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vulnerabilities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="false_positive">False Positive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="severity">Severity</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="confidence">Confidence</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vulnerabilities List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : vulnerabilities.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground py-12">
              No vulnerabilities found
            </CardContent>
          </Card>
        ) : (
          vulnerabilities.map((vuln) => (
            <Card
              key={vuln.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/dashboard/vulnerabilities/${vuln.id}`)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {/* Severity badge */}
                  <div className="flex-shrink-0">
                    {getSeverityBadge(vuln.severity)}
                  </div>

                  {/* Content */}
                  {/* ✅ BIRD'S-EYE VIEW: One row per unified vulnerability */}
                  {/* This displays the vulnerability with instance count and example locations */}
                  {/* Never renders all instances directly - maintains clean overview */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1">
                      {vuln.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {vuln.description}
                    </p>
                    
                    {/* Instance count badge - shows total scope */}
                    {(vuln as any).instance_count && (vuln as any).instance_count > 0 && (
                      <div className="mb-2">
                        <Badge variant="secondary" className="text-xs font-medium">
                          {(vuln as any).instance_count} {(vuln as any).instance_count === 1 ? 'instance' : 'instances'}
                        </Badge>
                      </div>
                    )}

                    {/* Example location preview - shows 1-2 examples only */}
                    {vuln.file_path && (
                      <div className="mb-2">
                        <code className="text-xs bg-muted px-2 py-0.5 rounded block truncate">
                          {vuln.file_path}
                          {vuln.line_start && `:${vuln.line_start}`}
                        </code>
                        {(vuln as any).instance_count && (vuln as any).instance_count > 1 && (
                          <span className="text-xs text-muted-foreground ml-2">
                            + {(vuln as any).instance_count - 1} more location{(vuln as any).instance_count - 1 !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {vuln.scanner_type.toUpperCase()}
                      </Badge>
                      {vuln.cwe && (
                        <span className="font-medium">{vuln.cwe}</span>
                      )}
                      {vuln.confidence !== null && (
                        <span>
                          {Math.round(vuln.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={vuln.status === "open" ? "destructive" : "outline"} className="text-xs">
                      {vuln.status.replace("_", " ").toUpperCase()}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && vulnerabilities.length > 0 && (
        <PremiumPagination
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          perPage={perPage}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
