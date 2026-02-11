// BASE CLASS// src/scanners/base/scanner-interface.ts
import type { FastifyInstance } from 'fastify';

export interface NormalizedVulnerability {
  id: string;
  scan_id: string;
  scanner: 'semgrep' | 'osv' | 'gitleaks' | 'checkov' | 'trivy';
  type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  rule_id: string;
  cwe: string[];
  cve: string | null;
  owasp: string[];
  confidence: number;
  recommendation: string;
  references: string[];
  metadata: Record<string, any>;
  detected_at: string;
}

export interface ScanResult {
  scanner: string;
  success: boolean;
  vulnerabilities: NormalizedVulnerability[];
  errors: Array<{
    message: string;
    file?: string;
    severity: 'warning' | 'error' | 'fatal';
  }>;
  metadata: {
    duration_ms: number;
    files_scanned?: number;
    rules_executed?: number;
    [key: string]: any;
  };
}

export abstract class BaseScanner {
  abstract readonly name: string;
  abstract readonly type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';

  constructor(protected fastify: FastifyInstance) {}

  abstract scan(workspacePath: string, scanId: string, scanType?: 'quick' | 'full'): Promise<ScanResult>;

  protected generateId(): string {
    return crypto.randomUUID();
  }

  protected normalizeSeverity(severity: string): NormalizedVulnerability['severity'] {
    const normalized = severity.toLowerCase();
    if (['critical', 'error'].includes(normalized)) return 'critical';
    if (['high', 'warning'].includes(normalized)) return 'high';
    if (['medium', 'note'].includes(normalized)) return 'medium';
    if (['low', 'style'].includes(normalized)) return 'low';
    return 'info';
  }
}