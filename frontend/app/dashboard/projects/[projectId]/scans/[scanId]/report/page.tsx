// app/dashboard/projects/[projectId]/scans/[scanId]/report/page.tsx
"use client";

import { use, useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Activity,
  FileJson,
  FileSpreadsheet,
  PartyPopper,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { scansApi, type Scan, type ScanLog } from "@/lib/api/scans";
import { repositoriesApi, type Repository } from "@/lib/api/repositories";
import { ScanOverview } from "@/components/report/scan-overview";
import { ScanLogs } from "@/components/report/scan-logs";
import { VulnerabilityCard, type VulnerabilityData } from "@/components/report/vulnerability-card";
import { VulnerabilityFilters, type FilterState } from "@/components/report/vulnerability-filters";
import { useToast } from "@/hooks/use-toast";
import { useAllScanVulnerabilities } from "@/hooks/use-vulnerabilities";

const ITEMS_PER_PAGE = 10;

export default function ScanReportPage({
  params,
}: {
  params: Promise<{ projectId: string; scanId: string }>;
}) {
  const router = useRouter();
  const { projectId, scanId } = use(params);
  const { toast } = useToast();

  const [project, setProject] = useState<Repository | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [vulnerabilitiesLoaded, setVulnerabilitiesLoaded] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    severity: "all",
    source: "all",
    search: "",
    groupByFile: false,
    sortBy: "severity",
  });

  // Use the hook to fetch all vulnerabilities
  const {
    vulnerabilities: rawVulnerabilities,
    loading: vulnsLoading,
    error: vulnsError,
    refetch: refetchVulns,
  } = useAllScanVulnerabilities(scanId);

  const determineSource = (vuln: any): "sast" | "sca" | "secrets" | "iac" | "container" => {
    if (vuln.package_name && vuln.package_version) return "sca";
    if (vuln.image_name) return "container";
    if (vuln.secret_type) return "secrets";
    if (vuln.resource_type) return "iac";
    return "sast";
  };

  // Transform vulnerabilities
  const vulnerabilities: VulnerabilityData[] = useMemo(() => {
    return rawVulnerabilities.map((v: any) => ({
      id: v.id,
      severity: v.severity,
      title: v.title,
      file: v.file_path || "",
      line: v.line_start || v.line || null,
      description: v.description || v.message || "",
      remediation: v.ai_remediation || v.recommendation,
      cwe: Array.isArray(v.cwe) ? v.cwe[0] : v.cwe,
      code_snippet: v.code_snippet,
      source: determineSource(v),
    }));
  }, [rawVulnerabilities]);

  useEffect(() => {
    loadData();
  }, [projectId, scanId]);

  // Poll for updates if scan is active
  useEffect(() => {
    if (scan?.status === "running" || scan?.status === "normalizing" || scan?.status === "ai_enriching") {
      const interval = setInterval(() => {
        loadScanStatus();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [scan?.status]);

  // Mark vulnerabilities as loaded only after scan is completed AND data has been fetched
  useEffect(() => {
    if (scan?.status === "completed" && !vulnsLoading) {
      // Add a small delay to ensure data is fully loaded
      const timer = setTimeout(() => {
        setVulnerabilitiesLoaded(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [scan?.status, vulnsLoading]);

  // Refetch vulnerabilities when scan completes
  useEffect(() => {
    if (scan?.status === "completed" && !vulnerabilitiesLoaded) {
      refetchVulns();
    }
  }, [scan?.status, vulnerabilitiesLoaded]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectData, scanData] = await Promise.all([
        repositoriesApi.getById(projectId),
        scansApi.getStatus(scanId),
      ]);

      setProject(projectData);
      setScan(scanData.scan);

      if (
        scanData.scan.status === "running" ||
        scanData.scan.status === "normalizing" ||
        scanData.scan.status === "ai_enriching" ||
        scanData.scan.status === "failed"
      ) {
        await loadLogs();
      }
    } catch (err: any) {
      setError(err.message || "Failed to load scan report");
    } finally {
      setLoading(false);
    }
  };

  const loadScanStatus = async () => {
    try {
      const scanData = await scansApi.getStatus(scanId);
      setScan(scanData.scan);

      if (
        scanData.scan.status === "running" ||
        scanData.scan.status === "normalizing" ||
        scanData.scan.status === "ai_enriching"
      ) {
        await loadLogs();
      }

      if (scanData.scan.status === "completed") {
        refetchVulns();
      }
    } catch (err) {
      console.error("Failed to update scan status:", err);
    }
  };

  const loadLogs = async () => {
    try {
      const logsData = await scansApi.getLogs(scanId);
      setLogs(logsData.logs);
    } catch (err) {
      console.error("Failed to load logs:", err);
    }
  };

  const handleRerunScan = async () => {
    if (!project || !scan) return;

    try {
      setRerunning(true);
      const result = await scansApi.start(projectId, {
        branch: scan.branch,
        scan_type: scan.scan_type,
      });
      router.push(`/dashboard/projects/${projectId}/scans/${result.scan_id}/report`);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to start scan",
        variant: "destructive",
      });
    } finally {
      setRerunning(false);
    }
  };

  const handleExport = async (format: "json" | "csv") => {
    try {
      setExporting(format);
      const blob = await scansApi.exportResults(scanId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scan-${scanId}-${new Date().toISOString()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: `Report exported as ${format.toUpperCase()}`,
      });
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err.message || "Failed to export report",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  const filteredVulnerabilities = useMemo(() => {
    let filtered = vulnerabilities;

    if (filters.severity !== "all") {
      filtered = filtered.filter((v) => v.severity === filters.severity);
    }

    if (filters.source !== "all") {
      filtered = filtered.filter((v) => v.source === filters.source);
    }

    if (filters.search) {
      filtered = filtered.filter((v) =>
        v.file.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

    if (filters.sortBy === "severity") {
      filtered.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    } else {
      filtered.sort((a, b) => a.file.localeCompare(b.file));
    }

    return filtered;
  }, [vulnerabilities, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredVulnerabilities.length / ITEMS_PER_PAGE);
  const paginatedVulnerabilities = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVulnerabilities.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredVulnerabilities, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const groupedVulnerabilities = useMemo(() => {
    if (!filters.groupByFile) return null;

    const grouped = new Map<string, VulnerabilityData[]>();
    paginatedVulnerabilities.forEach((vuln) => {
      const file = vuln.file;
      if (!grouped.has(file)) {
        grouped.set(file, []);
      }
      grouped.get(file)!.push(vuln);
    });

    return grouped;
  }, [paginatedVulnerabilities, filters.groupByFile]);

  const getStatusConfig = (status: string) => {
    const configs = {
      pending: { icon: Clock, className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400", label: "Pending" },
      running: { icon: Activity, className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 animate-pulse", label: "Running" },
      normalizing: { icon: Activity, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400", label: "Normalizing" },
      ai_enriching: { icon: Activity, className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400", label: "AI Enriching" },
      completed: { icon: CheckCircle2, className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400", label: "Completed" },
      failed: { icon: XCircle, className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400", label: "Failed" },
      cancelled: { icon: XCircle, className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400", label: "Cancelled" },
    };
    return configs[status as keyof typeof configs] || configs.pending;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !scan || !project) {
    return (
      <div className="space-y-6 px-4 sm:px-6">

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Scan or project not found"}</AlertDescription>
        </Alert>

        <Button variant="outline" asChild>
          <Link href="/dashboard/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const statusConfig = getStatusConfig(scan.status);
  const StatusIcon = statusConfig.icon;
  const isActive = scan.status === "running" || scan.status === "normalizing" || scan.status === "ai_enriching";
  
  // Only show no vulnerabilities message when:
  // 1. Scan is completed
  // 2. Vulnerabilities have been loaded (not still loading)
  // 3. There are actually no vulnerabilities
  const showNoVulns = scan.status === "completed" && vulnerabilitiesLoaded && vulnerabilities.length === 0;
  
  // Show loading state when scan is completed but vulnerabilities haven't loaded yet
  const showVulnLoading = scan.status === "completed" && (!vulnerabilitiesLoaded || vulnsLoading);

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{project.name}</h1>
              <p className="text-sm text-muted-foreground">Security Scan Report</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge className={statusConfig.className}>
              <StatusIcon className={`h-3 w-3 mr-1 ${isActive ? 'animate-pulse' : ''}`} />
              {statusConfig.label}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              ID: {scanId.slice(0, 8)}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("json")}
            disabled={scan.status !== "completed" || exporting === "json"}
            className="flex-1 sm:flex-none"
          >
            {exporting === "json" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Exporting...</span>
              </>
            ) : (
              <>
                <FileJson className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Export JSON</span>
                <span className="sm:hidden">JSON</span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            disabled={scan.status !== "completed" || exporting === "csv"}
            className="flex-1 sm:flex-none"
          >
            {exporting === "csv" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Exporting...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">CSV</span>
              </>
            )}
          </Button>
          <Button onClick={handleRerunScan} disabled={rerunning || isActive} size="sm" className="flex-1 sm:flex-none">
            {rerunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Starting...</span>
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Re-run Scan</span>
                <span className="sm:hidden">Re-run</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Scan Overview */}
      <ScanOverview scan={scan} />

      {/* Active Scan - Real-time Logs */}
      {isActive && <ScanLogs logs={logs} />}

      {/* Failed Scan Error */}
      {scan.status === "failed" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Scan Failed:</strong> {scan.error_message || "An unknown error occurred"}
          </AlertDescription>
        </Alert>
      )}

      {/* Vulnerabilities Section */}
      {scan.status === "completed" && (
        <>
          {showVulnLoading ? (
            <Card>
              <CardContent className="pt-12 pb-12">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground text-center">Loading vulnerabilities...</span>
                </div>
              </CardContent>
            </Card>
          ) : vulnsError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{vulnsError}</AlertDescription>
            </Alert>
          ) : showNoVulns ? (
            <Card className="border-green-200 dark:border-green-900">
              <CardContent className="pt-8 sm:pt-12 pb-8 sm:pb-12 px-4">
                <div className="text-center">
                  <PartyPopper className="h-12 w-12 sm:h-16 sm:w-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl sm:text-2xl font-bold mb-2">No Vulnerabilities Found!</h3>
                  <p className="text-muted-foreground mb-6 text-sm sm:text-base">
                    This scan detected no security issues. Your code is looking great!
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button variant="outline" asChild className="w-full sm:w-auto">
                      <Link href={`/dashboard/projects/${projectId}/scan-history`}>
                        View Scan History
                      </Link>
                    </Button>
                    <Button onClick={handleRerunScan} disabled={rerunning} className="w-full sm:w-auto">
                      {rerunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Re-run Scan
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <VulnerabilityFilters filters={filters} onFilterChange={setFilters} />

              <Card>
                <CardContent className="pt-6 px-4 sm:px-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                    <h3 className="text-base sm:text-lg font-semibold">
                      Detected Vulnerabilities ({filteredVulnerabilities.length})
                    </h3>
                    {totalPages > 0 && (
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages} • Showing {ITEMS_PER_PAGE} per page
                      </div>
                    )}
                  </div>

                  {filteredVulnerabilities.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">No vulnerabilities match your current filters</p>
                    </div>
                  ) : filters.groupByFile && groupedVulnerabilities ? (
                    <div className="space-y-6">
                      {Array.from(groupedVulnerabilities.entries()).map(([file, vulns]) => (
                        <div key={file} className="space-y-2">
                          <h4 className="font-semibold text-xs sm:text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">
                            {file} ({vulns.length})
                          </h4>
                          <div className="space-y-2 sm:pl-4">
                            {vulns.map((vuln) => (
                              <VulnerabilityCard
                                key={vuln.id}
                                vulnerability={vuln}
                                projectId={projectId}
                                scanId={scanId}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paginatedVulnerabilities.map((vuln) => (
                        <VulnerabilityCard
                          key={vuln.id}
                          vulnerability={vuln}
                          projectId={projectId}
                          scanId={scanId}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {filteredVulnerabilities.length > ITEMS_PER_PAGE && (
                    <div className="mt-6 pt-6 border-t">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-muted-foreground order-2 sm:order-1">
                          Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredVulnerabilities.length)} of {filteredVulnerabilities.length} vulnerabilities
                        </div>
                        <div className="flex items-center gap-2 order-1 sm:order-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Previous</span>
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (currentPage <= 3) {
                                pageNum = i + 1;
                              } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = currentPage - 2 + i;
                              }
                              
                              return (
                                <Button
                                  key={pageNum}
                                  variant={currentPage === pageNum ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(pageNum)}
                                  className="w-8 h-8 p-0"
                                >
                                  {pageNum}
                                </Button>
                              );
                            })}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* Quick Actions Footer */}
      <Card>
        <CardContent className="pt-6 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
              Need help understanding these results? Check out our{" "}
              <Link href="/docs/security" className="text-primary hover:underline">
                security documentation
              </Link>
              .
            </p>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/projects/${projectId}/scan-history`}>
                  View All Scans
                </Link>
              </Button>
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/projects/${projectId}`}>Back to Project</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}