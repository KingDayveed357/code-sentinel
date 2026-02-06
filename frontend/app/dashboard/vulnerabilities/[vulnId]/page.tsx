"use client";

/**
 * ✅ VULNERABILITY DETAIL PAGE - INSTANCE EXPLOSION CONTROL
 * 
 * This page shows detailed information about a single unified vulnerability.
 * 
 * INSTANCE HANDLING:
 * - Instances are PAGINATED (default: 20 per page)
 * - Instances are COLLAPSED by default (show first 5)
 * - "Show More" button expands current page
 * - "Load More" button fetches next page from server
 * - NEVER render all instances at once (prevents overwhelming UX)
 * 
 * DATA FLOW:
 * 1. Initial load: Fetch vulnerability + first page of instances (20)
 * 2. User clicks "Show More": Expand to show all 20 on current page
 * 3. User clicks "Load More": Fetch next 20 instances from server
 * 4. Instances accumulate in state, pagination tracks current/total pages
 * 
 * PERFORMANCE:
 * - Stable sorting: Most recent instances first (deterministic)
 * - Lazy loading: Only fetch instances when user requests them
 * - No client-side filtering: All filtering done server-side
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RiskContextGrid } from "@/components/vulnerabilities/risk-context-grid";
import { AIExplanationPanel } from "@/components/vulnerabilities/ai-explanation-panel";
import { ConfidenceGauge } from "@/components/vulnerabilities/confidence-gauge";
import { ChevronLeft, Sparkles, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vulnerabilitiesApi } from "@/lib/api/vulnerabilities";
import { InstanceLocations } from "@/components/vulnerabilities/instance-locations";

interface VulnerabilityDetail {
  id: string;
  title: string;
  description: string;
  severity: string;
  scanner_type: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  cwe: string | null;
  confidence: number | null;
  status: string;
  assigned_to: string | null;
  ai_explanation: any;
  ai_remediation: string | null;
  risk_context: any;
  first_detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  scanner_metadata: any;
  instances?: any[];
  instance_count?: number;
}

export default function VulnerabilityDetailPage() {
  const { workspaceId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const vulnId = params?.vulnId as string;
  const [vulnerability, setVulnerability] = useState<VulnerabilityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [comment, setComment] = useState("");
  
  // ✅ INSTANCE PAGINATION STATE: Track current page and loading state
  const [instancesPage, setInstancesPage] = useState(1);
  const [isLoadingMoreInstances, setIsLoadingMoreInstances] = useState(false);
  const [allInstances, setAllInstances] = useState<any[]>([]);
  const [instancesPagination, setInstancesPagination] = useState<{
    currentPage: number;
    totalPages: number;
    totalCount: number;
  } | null>(null);

  useEffect(() => {
    if (!workspaceId || !vulnId) return;

    const fetchVulnerability = async () => {
      setLoading(true);
      try {
        // ✅ FETCH WITH PAGINATION: Request first page of instances
        const data = await vulnerabilitiesApi.getById(
          workspaceId,
          vulnId,
          ["instances", "ai_explanation", "risk_context", "related_issues"],
          1, // Start with page 1
          20 // Default limit
        );
        setVulnerability(data as any);
        
        // Store instances and pagination info
        if (data.instances) {
          setAllInstances(data.instances);
          setInstancesPagination({
            currentPage: (data as any).instances_page || 1,
            totalPages: (data as any).instances_total_pages || 1,
            totalCount: data.instance_count || 0,
          });
        }

        // Auto-generate AI explanation if requested
        if (searchParams?.get("explain") === "true" && !data.ai_explanation) {
          handleGenerateAI();
        }
      } catch (error) {
        console.error("Failed to fetch vulnerability:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchVulnerability();
  }, [workspaceId, vulnId, searchParams]);

  const handleStatusUpdate = async (status: string) => {
    if (!workspaceId || !vulnId) return;

    setUpdating(true);
    try {
      const updated = await vulnerabilitiesApi.updateStatus(
        workspaceId,
        vulnId,
        status as any,
        comment || undefined
      );
      setVulnerability(updated as any);
      setComment("");
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setUpdating(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!workspaceId || !vulnId) return;

    try {
      const updated = await vulnerabilitiesApi.generateAIExplanation(
        workspaceId,
        vulnId,
        false
      );
      setVulnerability(updated as any);
    } catch (error) {
      console.error("Failed to generate AI explanation:", error);
    }
  };

  // ✅ LOAD MORE INSTANCES: Fetch next page of instances
  const handleLoadMoreInstances = async () => {
    if (!workspaceId || !vulnId || !instancesPagination) return;
    if (instancesPagination.currentPage >= instancesPagination.totalPages) return;

    setIsLoadingMoreInstances(true);
    try {
      const nextPage = instancesPagination.currentPage + 1;
      const data = await vulnerabilitiesApi.getById(
        workspaceId,
        vulnId,
        ["instances"],
        nextPage,
        20
      );

      if (data.instances) {
        // Append new instances to existing ones
        setAllInstances((prev) => [...prev, ...data.instances]);
        setInstancesPagination({
          currentPage: (data as any).instances_page || nextPage,
          totalPages: (data as any).instances_total_pages || instancesPagination.totalPages,
          totalCount: data.instance_count || instancesPagination.totalCount,
        });
      }
    } catch (error) {
      console.error("Failed to load more instances:", error);
    } finally {
      setIsLoadingMoreInstances(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
      critical: { variant: "destructive", className: "bg-red-500 hover:bg-red-600" },
      high: { variant: "destructive", className: "bg-orange-500 hover:bg-orange-600" },
      medium: { variant: "secondary", className: "bg-yellow-500 hover:bg-yellow-600 text-black" },
      low: { variant: "outline", className: "" },
    };

    const config = variants[severity?.toLowerCase()] || variants.low;

    return (
      <Badge variant={config.variant} className={config.className}>
        {severity?.toUpperCase()}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!vulnerability) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Vulnerability not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/vulnerabilities")}
          className="mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Vulnerabilities
        </Button>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-start gap-3 mb-2">
          {getSeverityBadge(vulnerability.severity)}
          <Badge variant={vulnerability.status === "open" ? "destructive" : "outline"}>
            {vulnerability.status.replace("_", " ").toUpperCase()}
          </Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{vulnerability.title}</h1>
        <p className="text-muted-foreground mt-2">{vulnerability.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={() => handleStatusUpdate("false_positive")}
          disabled={updating}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Mark as False Positive
        </Button>
        <Button
          variant="outline"
          onClick={() => handleStatusUpdate("fixed")}
          disabled={updating}
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Mark as Fixed
        </Button>
        {!vulnerability.ai_explanation && (
          <Button variant="outline" onClick={handleGenerateAI}>
            <Sparkles className="h-4 w-4 mr-2" />
            Explain with AI
          </Button>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* What was found */}
          <Card>
            <CardHeader>
              <CardTitle>What was found</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Scanner Type</p>
                  <p className="font-medium">{vulnerability.scanner_type.toUpperCase()}</p>
                </div>
                {vulnerability.cwe && (
                  <div>
                    <p className="text-muted-foreground">CWE</p>
                    <p className="font-medium">{vulnerability.cwe}</p>
                  </div>
                )}
                {vulnerability.file_path && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">File Path</p>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {vulnerability.file_path}
                      {vulnerability.line_start && `:${vulnerability.line_start}`}
                      {vulnerability.line_end && vulnerability.line_end !== vulnerability.line_start && `-${vulnerability.line_end}`}
                    </code>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">First Detected</p>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(vulnerability.first_detected_at), { addSuffix: true })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Seen</p>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(vulnerability.last_seen_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ✅ INSTANCE LOCATIONS: Paginated and collapsed by default */}
          {allInstances && allInstances.length > 0 && (
            <InstanceLocations 
              instances={allInstances} 
              scannerType={vulnerability.scanner_type}
              totalCount={instancesPagination?.totalCount}
              currentPage={instancesPagination?.currentPage}
              totalPages={instancesPagination?.totalPages}
              onLoadMore={handleLoadMoreInstances}
              isLoadingMore={isLoadingMoreInstances}
            />
          )}

          {/* Vulnerable Code */}
          {vulnerability.scanner_metadata?.code_snippet && (
            <Card>
              <CardHeader>
                <CardTitle>Vulnerable Code</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto font-mono">
                  {vulnerability.scanner_metadata.code_snippet}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Risk Context */}
          {vulnerability.risk_context && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Risk Context</h3>
              <RiskContextGrid riskContext={vulnerability.risk_context} />
            </div>
          )}

          {/* AI Explanation */}
          <AIExplanationPanel
            explanation={vulnerability.ai_explanation}
            vulnerableCode={vulnerability.scanner_metadata?.code_snippet}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Confidence Gauge */}
          {vulnerability.confidence !== null && (
            <ConfidenceGauge confidence={vulnerability.confidence} />
          )}

          {/* Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              <Select defaultValue={vulnerability.assigned_to || "unassigned"}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  <SelectItem value="user1">User 1</SelectItem>
                  <SelectItem value="user2">User 2</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Add a comment..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
              />
              <Button size="sm" className="w-full" disabled={!comment.trim()}>
                Add Comment
              </Button>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                  <div>
                    <p className="font-medium">Detected</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(vulnerability.first_detected_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                {vulnerability.resolved_at && (
                  <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                    <div>
                      <p className="font-medium">Resolved</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(vulnerability.resolved_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
