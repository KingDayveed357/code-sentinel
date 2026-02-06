// src/modules/scans/worker.ts 
import type { FastifyInstance } from "fastify";
import type { Job } from "bullmq";
import type { ScanJobPayload } from "../../utils/queue/job-queue";
import { fetchRepositoryCode } from "../integrations/github/service";
import { ScannerOrchestrator } from "../../scanners/orchestrator";
import { ProgressTracker } from "./progress-events";
import { autoCreateIssuesForScan } from "../github-issues/service";
import { EntitlementsService } from "../entitlements/service";
import {
  asyncMkdtemp,
  asyncWriteFile,
  asyncRmdir,
  asyncFileExists,
} from "../../utils/async-exec";
import { getCommitHash } from "../integrations/github/commit-resolver"
import {checkScanCache, cloneScanResults } from './cache-check'
import * as path from "path";

interface ScanLog {
  timestamp: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  details?: any;
}

export async function processScanJob(
  fastify: FastifyInstance,
  job: Job<ScanJobPayload>
): Promise<void> {
  const { scanId, repositoryId, workspaceId, branch, enabledScanners } =  job.data;

  const entitlementsService = new EntitlementsService(fastify);

  let workspacePath: string | null = null;
  const logs: ScanLog[] = [];

  // ✅ PRODUCTION FIX: Add timeout protection
  const SCAN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const scanStartTime = Date.now();
  let timeoutCheckInterval: NodeJS.Timeout | null = null;

  // Helper to log and store to database
  const addLog = async (
    level: ScanLog["level"],
    message: string,
    details?: any
  ) => {
    const log: ScanLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };
    logs.push(log);

    // Use proper fastify logger methods based on level
    const logContext = { scanId, ...details };
    switch (level) {
      case "debug":
        fastify.log.debug(logContext, message);
        break;
      case "info":
        fastify.log.info(logContext, message);
        break;
      case "warning":
        fastify.log.warn(logContext, message);
        break;
      case "error":
        fastify.log.error(logContext, message);
        break;
      default:
        fastify.log.info(logContext, message);
    }

    try {
      await fastify.supabase.from("scan_logs").insert({
        scan_id: scanId,
        level,
        message,
        details: details || {},
      });
    } catch (err) {
      fastify.log.warn({ err }, "Failed to store scan log");
    }
  };

  try {
    await addLog("info", "Scan job started", { jobId: job.id });
    await updateScanStatus(fastify, scanId, "running");

    // ✅ PRODUCTION FIX: Start timeout monitoring
    timeoutCheckInterval = setInterval(async () => {
      const elapsed = Date.now() - scanStartTime;
      if (elapsed > SCAN_TIMEOUT_MS) {
        await addLog("error", "Scan timeout - exceeded 30 minutes", {
          elapsed_ms: elapsed,
          timeout_ms: SCAN_TIMEOUT_MS
        });
        await updateScanStatus(fastify, scanId, "failed", "Scan timeout: exceeded 30 minutes");
        if (timeoutCheckInterval) clearInterval(timeoutCheckInterval);
        throw new Error("Scan timeout: exceeded 30 minutes");
      }
    }, 60000); // Check every minute

    await job.updateProgress(5);

    // Fetch repository metadata
    await addLog("info", "Fetching repository metadata");
    const { data: repo, error: repoError } = await fastify.supabase
      .from("repositories")
      .select("full_name, default_branch")
      .eq("id", repositoryId)
      .single();

    if (repoError || !repo) {
      throw new Error("Project not found");
    }
    await job.updateProgress(10);

    // Fetch commit hash from GitHub API 
    await addLog("info", "Resolving commit hash for deterministic tracking");
    let commitHash = "unknown";
    try {
      // const { getCommitHash } = await import("../integrations/github/commit-resolver");
      const resolved = await getCommitHash(
        fastify,
        workspaceId,
        repo.full_name,
        branch || repo.default_branch
      );
      
      if (resolved && resolved !== "unknown") {
        commitHash = resolved;
        await addLog("info", `✅ Commit tracked: ${commitHash.substring(0, 7)}`, {
          commitHash,
          caching_enabled: true,
        });
      } else {
        // ✅ DETERMINISM FIX: When commit hash cannot be resolved, 
        // create a deterministic synthetic hash based on repo+branch+timestamp
        // This ensures repeat scans on the same branch are still deduplicated
        const synthetic = require('crypto')
          .createHash('sha256')
          .update(`${repo.full_name}:${branch || repo.default_branch}:${new Date().toISOString().split('T')[0]}`)
          .digest('hex');
        commitHash = synthetic;
        
        await addLog("warning", `⚠️ Using synthetic commit hash: ${commitHash.substring(0, 7)} (GitHub unavailable)`, {
          commitHash,
          reason: "GitHub API unavailable, using daily synthetic hash",
          caching_enabled: true,
        });
      }
    } catch (err: any) {
      // ✅ DETERMINISM FIX: Generate synthetic hash on error
      const synthetic = require('crypto')
        .createHash('sha256')
        .update(`${repo.full_name}:${branch || repo.default_branch}:${new Date().toISOString().split('T')[0]}`)
        .digest('hex');
      commitHash = synthetic;
      
      await addLog("warning", `⚠️ Commit resolution failed, using synthetic: ${commitHash.substring(0, 7)}`, {
        error: err.message,
      });
    }

    // ✅ NEW: Check if we can use cached scan results
    await addLog("info", "Checking scan cache");
    // const { checkScanCache, cloneScanResults } = await import('./cache-check');
    
    const cacheResult = await checkScanCache(
      fastify,
      repositoryId,
      commitHash,
      enabledScanners
    );

    if (cacheResult.cached && cacheResult.scanId) {
      await addLog('info', cacheResult.message || 'Using cached scan results', {
        cachedScanId: cacheResult.scanId,
        commitHash: commitHash.substring(0, 7)
      });
      
      // Get cached scan metrics
      const { data: cachedScan, error: cachedScanError } = await fastify.supabase
        .from('scans')
        .select('*')
        .eq('id', cacheResult.scanId)
        .single();
      
      // ✅ TRUST FIX: Validate cached scan exists before using it
      if (!cachedScanError && cachedScan) {
        // Clone vulnerabilities to new scan
        const { cloned } = await cloneScanResults(fastify, cacheResult.scanId, scanId);
        
        await addLog('info', `Cloned ${cloned} vulnerabilities from cached scan`);
        
        // Update scan record with cached metrics
        await fastify.supabase.from('scans').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          commit_hash: commitHash,
          vulnerabilities_found: cachedScan.vulnerabilities_found,
          critical_count: cachedScan.critical_count,
          high_count: cachedScan.high_count,
          medium_count: cachedScan.medium_count,
          low_count: cachedScan.low_count,
          info_count: cachedScan.info_count,
          security_score: cachedScan.security_score,
          security_grade: cachedScan.security_grade,
          score_breakdown: cachedScan.score_breakdown,
          files_scanned: cachedScan.files_scanned,
          lines_of_code: cachedScan.lines_of_code,
          duration_seconds: 1, // Cached result - instant
        }).eq('id', scanId);
        
        await job.updateProgress(100);
        await addLog('info', 'Scan completed using cache', {
          duration_ms: 1000,
          cached: true
        });
        
        return; // Skip actual scanning
      } else {
        // Cache hit but data is missing - log and continue with full scan
        await addLog('warning', 'Cached scan data not found, performing full scan', {
          cachedScanId: cacheResult.scanId,
          error: cachedScanError?.message
        });
      }
    }
    
    await addLog("info", "No cache hit - proceeding with full scan");


    // Fetch repository code
    await addLog("info", `Fetching code from ${repo.full_name}`, { branch });
    const repoFiles = await fetchRepositoryCode(
      fastify,
      workspaceId,
      repo.full_name,
      branch || repo.default_branch
    );

    // ✅ TRUST FIX: Exit immediately for empty repositories
    if (repoFiles.length === 0) {
      await addLog("warning", "Repository is empty - no files to scan");
      
      // Initialize progress tracker to emit completion
      const progress = new ProgressTracker(fastify, scanId);
      await progress.emit('complete', 'Scan completed: Repository is empty');
      
      // Mark scan as failed with clear user-facing message
      await fastify.supabase.from('scans').update({
        status: 'failed',
        error_message: 'Repository is empty. Please add code files and try again.',
        completed_at: new Date().toISOString(),
        duration_seconds: 0,
        vulnerabilities_found: 0,
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        low_count: 0,
        info_count: 0,
      }).eq('id', scanId);
      
      await job.updateProgress(100);
      await addLog("info", "Scan completed: Repository is empty");
      
      return; // Exit early - no scanners should run
    }

    await addLog("info", `Downloaded ${repoFiles.length} files`, {
      fileCount: repoFiles.length,
    });
    await job.updateProgress(20);

    // Create workspace 
    workspacePath = await asyncMkdtemp(`scan-${scanId}-`);
    await addLog("info", "Created temporary workspace", { workspacePath });

    // ✅ REAL PROGRESS: Initialize progress tracker
    const progress = new ProgressTracker(fastify, scanId);
    await progress.emit('fetch', 'Code repository fetched');

    // Write files in batches to keep event loop responsive
    for (const file of repoFiles) {
      const fullPath = path.join(workspacePath, file.path);
      await asyncWriteFile(fullPath, file.content, "utf8");
    }
    await job.updateProgress(30);

    // Run scanners
    await addLog("info", "Starting security scanners", {
      enabled: Object.keys(enabledScanners).filter((k) => enabledScanners[k as keyof typeof enabledScanners]),
    });

    // ✅ REAL PROGRESS: Emit scanning start
    await progress.emit('scanning', 'Scanner execution starting');

    const orchestrator = new ScannerOrchestrator(fastify);
    
    // ✅ REAL PROGRESS: Track which scanners are running
    const activeScannersQueue: string[] = [];
    let completedScanners = 0;
    
    orchestrator.setProgressCallback(async (scannerName: string, phase: 'start' | 'complete') => {
      if (phase === 'start') {
        activeScannersQueue.push(scannerName);
        await progress.updateScannerProgress(
          Object.keys(enabledScanners).filter((k) => enabledScanners[k as keyof typeof enabledScanners]),
          completedScanners,
          scannerName,
          Date.now()
        );
      } else {
        completedScanners++;
        activeScannersQueue.splice(activeScannersQueue.indexOf(scannerName), 1);
        await progress.updateScannerProgress(
          Object.keys(enabledScanners).filter((k) => enabledScanners[k as keyof typeof enabledScanners]),
          completedScanners,
          activeScannersQueue[0] || 'complete',
          Date.now()
        );
      }
    });

    const scanResults = await orchestrator.scanAll(
      workspacePath,
      scanId,
      enabledScanners,
      commitHash
    );

    // ✅ Calculate scan metrics immediately after scanning
    const scanMetrics = calculateScanMetrics(scanResults);

    // ✅ REAL PROGRESS: Emit scanner complete event
    await progress.emit('scanner_complete', `All scanners completed (${scanResults.results.length} scanners ran)`);

    await job.updateProgress(60);

    // Log scanner results
    for (const result of scanResults.results) {
      await addLog(
        result.success ? "info" : "warning",
        `Scanner ${result.scanner} completed`,
        {
          success: result.success,
          vulnerabilities: result.vulnerabilities.length,
          duration_ms: result.metadata.duration_ms,
        }
      );
    }

    // ✅ INSTRUMENTATION: Detailed aggregation logging
    await addLog("debug", "Scanner results summary", {
      totalScanners: scanResults.results.length,
      results: scanResults.results.map(r => ({
        scanner: r.scanner,
        vulnerabilities: r.vulnerabilities.length,
        success: r.success,
      })),
    });

    // Store raw scanner outputs
    await Promise.all(
      scanResults.results.map((result) =>
        fastify.supabase.from("scanner_outputs").insert({
          scan_id: scanId,
          scanner: result.scanner,
          raw_output: {
            success: result.success,
            vulnerabilities: result.vulnerabilities.length,
            errors: result.errors,
          },
          execution_time_ms: result.metadata.duration_ms,
          exit_code: result.success ? 0 : 1,
        })
      )
    );

    const allVulnerabilities = scanResults.results.flatMap(
      (r) => r.vulnerabilities
    );
    await addLog(
      "info",
      `Found ${allVulnerabilities.length} raw vulnerabilities`,
      {
        byScanner: scanResults.results.reduce((acc, r) => {
          acc[r.scanner] = r.vulnerabilities.length;
          return acc;
        }, {} as Record<string, number>),
      }
    );
    await job.updateProgress(70);

    // ✅ REFACTORED: Single deduplication path via unified architecture
    await updateScanStatus(fastify, scanId, "normalizing");
    await progress.emit('normalizing', 'Deduplicating findings across scanners');
    await addLog("info", "Processing unified vulnerabilities and instances", {
      totalVulnerabilities: allVulnerabilities.length,
      scanId,
      workspaceId,
      repositoryId
    });
    
    if (allVulnerabilities.length === 0) {
      await addLog("warning", "No vulnerabilities found by scanners");
    } else {
      try {
        const { processUnifiedVulnerabilities, autoFixMissingVulnerabilities } = await import('./deduplication-processor');
        
        // ✅ SINGLE SOURCE OF TRUTH: Process all vulnerabilities through unified architecture
        // This handles deduplication, fingerprinting, and instance tracking
        await processUnifiedVulnerabilities(
          fastify,
          scanId,
          workspaceId,
          repositoryId,
          allVulnerabilities  // Pass ALL raw findings, not deduplicated
        );
        
        await addLog("info", "Successfully processed unified vulnerabilities");

        // Auto-fix vulnerabilities that disappeared
        const { fixed } = await autoFixMissingVulnerabilities(
          fastify,
          scanId,
          repositoryId
        );

        if (fixed > 0) {
          await addLog("info", `Auto-fixed ${fixed} vulnerabilities that disappeared`);
        }
      } catch (unifiedError: any) {
        // ✅ CRITICAL: Unified processing failure is a scan failure
        await addLog("error", "Failed to process unified vulnerabilities", {
          error: unifiedError.message,
          stack: unifiedError.stack,
          vulnerabilityCount: allVulnerabilities.length
        });
        fastify.log.error({
          error: unifiedError,
          scanId,
          vulnerabilityCount: allVulnerabilities.length
        }, "CRITICAL: Unified vulnerability processing failed");
        
        throw new Error(`Vulnerability processing failed: ${unifiedError.message}`);
      }
    }
  
      await job.updateProgress(90);
      // ---------------------------------------------------------------
    // Derive counts for the scan record.
    //
    // locationsInThisScan — individual findings recorded in THIS scan
    //                        (from vulnerability_instances)
    //
    // Severity breakdown — pulled from unified vulnerabilities found
    //                      in THIS scan (via instances join)
    // ---------------------------------------------------------------
    const { count: locationsInThisScan } = await fastify.supabase
      .from("vulnerability_instances")
      .select("id", { count: "exact", head: true })
      .eq("scan_id", scanId);

    await addLog("info", "Scan instance count", {
      locationsInThisScan: locationsInThisScan || 0,
    });

    // ---------------------------------------------------------------
    // Severity breakdown — get from vulnerabilities found in THIS scan
    // Join instances with unified to get severity of each finding
    // ---------------------------------------------------------------
    const { data: scanVulns } = await fastify.supabase
      .from("vulnerability_instances")
      .select(`
        vulnerability_id,
        vulnerabilities_unified!inner (
          severity,
          status
        )
      `)
      .eq("scan_id", scanId);

    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    
    if (scanVulns && scanVulns.length > 0) {
      // Count unique vulnerabilities by severity (deduplicate by vulnerability_id)
      const uniqueVulnsBySeverity = new Map<string, string>();
      scanVulns.forEach((item: any) => {
        const vuln = item.vulnerabilities_unified;
        if (vuln && vuln.status === "open") {
          uniqueVulnsBySeverity.set(item.vulnerability_id, vuln.severity);
        }
      });

      // Count by severity
      uniqueVulnsBySeverity.forEach((severity) => {
        if (severity in severityCounts) {
          severityCounts[severity as keyof typeof severityCounts]++;
        }
      });
    }

    const uniqueVulnCount = Object.values(severityCounts).reduce((a, b) => a + b, 0);

    await addLog("info", "Severity breakdown for this scan", {
      uniqueVulnCount,
      severityCounts,
      locationsInThisScan: locationsInThisScan || 0,
    });
    
    // Calculate security score based on all vulnerabilities found
    const { calculateSecurityScore } = await import('../security-score/calculator');
    const securityScore = calculateSecurityScore(allVulnerabilities);

    // ✅ CRITICAL FIX: Update scan record with error checking
    const { error: updateError } = await fastify.supabase
      .from("scans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        commit_hash: commitHash,
        vulnerabilities_found: uniqueVulnCount,  // ✅ FIX: Use unique count from this scan
        critical_count: severityCounts.critical,
        high_count: severityCounts.high,
        medium_count: severityCounts.medium,
        low_count: severityCounts.low,
        info_count: severityCounts.info,
        security_score: securityScore.score,
        security_grade: securityScore.grade,
        score_breakdown: securityScore.breakdown,
        files_scanned: repoFiles.length,
        lines_of_code: repoFiles.reduce(
          (sum, f) => sum + f.content.split("\n").length,
          0
        ),
        duration_seconds: Math.floor(scanMetrics.totalDuration / 1000),
        // ✅ FIX: Set progress to 100% and clear stage on completion
        progress_percentage: 100,
        progress_stage: 'Complete',
      })
      .eq("id", scanId);

    if (updateError) {
      await addLog("error", "Failed to update scan to completed status", {
        error: updateError.message,
        scanId,
      });
      throw new Error(`Failed to complete scan: ${updateError.message}`);
    }

    await addLog("info", "Scan marked as completed successfully");

    // Store detailed metrics
    await fastify.supabase.from("scan_metrics").insert({
      scan_id: scanId,
      semgrep_duration_ms: scanMetrics.semgrepDuration,
      osv_duration_ms: scanMetrics.osvDuration,
      gitleaks_duration_ms: scanMetrics.gitleaksDuration,
      checkov_duration_ms: scanMetrics.checkovDuration,
      trivy_duration_ms: scanMetrics.trivyDuration,
      total_files: repoFiles.length,
      total_lines: repoFiles.reduce(
        (sum, f) => sum + f.content.split("\n").length,
        0
      ),
    });

    await job.updateProgress(95);

  
    // Auto-create GitHub issues if enabled
    try {
      await addLog("info", "Checking auto-issue creation settings");

      const issueResult = await autoCreateIssuesForScan(fastify, scanId);

      if (issueResult.created > 0) {
        await addLog("info", "Auto-created GitHub issues", {
          created: issueResult.created,
          skipped: issueResult.skipped,
          failed: issueResult.failed,
        });
      } else {
        await addLog("info", "No issues created", {
          reason:
            issueResult.skipped > 0
              ? "Already exist"
              : "Not enabled or no eligible vulnerabilities",
        });
      }
    } catch (issueError: any) {
      await addLog("warning", "Issue creation failed (non-fatal)", {
        error: issueError.message,
      });
    }

    await job.updateProgress(100);

    // ✅ REAL PROGRESS: Emit final completion event
    await progress.emit('complete', `Scan complete: ${uniqueVulnCount} unique vulnerabilities found`);

    await addLog("info", "Scan completed successfully", {
      uniqueVulnerabilities: uniqueVulnCount,
      totalInstances: locationsInThisScan || 0,
      duration_ms: scanMetrics.totalDuration,
    });
  } catch (error: any) {
    await addLog("error", "Scan job failed", { error: error.message });
    await updateScanStatus(fastify, scanId, "failed", error.message);
    throw error;
  } finally {
    // ✅ PRODUCTION FIX: Clear timeout interval
    if (timeoutCheckInterval) {
      clearInterval(timeoutCheckInterval);
    }

    // ✅ FIX: Only log completion for audit trail
    // Concurrent scans are now tracked via database scan status, not a counter
    try {
      await entitlementsService.trackScanComplete(workspaceId, scanId);
      await addLog("info", "Scan completion logged");
    } catch (err: any) {
      await addLog("warning", "Failed to log scan completion", {
        error: err.message,
        workspaceId,
        scanId,
      });
      // Don't throw - we still want to clean up workspace
    }
    // Cleanup workspace (ASYNC - non-blocking)
    if (workspacePath && (await asyncFileExists(workspacePath))) {
      try {
        await asyncRmdir(workspacePath);
        await addLog("info", "Workspace cleaned up");
      } catch (cleanupError) {
        await addLog("warning", "Failed to cleanup workspace");
      }
    }
  }
}

async function updateScanStatus(
  fastify: FastifyInstance,
  scanId: string,
  status: string,
  errorMessage?: string
) {
  const updates: any = { status };
  
  // Set timestamps
  if (status === "running") {
    updates.started_at = new Date().toISOString();
    updates.progress_percentage = 0;
    updates.progress_stage = 'Starting scan...';
  }
  
  // Set progress for normalizing
  if (status === "normalizing") {
    updates.progress_percentage = 75;
    updates.progress_stage = 'Finalizing results...';
  }
  
  // Set error message
  if (errorMessage) {
    updates.error_message = errorMessage;
    updates.completed_at = new Date().toISOString();
  }
  
  // ✅ CRITICAL FIX: Check for errors and log them
  const { error } = await fastify.supabase
    .from("scans")
    .update(updates)
    .eq("id", scanId);
  
  if (error) {
    fastify.log.error(
      { error, scanId, status, updates },
      `Failed to update scan status to ${status}`
    );
    throw new Error(`Failed to update scan status: ${error.message}`);
  }
  
  fastify.log.info({ scanId, status }, `Scan status updated to ${status}`);
}

async function storeVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  workspaceId: string,
  repositoryId: string,
  vulnerabilities: any[],
  enrichments: Map<string, any>
) {
  const { generateDedupKey } = await import('./dedup-helper');
  
  const getEnrichment = (
    vulnId: string,
    field: string,
    fallback: any = null
  ) => {
    const enrichment = enrichments.get(vulnId);
    return enrichment?.[field] ?? fallback;
  };

  // Group by type
  const byType = {
    sast: vulnerabilities.filter((v) => v.type === "sast"),
    sca: vulnerabilities.filter((v) => v.type === "sca"),
    secret: vulnerabilities.filter((v) => v.type === "secret"),
    iac: vulnerabilities.filter((v) => v.type === "iac"),
    container: vulnerabilities.filter((v) => v.type === "container"),
  };

  fastify.log.info(
    {
      sast: byType.sast.length,
      sca: byType.sca.length,
      secrets: byType.secret.length,
      iac: byType.iac.length,
      container: byType.container.length,
    },
    "Storing vulnerabilities by type"
  );

  // Store in parallel with better error handling
  const insertPromises = [];

  // SAST vulnerabilities
  if (byType.sast.length > 0) {
    insertPromises.push(
      fastify.supabase
        .from("vulnerabilities_sast")
        .insert(
          byType.sast.map((v) => ({
            scan_id: scanId,
            user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
            repository_id: repositoryId,
            scanner: v.scanner,
            type: v.type,
            severity: v.severity,
            title: v.title,
            description: v.description,
            file_path: v.file_path,
            line_start: v.line_start,
            line_end: v.line_end,
            code_snippet: v.code_snippet,
            rule_id: v.rule_id,
            dedup_key: generateDedupKey(v, scanId),
            cwe: v.cwe?.[0] || null,
            owasp: v.owasp,
            confidence: v.confidence,
            recommendation: getEnrichment(
              v.id,
              "remediation",
              v.recommendation
            ),
            reference: v.references,
            ai_explanation: getEnrichment(v.id, "explanation"),
            ai_business_impact: getEnrichment(v.id, "business_impact"),
            ai_remediation: getEnrichment(v.id, "remediation"),
            ai_patch: getEnrichment(v.id, "suggested_patch"),
            ai_risk_score: getEnrichment(v.id, "risk_score"),
            ai_priority: getEnrichment(v.id, "priority"),
            ai_false_positive_score: getEnrichment(
              v.id,
              "false_positive_score"
            ),
            metadata: v.metadata,
            status: "open",
            detected_at: v.detected_at,
          }))
        )
        .then(({ error }) => {
          if (error) {
            fastify.log.error(
              { error, count: byType.sast.length },
              "Failed to store SAST vulnerabilities"
            );
            throw error;
          }
          fastify.log.info(
            { count: byType.sast.length },
            "Stored SAST vulnerabilities"
          );
        })
    );
  }

  // SCA vulnerabilities
  if (byType.sca.length > 0) {
    insertPromises.push(
      fastify.supabase
        .from("vulnerabilities_sca")
        .insert(
          byType.sca.map((v) => ({
            scan_id: scanId,
            user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
            repository_id: repositoryId,
            scanner: v.scanner,
            type: v.type,
            severity: v.severity,
            title: v.title,
            description: v.description,
            package_name: v.metadata?.package_name || "unknown",
            package_version: v.metadata?.package_version || "unknown",
            fixed_version: v.metadata?.fixed_version,
            ecosystem: v.metadata?.ecosystem || "unknown",
            rule_id: v.rule_id,
            dedup_key: generateDedupKey(v, scanId),
            cve: v.cve,
            cwe: v.cwe,
            owasp: v.owasp,
            confidence: v.confidence,
            recommendation: getEnrichment(
              v.id,
              "remediation",
              v.recommendation
            ),
            reference: v.references,
            ai_remediation: getEnrichment(v.id, "remediation"),
            ai_business_impact: getEnrichment(v.id, "business_impact"),
            ai_risk_score: getEnrichment(v.id, "risk_score"),
            metadata: v.metadata,
            status: "open",
            detected_at: v.detected_at,
          }))
        )
        .then(({ error }) => {
          if (error) {
            fastify.log.error(
              { error, count: byType.sca.length },
              "Failed to store SCA vulnerabilities"
            );
            throw error;
          }
          fastify.log.info(
            { count: byType.sca.length },
            "Stored SCA vulnerabilities"
          );
        })
    );
  }

  // Secrets vulnerabilities
  if (byType.secret.length > 0) {
    insertPromises.push(
      fastify.supabase
        .from("vulnerabilities_secrets")
        .insert(
          byType.secret.map((v) => ({
            scan_id: scanId,
            user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
            repository_id: repositoryId,
            scanner: v.scanner,
            type: v.type,
            severity: v.severity,
            title: v.title,
            description: v.description,
            file_path: v.file_path,
            line_start: v.line_start,
            line_end: v.line_end,
            code_snippet: v.code_snippet,
            rule_id: v.rule_id,
            dedup_key: generateDedupKey(v, scanId),
            secret_type: v.metadata?.secret_type,
            entropy: v.metadata?.entropy,
            cwe: v.cwe,
            owasp: v.owasp,
            confidence: v.confidence,
            recommendation: getEnrichment(
              v.id,
              "remediation",
              v.recommendation
            ),
            reference: v.references,
            ai_remediation: getEnrichment(v.id, "remediation"),
            ai_business_impact: getEnrichment(v.id, "business_impact"),
            metadata: v.metadata,
            status: "open",
            detected_at: v.detected_at,
          }))
        )
        .then(({ error }) => {
          if (error) {
            fastify.log.error(
              { error, count: byType.secret.length },
              "Failed to store Secrets vulnerabilities"
            );
            throw error;
          }
          fastify.log.info(
            { count: byType.secret.length },
            "Stored Secrets vulnerabilities"
          );
        })
    );
  }

  // IaC vulnerabilities
  if (byType.iac.length > 0) {
    insertPromises.push(
      fastify.supabase
        .from("vulnerabilities_iac")
        .insert(
          byType.iac.map((v) => ({
            scan_id: scanId,
            user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
            repository_id: repositoryId,
            scanner: v.scanner,
            type: v.type,
            severity: v.severity,
            title: v.title,
            description: v.description,
            file_path: v.file_path,
            line_start: v.line_start,
            line_end: v.line_end,
            code_snippet: v.code_snippet,
            rule_id: v.rule_id,
            dedup_key: generateDedupKey(v, scanId),
            resource_type: v.metadata?.resource_type,
            cwe: v.cwe,
            owasp: v.owasp,
            confidence: v.confidence,
            recommendation: getEnrichment(
              v.id,
              "remediation",
              v.recommendation
            ),
            reference: v.references,
            ai_remediation: getEnrichment(v.id, "remediation"),
            ai_business_impact: getEnrichment(v.id, "business_impact"),
            metadata: v.metadata,
            status: "open",
            detected_at: v.detected_at,
          }))
        )
        .then(({ error }) => {
          if (error) {
            fastify.log.error(
              { error, count: byType.iac.length },
              "Failed to store IaC vulnerabilities"
            );
            throw error;
          }
          fastify.log.info(
            { count: byType.iac.length },
            "Stored IaC vulnerabilities"
          );
        })
    );
  }

  // Container vulnerabilities
  if (byType.container.length > 0) {
    insertPromises.push(
      fastify.supabase
        .from("vulnerabilities_container")
        .insert(
          byType.container.map((v) => ({
            scan_id: scanId,
            user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
            repository_id: repositoryId,
            scanner: v.scanner,
            type: v.type,
            severity: v.severity,
            title: v.title,
            description: v.description,
            image_name: v.metadata?.image_name || "unknown",
            package_name: v.metadata?.package_name,
            installed_version: v.metadata?.installed_version,
            fixed_version: v.metadata?.fixed_version,
            cve: v.cve,
            cwe: v.cwe,
            owasp: v.owasp,
            confidence: v.confidence,
            recommendation: getEnrichment(
              v.id,
              "remediation",
              v.recommendation
            ),
            reference: v.references,
            ai_remediation: getEnrichment(v.id, "remediation"),
            ai_business_impact: getEnrichment(v.id, "business_impact"),
            metadata: v.metadata,
            status: "open",
            detected_at: v.detected_at,
          }))
        )
        .then(({ error }) => {
          if (error) {
            fastify.log.error(
              { error, count: byType.container.length },
              "Failed to store Container vulnerabilities"
            );
            throw error;
          }
          fastify.log.info(
            { count: byType.container.length },
            "Stored Container vulnerabilities"
          );
        })
    );
  }

  // Execute all inserts with comprehensive error handling
  fastify.log.info({ 
    totalPromises: insertPromises.length,
    scanId 
  }, '📦 Executing vulnerability inserts');
  
  try {
    await Promise.all(insertPromises);
    fastify.log.info({ scanId }, '✅ All vulnerability inserts completed successfully');
  } catch (error: any) {
    fastify.log.error({ 
      error, 
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      scanId 
    }, '❌ CRITICAL: Failed to store vulnerabilities');
    throw error;
  }
}

function calculateSeverityCounts(vulnerabilities: any[]) {
  return {
    critical: vulnerabilities.filter((v) => v.severity === "critical").length,
    high: vulnerabilities.filter((v) => v.severity === "high").length,
    medium: vulnerabilities.filter((v) => v.severity === "medium").length,
    low: vulnerabilities.filter((v) => v.severity === "low").length,
    info: vulnerabilities.filter((v) => v.severity === "info").length,
  };
}

function calculateScanMetrics(scanResults: any) {
  const metrics = {
    semgrepDuration: 0,
    osvDuration: 0,
    gitleaksDuration: 0,
    checkovDuration: 0,
    trivyDuration: 0,
    totalDuration: 0,
  };

  for (const result of scanResults.results) {
    metrics.totalDuration += result.metadata.duration_ms;

    if (result.scanner === "semgrep")
      metrics.semgrepDuration = result.metadata.duration_ms;
    if (result.scanner === "osv")
      metrics.osvDuration = result.metadata.duration_ms;
    if (result.scanner === "gitleaks")
      metrics.gitleaksDuration = result.metadata.duration_ms;
    if (result.scanner === "checkov")
      metrics.checkovDuration = result.metadata.duration_ms;
    if (result.scanner === "trivy")
      metrics.trivyDuration = result.metadata.duration_ms;
  }

  return metrics;
}
