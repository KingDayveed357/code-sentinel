// src/modules/scans/service.ts
import type { FastifyInstance } from 'fastify';
import type { ScanRun } from './types';
import { EntitlementsService } from '../entitlements/service';

export async function startScan(
  fastify: FastifyInstance,
  userId: string,
  userPlan: string,
  repositoryId: string,
  branch: string,
  scanType: 'quick' | 'full' | 'custom'
): Promise<{ scan_id: string; status: string; message: string }> {

    const entitlements = new EntitlementsService(fastify);

  //  Check limits FIRST
  const limitCheck = await entitlements.checkScanLimit(userId, userPlan);

  if (!limitCheck.allowed) {
    throw fastify.httpErrors.forbidden({
      code: limitCheck.type === 'monthly' 
        ? 'MONTHLY_SCAN_LIMIT_REACHED' 
        : 'CONCURRENT_SCAN_LIMIT_REACHED',
      limit_type: limitCheck.type,
      current: limitCheck.current,
      limit: limitCheck.limit,
      message: limitCheck.message,
      upgrade_url: '/dashboard/billing',
    });
  }


  // Validate repository
  const { data: repo, error: repoError } = await fastify.supabase
    .from('repositories')
    .select('id, full_name, status')
    .eq('id', repositoryId)
    .eq('user_id', userId)
    .single();

  if (repoError || !repo) {
    throw fastify.httpErrors.notFound('Repository not found');
  }

  if (repo.status !== 'active') {
    throw fastify.httpErrors.badRequest('Repository is not active');
  }

  // Check concurrent scan limits
  const concurrentLimit = getConcurrentScanLimit(userPlan);

  const { count: runningScanCount } = await fastify.supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'running', 'normalizing', 'ai_enriching']);

  if ((runningScanCount || 0) >= concurrentLimit) {
    throw fastify.httpErrors.tooManyRequests(
      `Maximum ${concurrentLimit} concurrent scans allowed for ${userPlan} plan`
    );
  }

  // Determine enabled scanners based on scan type
  const enabledScanners = {
    sast: true,
    sca: scanType === 'full',
    secrets: true,
    iac: scanType === 'full',
    container: scanType === 'full',
  };

  // Create scan record
  const { data: scan, error: scanError } = await fastify.supabase
    .from('scans')
    .insert({
      user_id: userId,
      repository_id: repositoryId,
      branch,
      scan_type: scanType,
      status: 'pending',
      sast_enabled: enabledScanners.sast,
      sca_enabled: enabledScanners.sca,
      secrets_enabled: enabledScanners.secrets,
      iac_enabled: enabledScanners.iac,
      container_enabled: enabledScanners.container,
    })
    .select()
    .single();

  if (scanError || !scan) {
    fastify.log.error({ scanError }, 'Failed to create scan');
    throw fastify.httpErrors.internalServerError('Failed to create scan');
  }


  //  Track usage IMMEDIATELY (before enqueue to avoid race)
  await entitlements.trackScanStart(userId, scan.id);
  // Enqueue scan job
  await fastify.jobQueue.enqueue('scans', 'process-scan', {
    scanId: scan.id,
    repositoryId,
    userId,
    branch,
    scanType,
    enabledScanners,
  });

  fastify.log.info({ scanId: scan.id }, 'Scan job enqueued');

  return {
    scan_id: scan.id,
    status: 'pending',
    message: 'Scan initiated successfully',
  };
}

export async function getScanLogs(
  fastify: FastifyInstance,
  userId: string,
  scanId: string
): Promise<{
  logs: Array<{
    id: string;
    timestamp: string;
    level: string;
    message: string;
    details: any;
  }>;
}> {
  // Verify scan belongs to user
  const { data: scan } = await fastify.supabase
    .from('scans')
    .select('id')
    .eq('id', scanId)
    .eq('user_id', userId)
    .single();

  if (!scan) {
    throw fastify.httpErrors.notFound('Scan not found');
  }

  const { data: logs, error } = await fastify.supabase
    .from('scan_logs')
    .select('*')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: true });

  if (error) {
    fastify.log.error({ error, scanId }, 'Failed to fetch scan logs');
    throw fastify.httpErrors.internalServerError('Failed to fetch scan logs');
  }

  return { logs: logs || [] };
}

export async function getScanHistory(
  fastify: FastifyInstance,
  userId: string,
  repositoryId: string,
  page: number,
  limit: number
): Promise<{
  scans: ScanRun[];
  total: number;
  page: number;
  pages: number;
}> {
  const offset = (page - 1) * limit;

  const { data, error, count } = await fastify.supabase
    .from('scans')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('repository_id', repositoryId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    fastify.log.error({ error, repositoryId }, 'Failed to fetch scan history');
    throw fastify.httpErrors.internalServerError('Failed to fetch scan history');
  }

  return {
    scans: (data as ScanRun[]) || [],
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / limit),
  };
}

export async function getScanStatus(
  fastify: FastifyInstance,
  userId: string,
  scanId: string
): Promise<{
  scan: ScanRun;
  summary: {
    total_issues: number;
    by_type: {
      sast: number;
      sca: number;
      secrets: number;
      iac: number;
      container: number;
    };
    by_severity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
    };
  };
}> {
  const { data: scan, error: scanError } = await fastify.supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .eq('user_id', userId)
    .single();

  if (scanError || !scan) {
    throw fastify.httpErrors.notFound('Scan not found');
  }

  // Count vulnerabilities by type
  const [sastCount, scaCount, secretsCount, iacCount, containerCount] =
    await Promise.all([
      countVulnerabilities(fastify, scanId, 'vulnerabilities_sast'),
      countVulnerabilities(fastify, scanId, 'vulnerabilities_sca'),
      countVulnerabilities(fastify, scanId, 'vulnerabilities_secrets'),
      countVulnerabilities(fastify, scanId, 'vulnerabilities_iac'),
      countVulnerabilities(fastify, scanId, 'vulnerabilities_container'),
    ]);

  const summary = {
    total_issues: scan.vulnerabilities_found || 0,
    by_type: {
      sast: sastCount,
      sca: scaCount,
      secrets: secretsCount,
      iac: iacCount,
      container: containerCount,
    },
    by_severity: {
      critical: scan.critical_count || 0,
      high: scan.high_count || 0,
      medium: scan.medium_count || 0,
      low: scan.low_count || 0,
      info: scan.info_count || 0,
    },
  };

  return {
    scan: scan as ScanRun,
    summary,
  };
}

export async function exportScanResults(
  fastify: FastifyInstance,
  userId: string,
  scanId: string,
  format: 'json' | 'csv' | 'pdf'
): Promise<any> {
  const { scan, summary } = await getScanStatus(fastify, userId, scanId);

  // Fetch all vulnerabilities
  const [sast, sca, secrets, iac, container] = await Promise.all([
    getVulnerabilitiesForExport(fastify, scanId, 'vulnerabilities_sast'),
    getVulnerabilitiesForExport(fastify, scanId, 'vulnerabilities_sca'),
    getVulnerabilitiesForExport(fastify, scanId, 'vulnerabilities_secrets'),
    getVulnerabilitiesForExport(fastify, scanId, 'vulnerabilities_iac'),
    getVulnerabilitiesForExport(fastify, scanId, 'vulnerabilities_container'),
  ]);

  const allVulns = [...sast, ...sca, ...secrets, ...iac, ...container];

  if (format === 'json') {
    return {
      scan: {
        id: scan.id,
        repository_id: scan.repository_id,
        branch: scan.branch,
        status: scan.status,
        created_at: scan.created_at,
        completed_at: scan.completed_at,
      },
      summary,
      vulnerabilities: allVulns,
    };
  }

  if (format === 'csv') {
    const csv = convertToCSV(allVulns);
    return csv;
  }

  // PDF format would require additional library
  throw fastify.httpErrors.notImplemented('PDF export not yet implemented');
}

export async function cancelScan(
  fastify: FastifyInstance,
  userId: string,
  scanId: string
): Promise<{ success: boolean; message: string }> {
  const { data: scan, error } = await fastify.supabase
    .from('scans')
    .select('status')
    .eq('id', scanId)
    .eq('user_id', userId)
    .single();

  if (error || !scan) {
    throw fastify.httpErrors.notFound('Scan not found');
  }

  if (scan.status === 'completed' || scan.status === 'failed') {
    throw fastify.httpErrors.badRequest('Cannot cancel completed or failed scan');
  }

  await fastify.supabase
    .from('scans')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', scanId);

  return {
    success: true,
    message: 'Scan cancelled successfully',
  };
}

async function countVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  table: string
): Promise<number> {
  const { count } = await fastify.supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('scan_id', scanId);

  return count || 0;
}

async function getVulnerabilitiesForExport(
  fastify: FastifyInstance,
  scanId: string,
  table: string
): Promise<any[]> {
  const { data } = await fastify.supabase
    .from(table)
    .select('*')
    .eq('scan_id', scanId);

  return data || [];
}

function convertToCSV(vulnerabilities: any[]): string {
  if (vulnerabilities.length === 0) return '';

  const headers = [
    'Severity',
    'Type',
    'Title',
    'File',
    'Line',
    'Status',
    'Detected At',
  ];

  const rows = vulnerabilities.map(v => [
    v.severity,
    v.type,
    v.title,
    v.file_path || v.file || '',
    v.line_start || v.line || '',
    v.status,
    new Date(v.detected_at).toISOString(),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  return csv;
}


function getConcurrentScanLimit(plan: string): number {
  const limits: Record<string, number> = {
    Free: 5,
    Dev: 3,
    Team: 10,
    Enterprise: 50,
  };
  return limits[plan] || 1;
}
