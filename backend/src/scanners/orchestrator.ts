// src/scanners/orchestrator.ts - Complete Orchestrator

import type { FastifyInstance } from 'fastify';
import type { ScanResult } from './base/scanner-interface';
import { BaseScanner } from './base/scanner-interface';
import { SemgrepScanner } from './sast/semgrep';
import { OSVScanner } from './sca/osv';
import { GitleaksScanner } from './secrets/gitleaks';
import { CheckovScanner } from './iac/checkov';
import { TrivyScanner } from './container/trivy';

export interface ScannerConfig {
  sast: boolean;
  sca: boolean;
  secrets: boolean;
  iac: boolean;
  container: boolean;
}

export interface OrchestrationResult {
  results: ScanResult[];
  totalVulnerabilities: number;
  totalDuration: number;
  scannerMetrics: {
    [scanner: string]: {
      duration_ms: number;
      vulnerabilities_found: number;
      success: boolean;
    };
  };
}

export class ScannerOrchestrator {
  private scanners: Map<string, BaseScanner> = new Map();

  constructor(private fastify: FastifyInstance) {
    // Initialize all scanners
    this.scanners.set('semgrep', new SemgrepScanner(fastify));
    this.scanners.set('osv', new OSVScanner(fastify));
    this.scanners.set('gitleaks', new GitleaksScanner(fastify));
    this.scanners.set('checkov', new CheckovScanner(fastify));
    this.scanners.set('trivy', new TrivyScanner(fastify));
  }

  /**
   * Run all enabled scanners in parallel
   */
  async scanAll(
    workspacePath: string,
    scanId: string,
    config: ScannerConfig
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    // Determine which scanners to run
    const scannersToRun: Array<{ name: string; scanner: BaseScanner }> = [];

    if (config.sast) {
      const scanner = this.scanners.get('semgrep');
      if (scanner) scannersToRun.push({ name: 'semgrep', scanner });
    }

    if (config.sca) {
      const scanner = this.scanners.get('osv');
      if (scanner) scannersToRun.push({ name: 'osv', scanner });
    }

    if (config.secrets) {
      const scanner = this.scanners.get('gitleaks');
      if (scanner) scannersToRun.push({ name: 'gitleaks', scanner });
    }

    if (config.iac) {
      const scanner = this.scanners.get('checkov');
      if (scanner) scannersToRun.push({ name: 'checkov', scanner });
    }

    if (config.container) {
      const scanner = this.scanners.get('trivy');
      if (scanner) scannersToRun.push({ name: 'trivy', scanner });
    }

    if (scannersToRun.length === 0) {
      this.fastify.log.warn({ scanId }, 'No scanners enabled');
      return {
        results: [],
        totalVulnerabilities: 0,
        totalDuration: 0,
        scannerMetrics: {},
      };
    }

    this.fastify.log.info(
      {
        scanId,
        scanners: scannersToRun.map((s) => s.name),
        workspacePath,
      },
      'Running scanners in parallel'
    );

    // Run all scanners in parallel
    const results = await Promise.all(
      scannersToRun.map(async ({ name, scanner }) => {
        try {
          this.fastify.log.debug({ scanId, scanner: name }, 'Starting scanner');
          const result = await scanner.scan(workspacePath, scanId);
          this.fastify.log.info(
            {
              scanId,
              scanner: name,
              vulnerabilities: result.vulnerabilities.length,
              duration: result.metadata.duration_ms,
              success: result.success,
            },
            'Scanner completed'
          );
          return result;
        } catch (error: any) {
          this.fastify.log.error(
            { scanId, scanner: name, error },
            'Scanner failed'
          );
          return {
            scanner: name,
            success: false,
            vulnerabilities: [],
            errors: [{ message: error.message, severity: 'fatal' as const }],
            metadata: { duration_ms: 0 },
          };
        }
      })
    );

    // Calculate metrics
    const totalVulnerabilities = results.reduce(
      (sum, r) => sum + r.vulnerabilities.length,
      0
    );
    const totalDuration = Date.now() - startTime;

    const scannerMetrics: OrchestrationResult['scannerMetrics'] = {};
    for (const result of results) {
      scannerMetrics[result.scanner] = {
        duration_ms: result.metadata.duration_ms,
        vulnerabilities_found: result.vulnerabilities.length,
        success: result.success,
      };
    }

    this.fastify.log.info(
      {
        scanId,
        totalVulnerabilities,
        totalDuration,
        scanners: Object.keys(scannerMetrics),
      },
      'All scanners completed'
    );

    return {
      results,
      totalVulnerabilities,
      totalDuration,
      scannerMetrics,
    };
  }

  /**
   * Check which scanners are available (CLI installed)
   */
  async checkAvailability(): Promise<{
    [scanner: string]: boolean;
  }> {
    const { execSync } = await import('child_process');
    const availability: { [scanner: string]: boolean } = {};

    const checks = [
      { name: 'semgrep', command: 'semgrep --version' },
      { name: 'osv', command: 'osv-scanner --version' },
      { name: 'gitleaks', command: 'gitleaks version' },
      { name: 'checkov', command: 'checkov --version' },
      { name: 'trivy', command: 'trivy --version' },
    ];

    for (const check of checks) {
      try {
        execSync(check.command, { stdio: 'ignore' });
        availability[check.name] = true;
      } catch {
        availability[check.name] = false;
      }
    }

    return availability;
  }

  /**
   * Get scanner information
   */
  getScannerInfo() {
    return {
      sast: {
        name: 'Semgrep',
        description: 'Static Application Security Testing',
        rules: ['p/ci', 'p/security-audit', 'p/owasp-top-ten'],
      },
      sca: {
        name: 'OSV Scanner',
        description: 'Software Composition Analysis (dependencies)',
        supports: ['npm', 'pip', 'maven', 'go', 'rust', 'ruby'],
      },
      secrets: {
        name: 'Gitleaks',
        description: 'Secret detection in source code',
        detects: ['API keys', 'tokens', 'passwords', 'credentials'],
      },
      iac: {
        name: 'Checkov',
        description: 'Infrastructure as Code security',
        supports: ['Terraform', 'CloudFormation', 'Kubernetes', 'Docker'],
      },
      container: {
        name: 'Trivy',
        description: 'Container image vulnerability scanning',
        scans: ['OS packages', 'application dependencies'],
      },
    };
  }
}