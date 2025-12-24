
// // src/modules/scans/worker.ts (OPTIMIZED - Non-blocking + Smart AI)

// import type { FastifyInstance } from 'fastify';
// import type { Job } from 'bullmq';
// import type { ScanJobPayload } from '../../utils/queue/job-queue';
// import { fetchRepositoryCode } from '../integrations/github/service';
// import { ScannerOrchestrator } from '../../scanners/orchestrator';
// import { DeduplicationService } from '../../ai/deduplication';
// import { SmartAIEnrichmentService } from '../../ai/enrichment';
// // import { NotificationService } from '../notifications/notification.service';
// import { ScanSettingsService } from '../settings/scan-settings/service';
// import * as fs from 'fs';
// import * as path from 'path';
// import * as os from 'os';

// export async function processScanJob(
//   fastify: FastifyInstance,
//   job: Job<ScanJobPayload>
// ): Promise<void> {
//   const { scanId, repositoryId, userId, branch, enabledScanners } = job.data;
  
//   // Initialize services
//   const deduplicationService = new DeduplicationService(fastify);
//   const aiService = new SmartAIEnrichmentService(fastify);
//   // const notificationService = new NotificationService(fastify);
//   const settingsService = new ScanSettingsService(fastify);
  
//   let workspacePath: string | null = null;

//   try {
//     await updateScanStatus(fastify, scanId, 'running');
//     fastify.log.info({ scanId, jobId: job.id }, 'Starting scan job');
//     await job.updateProgress(10);

//     // Fetch repository metadata
//     const { data: repo, error: repoError } = await fastify.supabase
//       .from('repositories')
//       .select('full_name, default_branch')
//       .eq('id', repositoryId)
//       .single();

//     if (repoError || !repo) {
//       throw new Error('Repository not found');
//     }

//     await job.updateProgress(20);

//     // Fetch repository code
//     fastify.log.info({ scanId, repo: repo.full_name }, 'Fetching repository code');
//     const repoFiles = await fetchRepositoryCode(
//       fastify,
//       userId,
//       repo.full_name,
//       branch || repo.default_branch
//     );

//     if (repoFiles.length === 0) {
//       throw new Error('No code files found in repository');
//     }

//     await job.updateProgress(40);

//     // Create workspace
//     workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), `scan-${scanId}-`));
//     fastify.log.info({ scanId, workspacePath, files: repoFiles.length }, 'Workspace created');

//     for (const file of repoFiles) {
//       const fullPath = path.join(workspacePath, file.path);
//       const dir = path.dirname(fullPath);
//       fs.mkdirSync(dir, { recursive: true });
//       fs.writeFileSync(fullPath, file.content, { encoding: 'utf8' });
//     }

//     await job.updateProgress(50);

//     // Run scanners (ASYNC - doesn't block other requests)
//     fastify.log.info({ scanId }, 'Running security scanners');
//     const orchestrator = new ScannerOrchestrator(fastify);
//     const scanResults = await orchestrator.scanAll(workspacePath, scanId, enabledScanners);

//     await job.updateProgress(70);

//     // Store raw scanner outputs (for debugging)
//     await Promise.all(
//       scanResults.results.map(result =>
//         fastify.supabase.from('scanner_outputs').insert({
//           scan_id: scanId,
//           scanner: result.scanner,
//           raw_output: {
//             success: result.success,
//             vulnerabilities: result.vulnerabilities.length,
//             errors: result.errors,
//           },
//           execution_time_ms: result.metadata.duration_ms,
//           exit_code: result.success ? 0 : 1,
//         })
//       )
//     );

//     const allVulnerabilities = scanResults.results.flatMap(r => r.vulnerabilities);
//     fastify.log.info({ scanId, total: allVulnerabilities.length }, 'Raw vulnerabilities collected');

//     // STEP 1: Rule-based deduplication (NO AI - saves quota!)
//     await updateScanStatus(fastify, scanId, 'normalizing');
//     const dedupResult = deduplicationService.deduplicate(allVulnerabilities);
//     const dedupStats = deduplicationService.getStats(allVulnerabilities, dedupResult.unique);
    
//     fastify.log.info(dedupStats, 'Deduplication stats');
//     await job.updateProgress(80);

//     // STEP 2: Smart AI enrichment (only critical/high + code context)
//     const aiSettings = await settingsService.getAISettings(userId);
//     let enrichmentResults = new Map();
    
//     if (aiSettings.enabled) {
//       try {
//         await updateScanStatus(fastify, scanId, 'ai_enriching');
//         fastify.log.info(
//           { 
//             scanId, 
//             total: dedupResult.unique.length,
//             minSeverity: aiSettings.minSeverity 
//           },
//           'Starting smart AI enrichment'
//         );
        
//         enrichmentResults = await aiService.enrichBatch(dedupResult.unique);
        
//         fastify.log.info(
//           {
//             scanId,
//             total: dedupResult.unique.length,
//             enriched: enrichmentResults.size,
//           },
//           'AI enrichment completed'
//         );
//       } catch (aiError: any) {
//         fastify.log.error({ scanId, error: aiError.message }, 'AI enrichment failed - continuing');
//       }
//     } else {
//       fastify.log.info({ scanId }, 'AI enrichment disabled by user settings');
//     }

//     await job.updateProgress(90);

//     // STEP 3: Store vulnerabilities
//     await storeVulnerabilities(
//       fastify,
//       scanId,
//       userId,
//       repositoryId,
//       dedupResult.unique,
//       enrichmentResults
//     );

//     // Calculate metrics
//     const severityCounts = calculateSeverityCounts(dedupResult.unique);
//     const scanMetrics = calculateScanMetrics(scanResults);

//     // Update scan record
//     await fastify.supabase
//       .from('scans')
//       .update({
//         status: 'completed',
//         completed_at: new Date().toISOString(),
//         vulnerabilities_found: dedupResult.unique.length,
//         critical_count: severityCounts.critical,
//         high_count: severityCounts.high,
//         medium_count: severityCounts.medium,
//         low_count: severityCounts.low,
//         info_count: severityCounts.info,
//         files_scanned: repoFiles.length,
//         lines_of_code: repoFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0),
//         duration_seconds: Math.floor(scanMetrics.totalDuration / 1000),
//       })
//       .eq('id', scanId);

//     // Store detailed metrics
//     await fastify.supabase.from('scan_metrics').insert({
//       scan_id: scanId,
//       semgrep_duration_ms: scanMetrics.semgrepDuration,
//       osv_duration_ms: scanMetrics.osvDuration,
//       gitleaks_duration_ms: scanMetrics.gitleaksDuration,
//       checkov_duration_ms: scanMetrics.checkovDuration,
//       trivy_duration_ms: scanMetrics.trivyDuration,
//       total_files: repoFiles.length,
//       total_lines: repoFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0),
//     });

//     await job.updateProgress(100);

//     // STEP 4: Send notifications (async - doesn't block)
//     // setImmediate(async () => {
//     //   try {
//     //     // Scan complete notification
//     //     await notificationService.notifyScanComplete(userId, scanId, {
//     //       repository: repo.full_name,
//     //       vulnerabilities: dedupResult.unique.length,
//     //       critical: severityCounts.critical,
//     //       high: severityCounts.high,
//     //       duration: scanMetrics.totalDuration,
//     //     });

//     //     // Critical vulnerability alerts
//     //     if (severityCounts.critical > 0) {
//     //       const criticalVulns = dedupResult.unique.filter(v => v.severity === 'critical');
//     //       for (const vuln of criticalVulns.slice(0, 3)) { // Max 3 alerts
//     //         await notificationService.notifyCriticalVulnerability(userId, scanId, {
//     //           title: vuln.title,
//     //           severity: vuln.severity,
//     //           file: vuln.file_path || 'N/A',
//     //           repository: repo.full_name,
//     //         });
//     //       }
//     //     }
//     //   } catch (notifError: any) {
//     //     fastify.log.error({ error: notifError }, 'Notification failed (non-fatal)');
//     //   }
//     // });

//     fastify.log.info(
//       { 
//         scanId, 
//         findings: dedupResult.unique.length,
//         deduplicated: dedupStats.removed_count,
//         duration: scanMetrics.totalDuration 
//       },
//       'Scan completed successfully'
//     );
//   } catch (error: any) {
//     fastify.log.error({ error, scanId }, 'Scan job failed');
//     await updateScanStatus(fastify, scanId, 'failed', error.message);
//     throw error;
//   } finally {
//     // Cleanup workspace
//     if (workspacePath && fs.existsSync(workspacePath)) {
//       try {
//         fs.rmSync(workspacePath, { recursive: true, force: true });
//         fastify.log.info({ scanId, workspacePath }, 'Workspace cleaned up');
//       } catch (cleanupError) {
//         fastify.log.warn({ cleanupError, workspacePath }, 'Failed to cleanup workspace');
//       }
//     }
//   }
// }

// async function updateScanStatus(
//   fastify: FastifyInstance,
//   scanId: string,
//   status: string,
//   errorMessage?: string
// ) {
//   const updates: any = { status };
//   if (status === 'running') updates.started_at = new Date().toISOString();
//   if (errorMessage) updates.error_message = errorMessage;
//   await fastify.supabase.from('scans').update(updates).eq('id', scanId);
// }

// async function storeVulnerabilities(
//   fastify: FastifyInstance,
//   scanId: string,
//   userId: string,
//   repositoryId: string,
//   vulnerabilities: any[],
//   enrichments: Map<string, any>
// ) {
//   const getEnrichment = (vulnId: string, field: string, fallback: any = null) => {
//     const enrichment = enrichments.get(vulnId);
//     return enrichment?.[field] ?? fallback;
//   };

//   // Group by type
//   const byType = {
//     sast: vulnerabilities.filter(v => v.type === 'sast'),
//     sca: vulnerabilities.filter(v => v.type === 'sca'),
//     secret: vulnerabilities.filter(v => v.type === 'secret'),
//     iac: vulnerabilities.filter(v => v.type === 'iac'),
//     container: vulnerabilities.filter(v => v.type === 'container'),
//   };

//   // Store in parallel (FASTER!)
//   await Promise.all([
//     byType.sast.length > 0 && fastify.supabase.from('vulnerabilities_sast').insert(
//       byType.sast.map(v => ({
//         scan_id: scanId,
//         user_id: userId,
//         repository_id: repositoryId,
//         scanner: v.scanner,
//         type: v.type,
//         severity: v.severity,
//         title: v.title,
//         description: v.description,
//         file_path: v.file_path,
//         line_start: v.line_start,
//         line_end: v.line_end,
//         code_snippet: v.code_snippet,
//         rule_id: v.rule_id,
//         cwe: v.cwe?.[0] || null,
//         owasp: v.owasp,
//         confidence: v.confidence,
//         recommendation: getEnrichment(v.id, 'remediation', v.recommendation),
//         reference: v.references,
//         ai_explanation: getEnrichment(v.id, 'explanation'),
//         ai_business_impact: getEnrichment(v.id, 'business_impact'),
//         ai_remediation: getEnrichment(v.id, 'remediation'),
//         ai_patch: getEnrichment(v.id, 'suggested_patch'),
//         ai_risk_score: getEnrichment(v.id, 'risk_score'),
//         ai_priority: getEnrichment(v.id, 'priority'),
//         ai_false_positive_score: getEnrichment(v.id, 'false_positive_score'),
//         metadata: v.metadata,
//         status: 'open',
//       }))
//     ),
//     // Similar for other types (sca, secret, iac, container)
//     // ... (code abbreviated for space)
//   ].filter(Boolean));
// }

// function calculateSeverityCounts(vulnerabilities: any[]) {
//   const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
//   for (const vuln of vulnerabilities) {
//     const severity = vuln.severity?.toLowerCase();
//     if (severity in counts) counts[severity as keyof typeof counts]++;
//   }
//   return counts;
// }

// function calculateScanMetrics(scanResults: any) {
//   const findScanner = (name: string) =>
//     scanResults.results.find((r: any) => r.scanner === name);

//   return {
//     totalDuration: scanResults.totalDuration,
//     semgrepDuration: findScanner('semgrep')?.metadata.duration_ms || 0,
//     osvDuration: findScanner('osv')?.metadata.duration_ms || 0,
//     gitleaksDuration: findScanner('gitleaks')?.metadata.duration_ms || 0,
//     checkovDuration: findScanner('checkov')?.metadata.duration_ms || 0,
//     trivyDuration: findScanner('trivy')?.metadata.duration_ms || 0,
//   };
// }


// src/modules/scans/worker.ts - Updated with Issue Creation
// ===================================================================
import type { FastifyInstance } from 'fastify';
import type { Job } from 'bullmq';
import type { ScanJobPayload } from '../../utils/queue/job-queue';
import { fetchRepositoryCode } from '../integrations/github/service';
import { ScannerOrchestrator } from '../../scanners/orchestrator';
import { DeduplicationService } from '../../ai/deduplication';
import { LightweightAIEnrichmentService } from '../../ai/lightweight-enrichment';
import { autoCreateIssuesForScan } from '../github-issues/service';
import { EntitlementsService } from '../entitlements/service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ScanLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: any;
}

export async function processScanJob(
  fastify: FastifyInstance,
  job: Job<ScanJobPayload>
): Promise<void> {
  const { scanId, repositoryId, workspaceId, branch, enabledScanners } = job.data;
  
   const entitlementsService = new EntitlementsService(fastify);
  const deduplicationService = new DeduplicationService(fastify);
  const aiService = new LightweightAIEnrichmentService(fastify);
  
  let workspacePath: string | null = null;
  const logs: ScanLog[] = [];

  // Helper to log and store to database
  const addLog = async (level: ScanLog['level'], message: string, details?: any) => {
    const log: ScanLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };
    logs.push(log);
    fastify.log[level]({ scanId, ...details }, message);
    
    try {
      await fastify.supabase.from('scan_logs').insert({
        scan_id: scanId,
        level,
        message,
        details: details || {},
      });
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to store scan log');
    }
  };

  try {
    await addLog('info', 'Scan job started', { jobId: job.id });
    await updateScanStatus(fastify, scanId, 'running');
    
    await job.updateProgress(5);

    // Fetch repository metadata
    await addLog('info', 'Fetching repository metadata');
    const { data: repo, error: repoError } = await fastify.supabase
      .from('repositories')
      .select('full_name, default_branch')
      .eq('id', repositoryId)
      .single();

    if (repoError || !repo) {
      throw new Error('Repository not found');
    }
    await job.updateProgress(10);

    // Fetch repository code
    await addLog('info', `Fetching code from ${repo.full_name}`, { branch });
    const repoFiles = await fetchRepositoryCode(
      fastify,
      workspaceId,
      repo.full_name,
      branch || repo.default_branch
    );

    if (repoFiles.length === 0) {
      throw new Error('No code files found in repository');
    }

    await addLog('info', `Downloaded ${repoFiles.length} files`, { fileCount: repoFiles.length });
    await job.updateProgress(20);

    // Create workspace
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), `scan-${scanId}-`));
    await addLog('info', 'Created temporary workspace', { workspacePath });

    for (const file of repoFiles) {
      const fullPath = path.join(workspacePath, file.path);
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, file.content, { encoding: 'utf8' });
    }
    await job.updateProgress(30);

    // Run scanners
    await addLog('info', 'Starting security scanners', {
      enabled: Object.keys(enabledScanners).filter(k => enabledScanners[k]),
    });

    const orchestrator = new ScannerOrchestrator(fastify);
    const scanResults = await orchestrator.scanAll(workspacePath, scanId, enabledScanners);

    await job.updateProgress(60);

    // Log scanner results
    for (const result of scanResults.results) {
      await addLog(
        result.success ? 'info' : 'warning',
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
      scanResults.results.map(result =>
        fastify.supabase.from('scanner_outputs').insert({
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

    const allVulnerabilities = scanResults.results.flatMap(r => r.vulnerabilities);
    await addLog('info', `Found ${allVulnerabilities.length} raw vulnerabilities`);
    await job.updateProgress(70);

    // Deduplication with SUMMARY mode
    await updateScanStatus(fastify, scanId, 'normalizing');
    await addLog('info', 'Starting deduplication (summary mode)');
    
    const dedupResult = deduplicationService.deduplicate(allVulnerabilities, 'summary');
    const dedupStats = deduplicationService.getStats(
      allVulnerabilities,
      dedupResult.unique,
      'summary'
    );
    
    await addLog('info', 'Deduplication completed', {
      original: dedupStats.original_count,
      unique: dedupStats.unique_count,
      reduction: `${dedupStats.deduplication_rate}%`,
    });
    await job.updateProgress(80);

    // Lightweight AI enrichment
    let enrichmentResults = new Map();
    
    try {
      await updateScanStatus(fastify, scanId, 'ai_enriching');
      await addLog('info', 'Starting AI enrichment (lightweight mode)');
      
      enrichmentResults = await aiService.enrichSummaryBatch(dedupResult.unique);
      
      await addLog('info', 'AI enrichment completed', {
        enriched: enrichmentResults.size,
        total: dedupResult.unique.length,
      });
    } catch (aiError: any) {
      await addLog('warning', 'AI enrichment failed, using fallback', {
        error: aiError.message,
      });
      enrichmentResults = new Map();
    }

    await job.updateProgress(90);

    // Store vulnerabilities
    await addLog('info', 'Storing vulnerabilities to database');
    await storeVulnerabilities(
      fastify,
      scanId,
      workspaceId,
      repositoryId,
      dedupResult.unique,
      enrichmentResults
    );

    // Calculate metrics
    const severityCounts = calculateSeverityCounts(dedupResult.unique);
    const scanMetrics = calculateScanMetrics(scanResults);

    // Update scan record
    await fastify.supabase
      .from('scans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        vulnerabilities_found: dedupResult.unique.length,
        critical_count: severityCounts.critical,
        high_count: severityCounts.high,
        medium_count: severityCounts.medium,
        low_count: severityCounts.low,
        info_count: severityCounts.info,
        files_scanned: repoFiles.length,
        lines_of_code: repoFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0),
        duration_seconds: Math.floor(scanMetrics.totalDuration / 1000),
      })
      .eq('id', scanId);

    // Store detailed metrics
    await fastify.supabase.from('scan_metrics').insert({
      scan_id: scanId,
      semgrep_duration_ms: scanMetrics.semgrepDuration,
      osv_duration_ms: scanMetrics.osvDuration,
      gitleaks_duration_ms: scanMetrics.gitleaksDuration,
      checkov_duration_ms: scanMetrics.checkovDuration,
      trivy_duration_ms: scanMetrics.trivyDuration,
      total_files: repoFiles.length,
      total_lines: repoFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0),
    });

    await job.updateProgress(95);

    // ========================================
    // NEW: Auto-create GitHub issues if enabled
    // ========================================
    try {
      await addLog('info', 'Checking auto-issue creation settings');
      
      const issueResult = await autoCreateIssuesForScan(fastify, scanId);
      
      if (issueResult.created > 0) {
        await addLog('info', 'Auto-created GitHub issues', {
          created: issueResult.created,
          skipped: issueResult.skipped,
          failed: issueResult.failed,
        });
      } else {
        await addLog('info', 'No issues created', {
          reason: issueResult.skipped > 0 ? 'Already exist' : 'Not enabled or no eligible vulnerabilities',
        });
      }
    } catch (issueError: any) {
      await addLog('warning', 'Issue creation failed (non-fatal)', {
        error: issueError.message,
      });
    }

    await job.updateProgress(100);
    
    await addLog('info', 'Scan completed successfully', {
      findings: dedupResult.unique.length,
      duration_ms: scanMetrics.totalDuration,
    });

  } catch (error: any) {
    await addLog('error', 'Scan job failed', { error: error.message });
    await updateScanStatus(fastify, scanId, 'failed', error.message);
    throw error;
  } finally {

    try {
      await entitlementsService.trackScanComplete(workspaceId, scanId);
      await addLog('info', 'Concurrent scan count decremented');
    } catch (err: any) {
      await addLog('error', 'Failed to decrement concurrent scans', {
        error: err.message,
        workspaceId,
        scanId,
      });
      // Don't throw - we still want to clean up workspace
    }
    // Cleanup workspace
    if (workspacePath && fs.existsSync(workspacePath)) {
      try {
        fs.rmSync(workspacePath, { recursive: true, force: true });
        await addLog('info', 'Workspace cleaned up');
      } catch (cleanupError) {
        await addLog('warning', 'Failed to cleanup workspace');
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
  if (status === 'running') updates.started_at = new Date().toISOString();
  if (errorMessage) updates.error_message = errorMessage;
  await fastify.supabase.from('scans').update(updates).eq('id', scanId);
}

async function storeVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  workspaceId: string,
  repositoryId: string,
  vulnerabilities: any[],
  enrichments: Map<string, any>
) {
  const getEnrichment = (vulnId: string, field: string, fallback: any = null) => {
    const enrichment = enrichments.get(vulnId);
    return enrichment?.[field] ?? fallback;
  };

  // Group by type
  const byType = {
    sast: vulnerabilities.filter(v => v.type === 'sast'),
    sca: vulnerabilities.filter(v => v.type === 'sca'),
    secret: vulnerabilities.filter(v => v.type === 'secret'),
    iac: vulnerabilities.filter(v => v.type === 'iac'),
    container: vulnerabilities.filter(v => v.type === 'container'),
  };

  fastify.log.info(
    {
      sast: byType.sast.length,
      sca: byType.sca.length,
      secrets: byType.secret.length,
      iac: byType.iac.length,
      container: byType.container.length,
    },
    'Storing vulnerabilities by type'
  );

  // Store in parallel with better error handling
  const insertPromises = [];

  // SAST vulnerabilities
  if (byType.sast.length > 0) {
    insertPromises.push(
      fastify.supabase.from('vulnerabilities_sast').insert(
        byType.sast.map(v => ({
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
          cwe: v.cwe?.[0] || null,
          owasp: v.owasp,
          confidence: v.confidence,
          recommendation: getEnrichment(v.id, 'remediation', v.recommendation),
          reference: v.references,
          ai_explanation: getEnrichment(v.id, 'explanation'),
          ai_business_impact: getEnrichment(v.id, 'business_impact'),
          ai_remediation: getEnrichment(v.id, 'remediation'),
          ai_patch: getEnrichment(v.id, 'suggested_patch'),
          ai_risk_score: getEnrichment(v.id, 'risk_score'),
          ai_priority: getEnrichment(v.id, 'priority'),
          ai_false_positive_score: getEnrichment(v.id, 'false_positive_score'),
          metadata: v.metadata,
          status: 'open',
          detected_at: v.detected_at,
        }))
      ).then(({ error }) => {
        if (error) {
          fastify.log.error({ error, count: byType.sast.length }, 'Failed to store SAST vulnerabilities');
          throw error;
        }
        fastify.log.info({ count: byType.sast.length }, 'Stored SAST vulnerabilities');
      })
    );
  }

  // SCA vulnerabilities
  if (byType.sca.length > 0) {
    insertPromises.push(
      fastify.supabase.from('vulnerabilities_sca').insert(
        byType.sca.map(v => ({
          scan_id: scanId,
          user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
          repository_id: repositoryId,
          scanner: v.scanner,
          type: v.type,
          severity: v.severity,
          title: v.title,
          description: v.description,
          package_name: v.metadata?.package_name || 'unknown',
          package_version: v.metadata?.package_version || 'unknown',
          fixed_version: v.metadata?.fixed_version,
          ecosystem: v.metadata?.ecosystem || 'unknown',
          rule_id: v.rule_id,
          cve: v.cve,
          cwe: v.cwe,
          owasp: v.owasp,
          confidence: v.confidence,
          recommendation: getEnrichment(v.id, 'remediation', v.recommendation),
          reference: v.references,
          ai_remediation: getEnrichment(v.id, 'remediation'),
          ai_business_impact: getEnrichment(v.id, 'business_impact'),
          ai_risk_score: getEnrichment(v.id, 'risk_score'),
          metadata: v.metadata,
          status: 'open',
          detected_at: v.detected_at,
        }))
      ).then(({ error }) => {
        if (error) {
          fastify.log.error({ error, count: byType.sca.length }, 'Failed to store SCA vulnerabilities');
          throw error;
        }
        fastify.log.info({ count: byType.sca.length }, 'Stored SCA vulnerabilities');
      })
    );
  }

  // Secrets vulnerabilities
  if (byType.secret.length > 0) {
    insertPromises.push(
      fastify.supabase.from('vulnerabilities_secrets').insert(
        byType.secret.map(v => ({
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
          secret_type: v.metadata?.secret_type,
          entropy: v.metadata?.entropy,
          cwe: v.cwe,
          owasp: v.owasp,
          confidence: v.confidence,
          recommendation: getEnrichment(v.id, 'remediation', v.recommendation),
          reference: v.references,
          ai_remediation: getEnrichment(v.id, 'remediation'),
          ai_business_impact: getEnrichment(v.id, 'business_impact'),
          metadata: v.metadata,
          status: 'open',
          detected_at: v.detected_at,
        }))
      ).then(({ error }) => {
        if (error) {
          fastify.log.error({ error, count: byType.secret.length }, 'Failed to store Secrets vulnerabilities');
          throw error;
        }
        fastify.log.info({ count: byType.secret.length }, 'Stored Secrets vulnerabilities');
      })
    );
  }

  // IaC vulnerabilities
  if (byType.iac.length > 0) {
    insertPromises.push(
      fastify.supabase.from('vulnerabilities_iac').insert(
        byType.iac.map(v => ({
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
          resource_type: v.metadata?.resource_type,
          cwe: v.cwe,
          owasp: v.owasp,
          confidence: v.confidence,
          recommendation: getEnrichment(v.id, 'remediation', v.recommendation),
          reference: v.references,
          ai_remediation: getEnrichment(v.id, 'remediation'),
          ai_business_impact: getEnrichment(v.id, 'business_impact'),
          metadata: v.metadata,
          status: 'open',
          detected_at: v.detected_at,
        }))
      ).then(({ error }) => {
        if (error) {
          fastify.log.error({ error, count: byType.iac.length }, 'Failed to store IaC vulnerabilities');
          throw error;
        }
        fastify.log.info({ count: byType.iac.length }, 'Stored IaC vulnerabilities');
      })
    );
  }

  // Container vulnerabilities
  if (byType.container.length > 0) {
    insertPromises.push(
      fastify.supabase.from('vulnerabilities_container').insert(
        byType.container.map(v => ({
          scan_id: scanId,
          user_id: workspaceId, // Note: column is user_id but value is workspaceId (migration period)
          repository_id: repositoryId,
          scanner: v.scanner,
          type: v.type,
          severity: v.severity,
          title: v.title,
          description: v.description,
          image_name: v.metadata?.image_name || 'unknown',
          package_name: v.metadata?.package_name,
          installed_version: v.metadata?.installed_version,
          fixed_version: v.metadata?.fixed_version,
          cve: v.cve,
          cwe: v.cwe,
          owasp: v.owasp,
          confidence: v.confidence,
          recommendation: getEnrichment(v.id, 'remediation', v.recommendation),
          reference: v.references,
          ai_remediation: getEnrichment(v.id, 'remediation'),
          ai_business_impact: getEnrichment(v.id, 'business_impact'),
          metadata: v.metadata,
          status: 'open',
          detected_at: v.detected_at,
        }))
      ).then(({ error }) => {
        if (error) {
          fastify.log.error({ error, count: byType.container.length }, 'Failed to store Container vulnerabilities');
          throw error;
        }
        fastify.log.info({ count: byType.container.length }, 'Stored Container vulnerabilities');
      })
    );
  }

  await Promise.all(insertPromises);
}

function calculateSeverityCounts(vulnerabilities: any[]) {
  return {
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    medium: vulnerabilities.filter(v => v.severity === 'medium').length,
    low: vulnerabilities.filter(v => v.severity === 'low').length,
    info: vulnerabilities.filter(v => v.severity === 'info').length,
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

    if (result.scanner === 'semgrep') metrics.semgrepDuration = result.metadata.duration_ms;
    if (result.scanner === 'osv') metrics.osvDuration = result.metadata.duration_ms;
    if (result.scanner === 'gitleaks') metrics.gitleaksDuration = result.metadata.duration_ms;
    if (result.scanner === 'checkov') metrics.checkovDuration = result.metadata.duration_ms;
    if (result.scanner === 'trivy') metrics.trivyDuration = result.metadata.duration_ms;
  }

  return metrics;
}