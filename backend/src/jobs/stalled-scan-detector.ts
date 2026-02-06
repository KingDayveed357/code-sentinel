// src/jobs/stalled-scan-detector.ts
import type { FastifyInstance } from 'fastify';

/**
 * Detects and fails scans that have been stuck in pending/running status
 * for longer than the threshold without any progress.
 * 
 * This prevents scans from being stuck indefinitely due to:
 * - Worker crashes
 * - Redis connection issues
 * - Job queue failures
 * - Unexpected errors
 */
export async function detectAndFailStalledScans(
  fastify: FastifyInstance
): Promise<{ failed: number; scans: any[] }> {
  const STALL_THRESHOLD_MINUTES = 10; // 1 hour
  const thresholdTime = new Date(Date.now() - STALL_THRESHOLD_MINUTES * 60 * 1000);

  fastify.log.info('🔍 Checking for stalled scans...');

  // Find scans that have been in progress states for too long
  const { data: stalledScans, error } = await fastify.supabase
    .from('scans')
    .select('id, status, created_at, started_at, repository_id, scan_type')
    .in('status', ['pending', 'running', 'normalizing', 'ai_enriching'])
    .lt('created_at', thresholdTime.toISOString());

  if (error) {
    fastify.log.error({ error }, 'Failed to query for stalled scans');
    throw error;
  }

  if (!stalledScans || stalledScans.length === 0) {
    fastify.log.info('✅ No stalled scans found');
    return { failed: 0, scans: [] };
  }

  fastify.log.warn(
    { count: stalledScans.length },
    `⚠️ Found ${stalledScans.length} stalled scans`
  );

  // Fail each stalled scan
  const failedScans = [];
  for (const scan of stalledScans) {
    const ageMinutes = Math.floor(
      (Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000)
    );

    try {
      // Update scan status to failed
      await fastify.supabase
        .from('scans')
        .update({
          status: 'failed',
          error_message: `Scan stalled - exceeded ${STALL_THRESHOLD_MINUTES} minutes without completion (age: ${ageMinutes} minutes)`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scan.id);

      // Log the failure
      await fastify.supabase.from('scan_logs').insert({
        scan_id: scan.id,
        level: 'error',
        message: 'Scan marked as failed due to stalling',
        details: {
          stall_threshold_minutes: STALL_THRESHOLD_MINUTES,
          age_minutes: ageMinutes,
          original_status: scan.status,
          created_at: scan.created_at,
          started_at: scan.started_at,
        },
      });

      fastify.log.warn(
        {
          scanId: scan.id,
          status: scan.status,
          ageMinutes,
        },
        `❌ Failed stalled scan: ${scan.id}`
      );

      failedScans.push(scan);
    } catch (err: any) {
      fastify.log.error(
        { err, scanId: scan.id },
        'Failed to mark scan as failed'
      );
    }
  }

  fastify.log.info(
    { failed: failedScans.length },
    `✅ Marked ${failedScans.length} stalled scans as failed`
  );

  return {
    failed: failedScans.length,
    scans: failedScans,
  };
}

/**
 * Detects scans that are pending but have no corresponding job in the queue.
 * This can happen if the job was lost due to Redis restart or other issues.
 */
export async function detectOrphanedPendingScans(
  fastify: FastifyInstance
): Promise<{ failed: number; scans: any[] }> {
  const ORPHAN_THRESHOLD_MINUTES = 10; // If pending for >10 minutes, likely orphaned
  const thresholdTime = new Date(Date.now() - ORPHAN_THRESHOLD_MINUTES * 60 * 1000);

  fastify.log.info('🔍 Checking for orphaned pending scans...');

  const { data: orphanedScans, error } = await fastify.supabase
    .from('scans')
    .select('id, created_at, repository_id')
    .eq('status', 'pending')
    .lt('created_at', thresholdTime.toISOString());

  if (error) {
    fastify.log.error({ error }, 'Failed to query for orphaned scans');
    throw error;
  }

  if (!orphanedScans || orphanedScans.length === 0) {
    fastify.log.info('✅ No orphaned pending scans found');
    return { failed: 0, scans: [] };
  }

  // Check if these scans have jobs in the queue
  const queue = fastify.jobQueue['queues'].get('scans');
  if (!queue) {
    fastify.log.warn('Queue not found, skipping orphan detection');
    return { failed: 0, scans: [] };
  }

  const failedScans = [];
  for (const scan of orphanedScans) {
    const ageMinutes = Math.floor(
      (Date.now() - new Date(scan.created_at).getTime()) / (60 * 1000)
    );

    try {
      // Try to find the job in the queue
      const jobs = await queue.getJobs(['waiting', 'active', 'delayed']);
      const hasJob = jobs.some((job: any) => job.data.scanId === scan.id);

      if (!hasJob) {
        // No job found - this is an orphaned scan
        await fastify.supabase
          .from('scans')
          .update({
            status: 'failed',
            error_message: `Scan orphaned - no job found in queue after ${ageMinutes} minutes`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', scan.id);

        await fastify.supabase.from('scan_logs').insert({
          scan_id: scan.id,
          level: 'error',
          message: 'Scan marked as failed - orphaned (no queue job)',
          details: {
            age_minutes: ageMinutes,
            created_at: scan.created_at,
          },
        });

        fastify.log.warn(
          { scanId: scan.id, ageMinutes },
          `❌ Failed orphaned scan: ${scan.id}`
        );

        failedScans.push(scan);
      }
    } catch (err: any) {
      fastify.log.error(
        { err, scanId: scan.id },
        'Failed to check/fail orphaned scan'
      );
    }
  }

  if (failedScans.length > 0) {
    fastify.log.info(
      { failed: failedScans.length },
      `✅ Marked ${failedScans.length} orphaned scans as failed`
    );
  }

  return {
    failed: failedScans.length,
    scans: failedScans,
  };
}

/**
 * Combined detector that runs both stalled and orphaned scan detection
 */
export async function runScanHealthCheck(
  fastify: FastifyInstance
): Promise<{ totalFailed: number }> {
  try {
    const [stalledResult, orphanedResult] = await Promise.all([
      detectAndFailStalledScans(fastify),
      detectOrphanedPendingScans(fastify),
    ]);

    const totalFailed = stalledResult.failed + orphanedResult.failed;

    if (totalFailed > 0) {
      fastify.log.warn(
        {
          stalled: stalledResult.failed,
          orphaned: orphanedResult.failed,
          total: totalFailed,
        },
        `⚠️ Scan health check: ${totalFailed} scans failed`
      );
    } else {
      fastify.log.info('✅ Scan health check: All scans healthy');
    }

    return { totalFailed };
  } catch (err: any) {
    fastify.log.error({ err }, 'Scan health check failed');
    throw err;
  }
}
