// lib/api/dashboard.ts
import { apiFetch } from "../api";

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

export interface DashboardOverview {
  stats: DashboardStats;
  critical_vulnerabilities: CriticalVulnerability[];
  recent_scans: RecentScan[];
  security_score: SecurityScore;
}

export const dashboardApi = {
  /**
   * Get complete dashboard overview
   */
  async getOverview(): Promise<DashboardOverview> {
    return apiFetch('/dashboard/overview', { requireAuth: true });
  },

  /**
   * Get dashboard statistics
   */
  async getStats(): Promise<DashboardStats> {
    return apiFetch('/dashboard/stats', { requireAuth: true });
  },

  /**
   * Get critical vulnerabilities
   */
  async getCriticalVulnerabilities(): Promise<{ vulnerabilities: CriticalVulnerability[] }> {
    return apiFetch('/dashboard/critical-vulnerabilities', { requireAuth: true });
  },

  /**
   * Get recent scans
   */
  async getRecentScans(): Promise<{ scans: RecentScan[] }> {
    return apiFetch('/dashboard/recent-scans', { requireAuth: true });
  },

  /**
   * Get security score
   */
  async getSecurityScore(): Promise<SecurityScore> {
    return apiFetch('/dashboard/security-score', { requireAuth: true });
  },
};