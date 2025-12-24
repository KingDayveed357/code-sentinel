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
  scan_id: string;
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
 */
export async function getDashboardStats(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<DashboardStats> {
  const now = new Date();
  const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Total vulnerabilities (all open issues)
  const tables = [
    'vulnerabilities_sast',
    'vulnerabilities_sca',
    'vulnerabilities_secrets',
    'vulnerabilities_iac',
    'vulnerabilities_container',
  ];

  const vulnCounts = await Promise.all(
    tables.map(async (table) => {
      const { count } = await fastify.supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'open');
      return count || 0;
    })
  );

  const totalVulnerabilities = vulnCounts.reduce((sum, c) => sum + c, 0);

  // Last month vulnerabilities for comparison
  const lastMonthVulnCounts = await Promise.all(
    tables.map(async (table) => {
      const { count } = await fastify.supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'open')
        .lte('detected_at', lastDayLastMonth.toISOString());
      return count || 0;
    })
  );

  const lastMonthVulns = lastMonthVulnCounts.reduce((sum, c) => sum + c, 0);

  // Repositories scanned (active repos)
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

  // Scans this month
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

  // Resolution rate (fixed vs total vulnerabilities)
  const fixedCounts = await Promise.all(
    tables.map(async (table) => {
      const { count } = await fastify.supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'fixed');
      return count || 0;
    })
  );

  const totalFixed = fixedCounts.reduce((sum, c) => sum + c, 0);
  const totalIssues = totalVulnerabilities + totalFixed;
  const resolutionRate = totalIssues > 0 ? Math.round((totalFixed / totalIssues) * 100) : 0;

  // Last month resolution rate
  const lastMonthFixedCounts = await Promise.all(
    tables.map(async (table) => {
      const { count } = await fastify.supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'fixed')
        .lte('resolved_at', lastDayLastMonth.toISOString());
      return count || 0;
    })
  );

  const lastMonthFixed = lastMonthFixedCounts.reduce((sum, c) => sum + c, 0);
  const lastMonthTotal = lastMonthVulns + lastMonthFixed;
  const lastMonthResolution = lastMonthTotal > 0 ? Math.round((lastMonthFixed / lastMonthTotal) * 100) : 0;

  // Calculate changes
  const vulnChange = lastMonthVulns > 0 
    ? Math.round(((totalVulnerabilities - lastMonthVulns) / lastMonthVulns) * 100) 
    : 0;
  
  const repoChange = (repoCount || 0) - (lastMonthRepoCount || 0);
  
  const scanChange = scansLastMonth > 0 
    ? Math.round((((scansThisMonth || 0) - scansLastMonth) / scansLastMonth) * 100) 
    : 0;
  
  const resolutionChange = resolutionRate - lastMonthResolution;

  return {
    total_vulnerabilities: totalVulnerabilities,
    repositories_scanned: repoCount || 0,
    scans_this_month: scansThisMonth || 0,
    resolution_rate: resolutionRate,
    changes: {
      vulnerabilities: `${vulnChange > 0 ? '+' : ''}${vulnChange}%`,
      repositories: `${repoChange > 0 ? '+' : ''}${repoChange}`,
      scans: `${scanChange > 0 ? '+' : ''}${scanChange}%`,
      resolution: `${resolutionChange > 0 ? '+' : ''}${resolutionChange}%`,
    },
  };
}

/**
 * Get critical vulnerabilities (top 5)
 */
export async function getCriticalVulnerabilities(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<CriticalVulnerability[]> {
  const tables = [
    { name: 'vulnerabilities_sast', type: 'sast' as const },
    { name: 'vulnerabilities_sca', type: 'sca' as const },
    { name: 'vulnerabilities_secrets', type: 'secrets' as const },
    { name: 'vulnerabilities_iac', type: 'iac' as const },
    { name: 'vulnerabilities_container', type: 'container' as const },
  ];

  const allVulns = await Promise.all(
    tables.map(async ({ name, type }) => {
      const { data } = await fastify.supabase
        .from(name)
        .select('id, severity, title, scan_id, detected_at, cwe, file_path')
        .eq('workspace_id', workspaceId)
        .eq('status', 'open')
        .in('severity', ['critical', 'high'])
        .order('detected_at', { ascending: false })
        .limit(10);

      if (!data) return [];

      return data.map((v) => ({
        ...v,
        type,
      }));
    })
  );

  const flatVulns = allVulns.flat();

  // Get repo info for each vuln
  const vulnsWithRepos = await Promise.all(
    flatVulns.map(async (v) => {
      const { data: scan } = await fastify.supabase
        .from('scans')
        .select('repository_id')
        .eq('id', v.scan_id)
        .single();

      if (!scan) return null;

      const { data: repo } = await fastify.supabase
        .from('repositories')
        .select('id, name')
        .eq('id', scan.repository_id)
        .single();

      if (!repo) return null;

      return {
        id: v.id,
        severity: v.severity as 'critical' | 'high',
        title: v.title,
        repo: repo.name,
        repo_id: repo.id,
        scan_id: v.scan_id,
        detected: formatTimeAgo(v.detected_at),
        cwe: Array.isArray(v.cwe) ? v.cwe[0] : v.cwe || 'N/A',
        type: v.type,
      };
    })
  );

  return vulnsWithRepos
    .filter((v): v is CriticalVulnerability => v !== null)
    .sort((a, b) => {
      if (a.severity === 'critical' && b.severity === 'high') return -1;
      if (a.severity === 'high' && b.severity === 'critical') return 1;
      return 0;
    })
    .slice(0, 5);
}

/**
 * Get recent scans (one per project, top 5)
 */
export async function getRecentScans(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<RecentScan[]> {
  // Get all repos
  const { data: repos } = await fastify.supabase
    .from('repositories')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (!repos || repos.length === 0) return [];

  // Get latest scan for each repo
  const scansWithRepos = await Promise.all(
    repos.map(async (repo) => {
      const { data: scans } = await fastify.supabase
        .from('scans')
        .select('*')
        .eq('repository_id', repo.id)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!scans || scans.length === 0) return null;

      const scan = scans[0];

      return {
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
      };
    })
  );

  return scansWithRepos
    .filter((s): s is RecentScan => s !== null)
    .slice(0, 5);
}

/**
 * Get security score
 */
export async function getSecurityScore(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<SecurityScore> {
  const tables = [
    'vulnerabilities_sast',
    'vulnerabilities_sca',
    'vulnerabilities_secrets',
    'vulnerabilities_iac',
    'vulnerabilities_container',
  ];

  // Count by severity
  const severityCounts = await Promise.all(
    ['critical', 'high', 'medium', 'low'].map(async (severity) => {
      const counts = await Promise.all(
        tables.map(async (table) => {
          const { count } = await fastify.supabase
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .eq('status', 'open')
            .eq('severity', severity);
          return count || 0;
        })
      );
      return { severity, count: counts.reduce((sum, c) => sum + c, 0) };
    })
  );

  const critical = severityCounts.find((s) => s.severity === 'critical')?.count || 0;
  const high = severityCounts.find((s) => s.severity === 'high')?.count || 0;
  const medium = severityCounts.find((s) => s.severity === 'medium')?.count || 0;
  const low = severityCounts.find((s) => s.severity === 'low')?.count || 0;

  // Calculate overall score (100 - weighted severity penalty)
  const totalIssues = critical + high + medium + low;
  let score = 100;

  if (totalIssues > 0) {
    const penalty = (critical * 20) + (high * 10) + (medium * 5) + (low * 2);
    score = Math.max(0, 100 - Math.min(80, penalty));
  }

  return {
    overall: Math.round(score),
    critical,
    high,
    medium,
    low,
  };
}

/**
 * Helper: Format time ago
 */
function formatTimeAgo(dateString: string): string {
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