// src/scanners/orchestrator.ts - Complete Orchestrator

import type { FastifyInstance } from "fastify";
import type { ScanResult } from "./base/scanner-interface";
import { BaseScanner } from "./base/scanner-interface";
import { SemgrepScanner } from "./sast/semgrep";
import { OSVScanner } from "./sca/osv";
import { GitleaksScanner } from "./secrets/gitleaks";
import { CheckovScanner } from "./iac/checkov";
import { TrivyScanner } from "./container/trivy";

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
  private progressCallback?: (scanner: string, phase: 'start' | 'complete') => Promise<void>;

  constructor(private fastify: FastifyInstance) {
    // Initialize all scanners
    this.scanners.set("semgrep", new SemgrepScanner(fastify));
    this.scanners.set("osv", new OSVScanner(fastify));
    this.scanners.set("gitleaks", new GitleaksScanner(fastify));
    this.scanners.set("checkov", new CheckovScanner(fastify));
    this.scanners.set("trivy", new TrivyScanner(fastify));
  }

  /**
   * Set progress callback for real-time updates
   */
  setProgressCallback(cb: (scanner: string, phase: 'start' | 'complete') => Promise<void>) {
    this.progressCallback = cb;
  }

  /**
   * Run all enabled scanners in parallel
   * ✅ INSTRUMENTATION: Emit real progress events for each scanner
   */
  async scanAll(
    workspacePath: string,
    scanId: string,
    config: ScannerConfig,
    commitHash: string,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    // Determine which scanners to run
    const scannersToRun: Array<{ name: string; scanner: BaseScanner }> = [];

    if (config.sast) {
      const scanner = this.scanners.get("semgrep");
      if (scanner) scannersToRun.push({ name: "semgrep", scanner });
    }

    if (config.sca) {
      const scanner = this.scanners.get("osv");
      if (scanner) scannersToRun.push({ name: "osv", scanner });
    }

    if (config.secrets) {
      const scanner = this.scanners.get("gitleaks");
      if (scanner) scannersToRun.push({ name: "gitleaks", scanner });
    }

    if (config.iac) {
      const scanner = this.scanners.get("checkov");
      if (scanner) scannersToRun.push({ name: "checkov", scanner });
    }

    if (config.container) {
      const scanner = this.scanners.get("trivy");
      if (scanner) scannersToRun.push({ name: "trivy", scanner });
    }

    if (scannersToRun.length === 0) {
      this.fastify.log.warn({ scanId }, "No scanners enabled");
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
        commitHash: commitHash.substring(0, 7),
      },
      "Running scanners in parallel"
    );

    // ✅ INSTRUMENTATION: Log scanner count for progress distribution
    this.fastify.log.debug(
      {
        scanId,
        scannerCount: scannersToRun.length,
        scanners: scannersToRun.map((s) => s.name),
      },
      "Scanner execution starting"
    );

    // Run all scanners in parallel
    const results = await Promise.all(
      scannersToRun.map(async ({ name, scanner }) => {
        try {
          // ✅ REAL PROGRESS: Emit scanner start event
          if (this.progressCallback) {
            await this.progressCallback(name, 'start');
          }
          
          this.fastify.log.debug({ scanId, scanner: name }, "Starting scanner");
          const result = await scanner.scan(workspacePath, scanId);

          // ✅ REAL PROGRESS: Emit scanner completion event
          if (this.progressCallback) {
            await this.progressCallback(name, 'complete');
          }

          // ✅ INSTRUMENTATION: Log detailed scanner results for debugging
          this.fastify.log.info(
            {
              scanId,
              scanner: name,
              vulnerabilities: result.vulnerabilities.length,
              duration: result.metadata.duration_ms,
              success: result.success,
              errors: result.errors.length,
              errorMessages: result.errors
                .slice(0, 3)
                .map((e) => e.message)
                .join(", "),
            },
            "Scanner completed"
          );
          return result;
        } catch (error: any) {
          this.fastify.log.error(
            { scanId, scanner: name, error: error.message, stack: error.stack },
            "Scanner failed"
          );
          
          // ✅ REAL PROGRESS: Still emit completion even on failure
          if (this.progressCallback) {
            await this.progressCallback(name, 'complete');
          }
          
          return {
            scanner: name,
            success: false,
            vulnerabilities: [],
            errors: [{ message: error.message, severity: "fatal" as const }],
            metadata: { duration_ms: 0 },
          };
        }
      })
    );

    // ✅ DETERMINISM FIX: Sort results by scanner name for consistent ordering
    results.sort((a, b) => a.scanner.localeCompare(b.scanner));

    // Calculate metrics
    const totalVulnerabilities = results.reduce(
      (sum, r) => sum + r.vulnerabilities.length,
      0
    );
    const totalDuration = Date.now() - startTime;

    const scannerMetrics: OrchestrationResult["scannerMetrics"] = {};
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
        commitHash,
      },
      "All scanners completed"
    );


   
      // ✅ INSTRUMENTATION: Detect incomplete results
      const failedScanners = results.filter(r => !r.success);
      const emptyScanners = results.filter(r => r.success && r.vulnerabilities.length === 0);

      if (failedScanners.length > 0 || emptyScanners.length > 0) {
        this.fastify.log.warn(
          {
            scanId,
            failed: failedScanners.map(r => r.scanner),
            empty: emptyScanners.map(r => r.scanner),
          },
          "Some scanners returned no results - possible file collision or tool failure"
        );
      }

    return {
      results,
      totalVulnerabilities,
      totalDuration,
      scannerMetrics,
    };
  }

  /**
   * Check which scanners are available (CLI installed) - ASYNC, non-blocking
   */
  async checkAvailability(): Promise<{
    [scanner: string]: boolean;
  }> {
    const { asyncCommandExists } = await import("../../utils/async-exec");
    const availability: { [scanner: string]: boolean } = {};

    const checks = [
      { name: "semgrep" },
      { name: "osv-scanner" },
      { name: "gitleaks" },
      { name: "checkov" },
      { name: "trivy" },
    ];

    // Run checks in parallel (non-blocking)
    const results = await Promise.all(
      checks.map(async (check) => ({
        name: check.name,
        available: await asyncCommandExists(check.name),
      }))
    );

    for (const result of results) {
      availability[result.name] = result.available;
    }

    return availability;
  }

  /**
   * Get scanner information
   */
  getScannerInfo() {
    return {
      sast: {
        name: "Semgrep",
        description: "Static Application Security Testing",
        rules: ["p/ci", "p/security-audit", "p/owasp-top-ten"],
      },
      sca: {
        name: "OSV Scanner",
        description: "Software Composition Analysis (dependencies)",
        supports: ["npm", "pip", "maven", "go", "rust", "ruby"],
      },
      secrets: {
        name: "Gitleaks",
        description: "Secret detection in source code",
        detects: ["API keys", "tokens", "passwords", "credentials"],
      },
      iac: {
        name: "Checkov",
        description: "Infrastructure as Code security",
        supports: ["Terraform", "CloudFormation", "Kubernetes", "Docker"],
      },
      container: {
        name: "Trivy",
        description: "Container image vulnerability scanning",
        scans: ["OS packages", "application dependencies"],
      },
    };
  }
}
