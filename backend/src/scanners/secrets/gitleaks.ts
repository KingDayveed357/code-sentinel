// src/scanners/secrets/gitleaks.ts - FIXED
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  BaseScanner,
  ScanResult,
  NormalizedVulnerability,
} from '../base/scanner-interface';

interface GitleaksFinding {
  RuleID: string;
  Description?: string;
  File: string;
  StartLine: number;
  EndLine: number;
  Secret?: string;
  Entropy?: number;
  Match?: string;
}

export class GitleaksScanner extends BaseScanner {
  readonly name = 'gitleaks';
  readonly type = 'secret' as const;

  async scan(workspacePath: string, scanId: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if gitleaks is installed
      try {
        execSync('gitleaks version', { stdio: 'ignore' });
      } catch {
        this.fastify.log.warn('Gitleaks not installed, skipping secrets scan');
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: 'Gitleaks not installed', severity: 'warning' }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const outputFile = path.join(workspacePath, `gitleaks-${scanId}.json`);

      // FIX: Simplified command - let gitleaks handle the output directly
      const command = `gitleaks detect --source="${workspacePath}" --report-format=json --report-path="${outputFile}" --no-git --exit-code=0`;

      this.fastify.log.info({ workspacePath, outputFile }, 'Running Gitleaks scan');

      try {
        execSync(command, {
          cwd: workspacePath,
          stdio: 'pipe',
          timeout: 120000, // 2 minute timeout
        });
      } catch (execError: any) {
        // Log error but continue - file might still exist
        this.fastify.log.warn(
          { 
            error: execError.message,
            exitCode: execError.status,
          },
          'Gitleaks execution warning'
        );
      }

      // Check if report file exists
      if (!fs.existsSync(outputFile)) {
        this.fastify.log.info('No Gitleaks report generated - no secrets found');
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // Read and parse results
      const rawOutput = fs.readFileSync(outputFile, 'utf8');
      
      if (!rawOutput || rawOutput.trim() === '') {
        this.fastify.log.info('Empty Gitleaks report - no secrets found');
        fs.unlinkSync(outputFile);
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      let results: GitleaksFinding[] = [];
      try {
        const parsed = JSON.parse(rawOutput);
        // Gitleaks returns array directly or wrapped in object
        results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.leaks || []);
      } catch (parseError) {
        this.fastify.log.error({ parseError, rawOutput: rawOutput.substring(0, 200) }, 'Failed to parse Gitleaks output');
        fs.unlinkSync(outputFile);
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: 'Invalid Gitleaks JSON output', severity: 'error' }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const vulnerabilities: NormalizedVulnerability[] = [];

      for (const finding of results) {
        vulnerabilities.push({
          id: this.generateId(),
          scan_id: scanId,
          scanner: 'gitleaks',
          type: 'secret',
          severity: 'critical',
          title: `${finding.RuleID} Exposed`,
          description: finding.Description || `Secret of type ${finding.RuleID} detected in codebase`,
          file_path: finding.File.replace(workspacePath, '').replace(/^\/+/, ''),
          line_start: finding.StartLine,
          line_end: finding.EndLine,
          code_snippet: '***REDACTED***',
          rule_id: finding.RuleID,
          cwe: ['CWE-798'],
          cve: null,
          owasp: ['A07:2021'],
          confidence: 0.95,
          recommendation: 'Rotate this credential immediately and use environment variables or secret managers',
          references: [
            'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
          ],
          metadata: {
            secret_type: finding.RuleID,
            entropy: finding.Entropy || null,
          },
          detected_at: new Date().toISOString(),
        });
      }

      // Cleanup
      try {
        fs.unlinkSync(outputFile);
      } catch (cleanupError) {
        this.fastify.log.warn({ cleanupError }, 'Failed to cleanup Gitleaks report');
      }

      this.fastify.log.info({ secrets_found: vulnerabilities.length }, 'Gitleaks scan completed');

      return {
        scanner: this.name,
        success: true,
        vulnerabilities,
        errors: [],
        metadata: {
          duration_ms: Date.now() - startTime,
          secrets_found: vulnerabilities.length,
        },
      };
    } catch (error: any) {
      this.fastify.log.error({ error, scanId }, 'Gitleaks scan failed');
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: 'fatal' }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }
}