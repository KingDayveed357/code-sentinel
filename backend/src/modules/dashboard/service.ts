// src/modules/dashboard/service.ts
import type { FastifyInstance } from 'fastify';

export interface DashboardStats {
  total_vulnerabilities: number;
  repositories_scanned: number;
  scans_this_month: number;
  resolution_rate: number;
  changes: {
    vulnerabilities: string;
    repositories: string;
    scans: string;
    resolution: string;
  };
}

export interface CriticalVulnerability {
  id: string;
  severity: 'critical' | 'high';
  title: string;
  repo: string;
  repo_id: string;
  scan_id: string | null;
  detected: string;
  cwe: string;
  type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
}

export interface RecentScan {
  id: string;
  repo: string;
  repo_id: string;
  branch: string;
  status: string;
  vulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  duration: string;
  timestamp: string;
}

export interface SecurityScore {
  overall: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Get dashboard statistics
 * ✅ Refactored to use vulnerabilities_unified as source of truth
 */
export async function getDashboardStats(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<DashboardStats> {
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // 1. Total Vulnerabilities (Open Unique Findings)
  const { count: totalVulnerabilities } = await fastify.supabase
    .from('vulnerabilities_unified')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'open');

  // 2. Fixed Vulnerabilities (For Resolution Rate)
  const { count: totalFixed } = await fastify.supabase
    .from('vulnerabilities_unified')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'fixed');

  const totalIssues = (totalVulnerabilities || 0) + (totalFixed || 0);
  const resolutionRate = totalIssues > 0 ? Math.round(((totalFixed || 0) / totalIssues) * 100) : 0;

  // 3. Last Month Stats (for change calculation)
  const { count: lastMonthOpen } = await fastify.supabase
    .from('vulnerabilities_unified')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .lte('first_detected_at', lastDayLastMonth.toISOString());

  const { count: lastMonthFixed } = await fastify.supabase
    .from('vulnerabilities_unified')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'fixed')
    .lte('resolved_at', lastDayLastMonth.toISOString());

  const lastMonthTotal = (lastMonthOpen || 0) + (lastMonthFixed || 0);
  const lastMonthResolution = lastMonthTotal > 0 ? Math.round(((lastMonthFixed || 0) / lastMonthTotal) * 100) : 0;

  // 4. Repositories
  const { count: repoCount } = await fastify.supabase
    .from('repositories')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');

  const { count: lastMonthRepoCount } = await fastify.supabase
    .from('repositories')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .lte('created_at', lastDayLastMonth.toISOString());

  // 5. Scans
  const { count: scansThisMonth } = await fastify.supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', firstDayThisMonth.toISOString());

  const { count: scansLastMonth } = await fastify.supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', firstDayLastMonth.toISOString())
    .lte('created_at', lastDayLastMonth.toISOString());

  // Calculate changes
  const vulnChange = calculatePercentageChange(lastMonthOpen || 0, totalVulnerabilities || 0);
  const repoChange = (repoCount || 0) - (lastMonthRepoCount || 0);
  const scanChange = calculatePercentageChange(scansLastMonth || 0, scansThisMonth || 0);
  const resolutionChange = resolutionRate - lastMonthResolution;

  return {
    total_vulnerabilities: totalVulnerabilities || 0,
    repositories_scanned: repoCount || 0,
    scans_this_month: scansThisMonth || 0,
    resolution_rate: resolutionRate,
    changes: {
      vulnerabilities: formatChange(vulnChange, true),
      repositories: formatChange(repoChange, false),
      scans: formatChange(scanChange, true),
      resolution: formatChange(resolutionChange, true),
    },
  };
}

/**
 * Get critical vulnerabilities (top 5)
 * ✅ Refactored to query vulnerabilities_unified
 */
export async function getCriticalVulnerabilities(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<CriticalVulnerability[]> {
  const { data: vulns } = await fastify.supabase
    .from('vulnerabilities_unified')
    .select(`
      id, severity, title, scanner_type, first_detected_at, cwe, repository_id,
      repositories:repository_id (id, name)
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
    .in('severity', ['critical', 'high'])
    .order('severity', { ascending: true }) // 'critical' < 'high' alphabetically? No. 'c' < 'h'. Yes. So ascending puts critical first.
    .order('first_detected_at', { ascending: false })
    .limit(5);

  if (!vulns) return [];

  return vulns.map((v: any) => ({
    id: v.id,
    severity: v.severity,
    title: v.title,
    repo: Array.isArray(v.repositories) ? v.repositories[0]?.name : v.repositories?.name || 'Unknown',
    repo_id: v.repository_id,
    scan_id: null,
    detected: formatTimeAgo(v.first_detected_at),
    cwe: v.cwe || 'N/A',
    type: v.scanner_type,
  }));
}

/**
 * Get recent scans (one per project, top 5)
 * ✅ Optimized query
 */
export async function getRecentScans(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<RecentScan[]> {
  // Fetch latest scans across workspace
  const { data: scans } = await fastify.supabase
    .from('scans')
    .select(`
      id, status, branch, vulnerabilities_found, 
      critical_count, high_count, medium_count, low_count,
      duration_seconds, created_at, repository_id,
      repositories:repository_id (id, name)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50); // Fetch enough to find unique repos

  if (!scans) return [];

  const uniqueRepoScans = new Map<string, any>();
  const results: RecentScan[] = [];
  
  for (const scan of scans) {
    const repo = Array.isArray(scan.repositories) ? scan.repositories[0] : scan.repositories;
    if (!repo) continue;
    
    if (!uniqueRepoScans.has(repo.id)) {
      uniqueRepoScans.set(repo.id, true);
      results.push({
        id: scan.id,
        repo: repo.name,
        repo_id: repo.id,
        branch: scan.branch,
        status: scan.status,
        vulnerabilities: scan.vulnerabilities_found || 0,
        critical: scan.critical_count || 0,
        high: scan.high_count || 0,
        medium: scan.medium_count || 0,
        low: scan.low_count || 0,
        duration: scan.duration_seconds 
          ? `${scan.duration_seconds.toFixed(1)}s` 
          : 'N/A',
        timestamp: formatTimeAgo(scan.created_at),
      });
    }
    if (results.length >= 5) break;
  }

  return results;
}

/**
 * Get security score
 * ✅ Refactored to use vulnerabilities_unified
 */
export async function getSecurityScore(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<SecurityScore> {
  const { error, count, data: stats } = await fastify.supabase
    .from('vulnerabilities_unified')
    .select('severity', { count: 'exact' }) // This just gets total count if we don't group. Supabase client doesn't do GROUP BY easily.
    .eq('workspace_id', workspaceId)
    .eq('status', 'open');
  
  // To avoid 4 separate queries, we can fetch all severities (if volume is low) or use RPC.
  // But given standard Supabase usage, 4 count queries is reliable and fast enough if indexed.
  // Actually, let's stick to 4 queries for correctness until we have an RPC.
  
  const severities = ['critical', 'high', 'medium', 'low'];
  const counts: Record<string, number> = {};

  await Promise.all(severities.map(async (sev) => {
    const { count } = await fastify.supabase
      .from('vulnerabilities_unified')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .eq('severity', sev);
    counts[sev] = count || 0;
  }));

  const c = counts.critical || 0;
  const h = counts.high || 0;
  const m = counts.medium || 0;
  const l = counts.low || 0;

  // Calculate overall score (100 - weighted severity penalty)
  const totalIssues = c + h + m + l;
  let score = 100;

  if (totalIssues > 0) {
    const penalty = (c * 20) + (h * 10) + (m * 5) + (l * 2);
    score = Math.max(0, 100 - Math.min(80, penalty));
  }

  return {
    overall: Math.round(score),
    critical: c,
    high: h,
    medium: m,
    low: l,
  };
}

// Helpers
function formatTimeAgo(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

function calculatePercentageChange(oldVal: number, newVal: number): number {
  if (oldVal === 0) return newVal > 0 ? 100 : 0;
  return Math.round(((newVal - oldVal) / oldVal) * 100);
}

function formatChange(val: number, isPercent: boolean): string {
  const sign = val > 0 ? '+' : '';
  const suffix = isPercent ? '%' : '';
  return `${sign}${val}${suffix}`;
}