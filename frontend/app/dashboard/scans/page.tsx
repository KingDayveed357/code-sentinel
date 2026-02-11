"use client";

import React, { useState } from "react";
import { useScans } from "@/hooks/use-scans";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScanStatusBadge } from "@/components/scans/scan-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PremiumPagination } from "@/components/ui/premium-pagination";
import { ExternalLink } from "lucide-react";
import { scansApi, type Scan } from "@/lib/api/scans";

export default function ScansPage() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 15;

  const {
    scans,
    loading,
    error,
    total,
    totalPages
  } = useScans({
    page: currentPage,
    limit: perPage,
    sort: "recent",
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Scans</h1>
        <p className="text-muted-foreground mt-2">
          View scan history across all projects
        </p>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Commit</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))
            ) : scans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No scans found
                </TableCell>
              </TableRow>
            ) : (
              scans.map((scan) => (
                <TableRow
                  key={scan.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/dashboard/scans/${scan.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{scan.repository.name}</span>
                      <a
                        href={scan.repository.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ScanStatusBadge
                      status={scan.status}
                      progressPercentage={scan.progress_percentage}
                      progressStage={scan.progress_stage}
                      showProgress={scan.status === "running"}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {scan.branch}
                    </code>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs text-muted-foreground">
                      {scan.commit_hash?.substring(0, 7) || "—"}
                    </code>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {scan.vulnerabilities_found || 0}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDuration(scan.duration_seconds)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && scans.length > 0 && (
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
