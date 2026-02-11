// src/modules/scans/pipeline/steps/complete-scan.ts
// Single place for scan completion: read unified data, compute metrics, update scan row and scan_metrics.

import type { FastifyInstance } from "fastify";
import { calculateSecurityScore } from "../utils/calculator";

export interface ScanCompletionContext {
  commitHash: string;
  filesScanned: number;
  linesOfCode: number;
  durationSeconds: number;
  scanMetrics: {
    semgrepDuration: number;
    osvDuration: number;
    gitleaksDuration: number;
    checkovDuration: number;
    trivyDuration: number;
    totalDuration: number;
  };
}

export interface ScanCompletionResult {
  uniqueVulnCount: number;
  locationsInThisScan: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

/**
 * Complete a scan: compute severity counts and security score from unified data,
 * update the scan record, and insert scan_metrics.
 * Uses the same data set (unified + instances) for counts and score.
 */
export async function completeScan(
  fastify: FastifyInstance,
  scanId: string,
  context: ScanCompletionContext
): Promise<ScanCompletionResult> {
  const { count: locationsInThisScan } = await fastify.supabase
    .from("vulnerability_instances")
    .select("id", { count: "exact", head: true })
    .eq("scan_id", scanId);

  const { data: scanVulns } = await fastify.supabase
    .from("vulnerability_instances")
    .select(`
      vulnerability_id,
      vulnerabilities_unified!inner (
        severity,
        status,
        scanner_type
      )
    `)
    .eq("scan_id", scanId);

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const vulnsForScore: { severity: string; type: string }[] = [];

  if (scanVulns && scanVulns.length > 0) {
    const uniqueVulnsBySeverity = new Map<string, { severity: string; type: string }>();
    scanVulns.forEach((item: any) => {
      const vuln = item.vulnerabilities_unified;
      if (vuln && vuln.status === "open") {
        uniqueVulnsBySeverity.set(item.vulnerability_id, {
          severity: vuln.severity,
          type: vuln.scanner_type || "sast",
        });
      }
    });

    uniqueVulnsBySeverity.forEach(({ severity, type }) => {
      if (severity in severityCounts) {
        severityCounts[severity as keyof typeof severityCounts]++;
      }
      vulnsForScore.push({ severity, type });
    });
  }

  const uniqueVulnCount = Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const securityScore = calculateSecurityScore(vulnsForScore);

  const { error: updateError } = await fastify.supabase
    .from("scans")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      commit_hash: context.commitHash,
      vulnerabilities_found: uniqueVulnCount,
      critical_count: severityCounts.critical,
      high_count: severityCounts.high,
      medium_count: severityCounts.medium,
      low_count: severityCounts.low,
      info_count: severityCounts.info,
      security_score: securityScore.score,
      security_grade: securityScore.grade,
      score_breakdown: securityScore.breakdown,
      files_scanned: context.filesScanned,
      lines_of_code: context.linesOfCode,
      duration_seconds: context.durationSeconds,
      progress_percentage: 100,
      progress_stage: "Complete",
    })
    .eq("id", scanId);

  if (updateError) {
    fastify.log.error(
      { error: updateError, scanId },
      "Failed to update scan to completed status"
    );
    throw new Error(`Failed to complete scan: ${updateError.message}`);
  }

  await fastify.supabase.from("scan_metrics").insert({
    scan_id: scanId,
    semgrep_duration_ms: context.scanMetrics.semgrepDuration,
    osv_duration_ms: context.scanMetrics.osvDuration,
    gitleaks_duration_ms: context.scanMetrics.gitleaksDuration,
    checkov_duration_ms: context.scanMetrics.checkovDuration,
    trivy_duration_ms: context.scanMetrics.trivyDuration,
    total_files: context.filesScanned,
    total_lines: context.linesOfCode,
  });

  return {
    uniqueVulnCount,
    locationsInThisScan: locationsInThisScan ?? 0,
    severityCounts,
  };
}
