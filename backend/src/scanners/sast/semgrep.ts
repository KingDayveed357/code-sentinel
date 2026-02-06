// src/scanners/sast/semgrep.ts
// ===================================================================
// REFACTORED: Uses async/await - no blocking execSync
import { asyncExec, asyncCommandExists } from "../../utils/async-exec";
import * as path from "path";
import type { FastifyInstance } from "fastify";
import {
  BaseScanner,
  ScanResult,
  NormalizedVulnerability,
} from "../base/scanner-interface";
import { normalizeTitle } from "../utils/title-normalizer";

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
  readonly name = "semgrep";
  readonly type = "sast" as const;

  // Optimized config - using single comprehensive ruleset to reduce overhead
  private readonly config = ["p/security-audit", "p/ci", "p/owasp-top-ten"]; // Covers most security issues efficiently
  
  // Directories and file patterns to exclude from scanning
  // Excludes: vendor code, minified files, generated code, and third-party libraries
  private readonly excludePaths = [
    // Directories
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    ".cache",
    "vendor",
    "__pycache__",
    "tmp",
    "temp",
    
    // Minified files and vendor libraries (these cause syntax errors)
    "*.min.js",
    "*.min.css",
    "*-min.js",
    "*-min.css",
    "*.bundle.js",
    "*.chunk.js",
    
    // Common third-party library patterns
    "**/assets/js/**",
    "**/vendor/**",
    "**/lib/**/*.min.*",
    "**/libs/**",
    "**/plugins/**",
    "**/bower_components/**",
    
    // Editor and tool files
    "**/ace-editor/**",
    "**/tinymce/**",
    "**/ckeditor/**",
    
    // Test and mock files (optional, but reduces noise)
    "**/*.test.js",
    "**/*.spec.js",
    "**/__tests__/**",
    "**/__mocks__/**",
  ];

  async scan(workspacePath: string, scanId: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if Semgrep is installed (ASYNC - non-blocking)
      const installed = await asyncCommandExists("semgrep");
      if (!installed) {
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: "Semgrep not installed", severity: "fatal" }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // Build exclude flags for performance
      const excludeFlags = this.excludePaths
        .map((dir) => `--exclude "${dir}"`)
        .join(" ");
      
      // Build config flags (supports single or multiple configs)
      const configFlags = this.config
        .map((cfg) => `--config ${cfg}`)
        .join(" ");
       
      // ✅ OPTIMIZED: Multiple configs + timeout + exclude paths for comprehensive scanning
      // --timeout: Semgrep's internal timeout per file (prevents hanging on large files)
      // --max-memory: Limit memory usage to prevent OOM
      // --metrics=off: Disable telemetry for faster execution
      const command = `semgrep scan --json ${configFlags} ${excludeFlags} --timeout 60 --max-memory 2000 --metrics=off ${workspacePath}`;

      this.fastify.log.debug({ 
        scanId, 
        configs: this.config,
        excludePaths: this.excludePaths,
        workspacePath 
      }, "Starting Semgrep scan");

      let rawOutput = "";
      let execResult;

      try {
        execResult = await asyncExec(command, {
          timeout: 600000, // 10 minutes (increased from 5)
          maxBuffer: 50 * 1024 * 1024,
          env: {
            PYTHONIOENCODING: "utf-8",
            LC_ALL: "en_US.UTF-8",
          },
        });
        
        // ✅ FIX: asyncExec returns { stdout, stderr, exitCode } and doesn't throw
        // Exit code 0 = no findings
        // Exit code 1 = findings detected (SUCCESS, not an error!)
        // Exit code 2+ = actual error
        if (execResult.exitCode > 1) {
          this.fastify.log.error({ 
            exitCode: execResult.exitCode,
            stderr: execResult.stderr,
            scanId 
          }, "Semgrep execution failed");
          throw new Error(`Semgrep failed with exit code ${execResult.exitCode}: ${execResult.stderr}`);
        }
        
        rawOutput = execResult.stdout;
      } catch (execError: any) {
        // This catch is for actual errors (timeout, maxBuffer exceeded, etc.)
        this.fastify.log.error({ error: execError.message, scanId }, "Semgrep execution error");
        throw execError;
      }

      const result = JSON.parse(rawOutput);

      const vulnerabilities: NormalizedVulnerability[] = [];

      for (const finding of result.results || []) {
        vulnerabilities.push(
          this.normalizeFinding(finding, workspacePath, scanId)
        );
      }

      return {
        scanner: this.name,
        success: true,
        vulnerabilities,
        errors: (result.errors || []).map((e: any) => ({
          message: e.message,
          file: e.path,
          severity: "warning" as const,
        })),
        metadata: {
          duration_ms: Date.now() - startTime,
          configs: this.config,
          files_scanned: new Set(vulnerabilities.map((v) => v.file_path)).size,
        },
      };
    } catch (error: any) {
      this.fastify.log.error({ error, scanId }, "Semgrep scan failed");
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: "fatal" }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }

  private normalizeFinding(
    finding: SemgrepFinding,
    workspacePath: string,
    scanId: string
  ): NormalizedVulnerability {
    const relativePath = finding.path
      .replace(workspacePath, "")
      .replace(/^\/+/, "");

    return {
      id: this.generateId(),
      scan_id: scanId,
      scanner: "semgrep",
      type: "sast",
      severity: this.normalizeSeverity(finding.extra.severity),
      title: normalizeTitle(finding.check_id, finding.extra.message, "sast"),
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
      recommendation: "",
      references: [],
      metadata: { category: finding.extra.metadata.category },
      detected_at: new Date().toISOString(),
    };
  }



  private parseConfidence(conf?: string): number {
    if (!conf) return 0.8;
    if (conf === "HIGH") return 0.95;
    if (conf === "MEDIUM") return 0.8;
    if (conf === "LOW") return 0.6;
    return 0.7;
  }
}
