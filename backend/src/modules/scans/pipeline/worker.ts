// src/modules/scans/pipeline/worker.ts
// Vulnerabilities are written ONLY via processUnifiedVulnerabilities (deduplication-processor).

import type { FastifyInstance } from "fastify";
import type { Job } from "bullmq";
import type { ScanJobPayload } from "../../../utils/queue/job-queue";
import { ProgressTracker } from "./utils/progress";
import { autoCreateIssuesForScan } from "../../github-issues/service";
import { EntitlementsService } from "../../entitlements/service";
import { asyncRmdir, asyncFileExists } from "../../../utils/async-exec";
import { checkScanCache, cloneScanResults } from "./utils/cache";
import {
  fetchRepoAndResolveCommit,
  prepareWorkspace,
  type ScanLogger
} from "./steps/fetch-code";
import {
    runScanners,
    calculateScanMetrics
} from "./steps/run-scanners";
import { processUnifiedVulnerabilities, autoFixMissingVulnerabilities } from "./steps/deduplicate";
import { completeScan } from "./steps/complete-scan";

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
  const { scanId, repositoryId, workspaceId, branch, enabledScanners } = job.data;
  const entitlementsService = new EntitlementsService(fastify);

  let workspacePath: string | null = null;
  const logs: ScanLog[] = [];

  // ✅ PRODUCTION FIX: Add timeout protection
  const SCAN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const scanStartTime = Date.now();
  let timeoutCheckInterval: NodeJS.Timeout | null = null;

  // Helper to log and store to database
  const addLog: ScanLogger = async (
    level,
    message,
    details?
  ) => {
    const log: ScanLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };
    logs.push(log);

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

    // --- Pipeline step 1: Timeout guard ---
    timeoutCheckInterval = setInterval(async () => {
      const elapsed = Date.now() - scanStartTime;
      if (elapsed > SCAN_TIMEOUT_MS) {
        await addLog("error", "Scan timeout - exceeded 30 minutes", {
          elapsed_ms: elapsed,
          timeout_ms: SCAN_TIMEOUT_MS,
        });
        await updateScanStatus(
          fastify,
          scanId,
          "failed",
          "Scan timeout: exceeded 30 minutes"
        );
        if (timeoutCheckInterval) clearInterval(timeoutCheckInterval);
        throw new Error("Scan timeout: exceeded 30 minutes");
      }
    }, 60000); // Check every minute

    await job.updateProgress(5);

    // --- Pipeline step 2: Fetch repo and commit ---
    const { repo, commitHash } = await fetchRepoAndResolveCommit(
      fastify,
      workspaceId,
      repositoryId,
      branch,
      addLog
    );
    await job.updateProgress(10);

    // --- Pipeline step 3: Check cache (exit early if hit) ---
    await addLog("info", "Checking scan cache");
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
      
      const { data: cachedScan, error: cachedScanError } = await fastify.supabase
        .from('scans')
        .select('*')
        .eq('id', cacheResult.scanId)
        .single();
      
      if (!cachedScanError && cachedScan) {
        // ✅ CRITICAL FIX: Properly handle cloning failures
        try {
          // Clone vulnerability_instances
          const { cloned } = await cloneScanResults(fastify, cacheResult.scanId, scanId);
          
          // ✅ VALIDATION: Ensure cloning actually succeeded
          if (cloned === 0) {
            await addLog('warning', '⚠️ Cache cloning returned 0 instances - falling back to full scan', {
              cachedScanId: cacheResult.scanId,
              expectedCount: cachedScan.vulnerabilities_found
            });
            // Fall through to normal scan flow
          } else {
            await addLog('info', `✅ Cloned ${cloned} vulnerability instances from cached scan`);
            
            // ℹ️ NOTE: We clone ALL instances (722) but display unique vulnerability count (7)
            // This is the correct behavior - instances show all locations, unified shows unique issues
            await addLog('info', `📊 Scan summary: ${cachedScan.vulnerabilities_found} unique vulnerabilities found across ${cloned} code locations`, {
              uniqueVulnerabilities: cachedScan.vulnerabilities_found,
              totalInstances: cloned,
              cachedScanId: cacheResult.scanId
            });
            
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
              duration_seconds: 1,
              progress_percentage: 100,
              progress_stage: 'Complete'
            }).eq('id', scanId);
            
            await job.updateProgress(100);
            await addLog('info', '✅ Scan completed using cache', { 
              duration_ms: 1000, 
              cached: true,
              uniqueVulnerabilities: cachedScan.vulnerabilities_found,
              instancesCloned: cloned
            });
            return; // ✅ Only return if cloning succeeded
          }
        } catch (cloneError: any) {
          await addLog('error', `❌ Cache cloning failed: ${cloneError.message}`, {
            error: cloneError.message,
            cachedScanId: cacheResult.scanId,
            stack: cloneError.stack
          });
          // Fall through to normal scan flow
        }
      } else {
        await addLog('warning', '⚠️ Cached scan not found or error fetching - proceeding with full scan', {
          error: cachedScanError?.message
        });
      }
    }

    // --- Pipeline step 4: Fetch code and prepare workspace ---
    const progress = new ProgressTracker(fastify, scanId);
    
    // This now returns null if empty
    const prepResult = await prepareWorkspace(
      fastify,
      scanId,
      workspaceId,
      repo.full_name,
      branch,
      repo.default_branch,
      addLog,
      progress
    );

    if (!prepResult) {
       // Repository is empty
       await progress.emit('complete', 'Scan completed: Repository is empty');
       await fastify.supabase.from('scans').update({
        status: 'failed',
        error_message: 'Repository is empty. Please add code files and try again.',
        completed_at: new Date().toISOString(),
        duration_seconds: 0
      }).eq('id', scanId);
      await job.updateProgress(100);
      return;
    }

    workspacePath = prepResult.workspacePath;
    const directoryStats = prepResult.stats;
    await job.updateProgress(30);

    // --- Pipeline step 5: Run scanners ---
    const scanResults = await runScanners(
      fastify,
      scanId,
      workspacePath,
      enabledScanners,
      commitHash,
      addLog,
      progress,
      job.data.scanType
    );

    const scanMetrics = calculateScanMetrics(scanResults);
    await job.updateProgress(60);

    // Filter successful results
    const results = scanResults.results;

    // Log scanner results
    for (const result of results) {
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
    
    // Store raw scanner outputs
    await Promise.all(
        results.map((result: any) =>
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

    const allVulnerabilities = results.flatMap((r: any) => r.vulnerabilities);
    await job.updateProgress(70);

    // --- Pipeline step 6: Run deduplication (unified + instances) ---
    await updateScanStatus(fastify, scanId, "normalizing");
    await progress.emit("normalizing", "Deduplicating findings across scanners");
    
    // Process unified vulnerabilities
    try {
        await processUnifiedVulnerabilities(
          fastify,
          scanId,
          workspaceId,
          repositoryId,
          allVulnerabilities
        );
        await addLog("info", "Successfully processed unified vulnerabilities");

        const { fixed } = await autoFixMissingVulnerabilities(
            fastify,
            scanId,
            repositoryId
        );
        if (fixed > 0) {
            await addLog("info", `Auto-fixed ${fixed} vulnerabilities that disappeared`);
        }
    } catch (unifiedError: any) {
        await addLog("error", "Failed to process unified vulnerabilities", { error: unifiedError.message });
        throw new Error(`Vulnerability processing failed: ${unifiedError.message}`);
    }

    await job.updateProgress(90);

    // --- Pipeline step 7: Complete scan ---
    const completion = await completeScan(fastify, scanId, {
      commitHash,
      filesScanned: directoryStats.filesScanned,
      linesOfCode: directoryStats.linesOfCode,
      durationSeconds: Math.floor(scanMetrics.totalDuration / 1000),
      scanMetrics,
    });

    await addLog("info", "Scan completed successfully", {
        uniqueVulnerabilities: completion.uniqueVulnCount,
        totalInstances: completion.locationsInThisScan
    });

    await job.updateProgress(95);

    // --- Pipeline step 8: Auto-create GitHub issues ---
    try {
        await addLog("info", "Checking auto-issue creation settings");
        const issueResult = await autoCreateIssuesForScan(fastify, scanId);
        
        if (issueResult.created > 0) {
            await addLog("info", "Auto-created GitHub issues", issueResult);
        } else {
             await addLog("info", "No issues created", { reason: issueResult.skipped > 0 ? "Already exist" : "Not enabled/eligible" });
        }
    } catch (issueError: any) {
        await addLog("warning", "Issue creation failed (non-fatal)", { error: issueError.message });
    }

    await job.updateProgress(100);
    await progress.emit('complete', `Scan complete: ${completion.uniqueVulnCount} unique vulnerabilities found`);

  } catch (error: any) {
    await addLog("error", "Scan job failed", { error: error.message });
    await updateScanStatus(fastify, scanId, "failed", error.message);
    throw error;
  } finally {
    if (timeoutCheckInterval) clearInterval(timeoutCheckInterval);

    try {
      await entitlementsService.trackScanComplete(workspaceId, scanId);
    } catch (err: any) {
      // ignore
    }

    if (workspacePath && (await asyncFileExists(workspacePath))) {
      try {
        await asyncRmdir(workspacePath);
      } catch (e) {
        // ignore
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
  if (status === "running") {
    updates.started_at = new Date().toISOString();
    updates.progress_percentage = 0;
    updates.progress_stage = "Starting scan...";
  }
  if (status === "normalizing") {
    updates.progress_percentage = 75;
    updates.progress_stage = "Finalizing results...";
  }
  if (errorMessage) {
    updates.error_message = errorMessage;
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await fastify.supabase
    .from("scans")
    .update(updates)
    .eq("id", scanId);

  if (error) {
    fastify.log.error(
      { error, scanId, status },
      `Failed to update scan status to ${status}`
    );
     // Don't throw to avoid loop
  }
}
