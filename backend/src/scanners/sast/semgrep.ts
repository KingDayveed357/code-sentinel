// src/scanners/sast/semgrep.ts
// ===================================================================
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { FastifyInstance } from 'fastify';
import {
  BaseScanner,
  ScanResult,
  NormalizedVulnerability,
} from '../base/scanner-interface';

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    metadata: {
      cwe?: string[];
      owasp?: string[];
      category?: string;
      confidence?: string;
    };
    lines: string;
  };
}

export class SemgrepScanner extends BaseScanner {
  readonly name = 'semgrep';
  readonly type = 'sast' as const;

  private readonly configs = [
    'p/ci',
    'p/security-audit',
    'p/owasp-top-ten',
    'p/secrets',
  ];

  async scan(workspacePath: string, scanId: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if Semgrep is installed
      try {
        execSync('semgrep --version', { stdio: 'ignore' });
      } catch {
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: 'Semgrep not installed', severity: 'fatal' }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const command = `semgrep scan --json "${workspacePath}"`;

      let rawOutput = '';

      try {
        rawOutput = execSync(command, {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            LC_ALL: 'en_US.UTF-8',
          },
        });
      } catch (execError: any) {
        // Exit code 1 = findings detected (not a real error)
        if (execError.status === 1 && execError.stdout) {
          rawOutput = execError.stdout.toString();
        } else {
          throw execError;
        }
      }

      const result = JSON.parse(rawOutput);
     

      const vulnerabilities: NormalizedVulnerability[] = [];

      for (const finding of result.results || []) {
        vulnerabilities.push(this.normalizeFinding(finding, workspacePath, scanId));
      }

      return {
        scanner: this.name,
        success: true,
        vulnerabilities,
        errors: (result.errors || []).map((e: any) => ({
          message: e.message,
          file: e.path,
          severity: 'warning' as const,
        })),
        metadata: {
          duration_ms: Date.now() - startTime,
          rules_executed: this.configs.length,
          files_scanned: new Set(vulnerabilities.map((v) => v.file_path)).size,
        },
      };
    } catch (error: any) {
      this.fastify.log.error({ error, scanId }, 'Semgrep scan failed');
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: 'fatal' }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }

  private normalizeFinding(
    finding: SemgrepFinding,
    workspacePath: string,
    scanId: string
  ): NormalizedVulnerability {
    const relativePath = finding.path.replace(workspacePath, '').replace(/^\/+/, '');

    return {
      id: this.generateId(),
      scan_id: scanId,
      scanner: 'semgrep',
      type: 'sast',
      severity: this.normalizeSeverity(finding.extra.severity),
      title: this.extractTitle(finding.check_id),
      description: finding.extra.message,
      file_path: relativePath,
      line_start: finding.start.line,
      line_end: finding.end.line,
      code_snippet: finding.extra.lines,
      rule_id: finding.check_id,
      cwe: finding.extra.metadata.cwe || [],
      cve: null,
      owasp: finding.extra.metadata.owasp || [],
      confidence: this.parseConfidence(finding.extra.metadata.confidence),
      recommendation: '',
      references: [],
      metadata: { category: finding.extra.metadata.category },
      detected_at: new Date().toISOString(),
    };
  }

  private extractTitle(ruleId: string): string {
    const parts = ruleId.split('.');
    const relevant = parts.slice(-2);
    return relevant.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  private parseConfidence(conf?: string): number {
    if (!conf) return 0.8;
    if (conf === 'HIGH') return 0.95;
    if (conf === 'MEDIUM') return 0.8;
    if (conf === 'LOW') return 0.6;
    return 0.7;
  }
}
