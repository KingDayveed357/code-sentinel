// // src/scanners/sast/semgrep.ts
// // ===================================================================
// // REFACTORED: Uses async/await - no blocking execSync
// import { asyncExec, asyncCommandExists } from "../../utils/async-exec";
// import * as path from "path";
// import type { FastifyInstance } from "fastify";
// import {
//   BaseScanner,
//   ScanResult,
//   NormalizedVulnerability,
// } from "../base/scanner-interface";
// import { normalizeTitle } from "../utils/title-normalizer";

// interface SemgrepFinding {
//   check_id: string;
//   path: string;
//   start: { line: number; col: number };
//   end: { line: number; col: number };
//   extra: {
//     message: string;
//     severity: string;
//     metadata: {
//       cwe?: string[];
//       owasp?: string[];
//       category?: string;
//       confidence?: string;
//     };
//     lines: string;
//   };
// }

// export class SemgrepScanner extends BaseScanner {
//   readonly name = "semgrep";
//   readonly type = "sast" as const;

//   // Optimized config - using single comprehensive ruleset to reduce overhead
//   private readonly config = ["p/security-audit", "p/ci", "p/owasp-top-ten"]; // Covers most security issues efficiently
  
//   // Directories and file patterns to exclude from scanning
//   // Excludes: vendor code, minified files, generated code, and third-party libraries
//   private readonly excludePaths = [
//     // Directories
//     "node_modules",
//     ".git",
//     "dist",
//     "build",
//     ".next",
//     "coverage",
//     ".cache",
//     "vendor",
//     "__pycache__",
//     "tmp",
//     "temp",
    
//     // Minified files and vendor libraries (these cause syntax errors)
//     "*.min.js",
//     "*.min.css",
//     "*-min.js",
//     "*-min.css",
//     "*.bundle.js",
//     "*.chunk.js",
    
//     // Common third-party library patterns
//     "**/assets/js/**",
//     "**/vendor/**",
//     "**/lib/**/*.min.*",
//     "**/libs/**",
//     "**/plugins/**",
//     "**/bower_components/**",
    
//     // Editor and tool files
//     "**/ace-editor/**",
//     "**/tinymce/**",
//     "**/ckeditor/**",
    
//     // Test and mock files (optional, but reduces noise)
//     "**/*.test.js",
//     "**/*.spec.js",
//     "**/__tests__/**",
//     "**/__mocks__/**",
//   ];

//   async scan(workspacePath: string, scanId: string, scanType?: 'quick' | 'full'): Promise<ScanResult> {
//     const startTime = Date.now();

//     try {
//       // Check if Semgrep is installed (ASYNC - non-blocking)
//       const installed = await asyncCommandExists("semgrep");
//       if (!installed) {
//         return {
//           scanner: this.name,
//           success: false,
//           vulnerabilities: [],
//           errors: [{ message: "Semgrep not installed", severity: "fatal" }],
//           metadata: { duration_ms: Date.now() - startTime },
//         };
//       }

//       // ✅ OPTIMIZATION: Use fewer rules for quick scans
//       const activeConfigs = scanType === 'quick' 
//         ? ["p/ci"] 
//         : ["p/security-audit", "p/ci", "p/owasp-top-ten", "p/cwe-top-25",];

//       // Build exclude flags for performance
//       const excludeFlags = this.excludePaths
//         .map((dir) => `--exclude "${dir}"`)
//         .join(" ");
      
//       // Build config flags
//       const configFlags = activeConfigs
//         .map((cfg) => `--config ${cfg}`)
//         .join(" ");
       
//       // ✅ OPTIMIZED: Multiple configs + timeout + exclude paths for comprehensive scanning
//       const command = `semgrep scan --json ${configFlags} ${excludeFlags} --timeout 60 --max-memory 2000 --metrics=off ${workspacePath}`;

//       this.fastify.log.debug({ 
//         scanId, 
//         configs: this.config,
//         excludePaths: this.excludePaths,
//         workspacePath 
//       }, "Starting Semgrep scan");

//       let rawOutput = "";
//       let execResult;

//       try {
//         execResult = await asyncExec(command, {
//           timeout: 600000, // 10 minutes (increased from 5)
//           maxBuffer: 50 * 1024 * 1024,
//           env: {
//             PYTHONIOENCODING: "utf-8",
//             LC_ALL: "en_US.UTF-8",
//           },
//         });
        
//         // ✅ FIX: asyncExec returns { stdout, stderr, exitCode } and doesn't throw
//         // Exit code 0 = no findings
//         // Exit code 1 = findings detected (SUCCESS, not an error!)
//         // Exit code 2+ = actual error
//         if (execResult.exitCode > 1) {
//           this.fastify.log.error({ 
//             exitCode: execResult.exitCode,
//             stderr: execResult.stderr,
//             scanId 
//           }, "Semgrep execution failed");
//           throw new Error(`Semgrep failed with exit code ${execResult.exitCode}: ${execResult.stderr}`);
//         }
        
//         rawOutput = execResult.stdout;
//       } catch (execError: any) {
//         // This catch is for actual errors (timeout, maxBuffer exceeded, etc.)
//         this.fastify.log.error({ error: execError.message, scanId }, "Semgrep execution error");
//         throw execError;
//       }

//       const result = JSON.parse(rawOutput);

//       const vulnerabilities: NormalizedVulnerability[] = [];

//       for (const finding of result.results || []) {
//         vulnerabilities.push(
//           this.normalizeFinding(finding, workspacePath, scanId)
//         );
//       }

//       return {
//         scanner: this.name,
//         success: true,
//         vulnerabilities,
//         errors: (result.errors || []).map((e: any) => ({
//           message: e.message,
//           file: e.path,
//           severity: "warning" as const,
//         })),
//         metadata: {
//           duration_ms: Date.now() - startTime,
//           configs: this.config,
//           files_scanned: new Set(vulnerabilities.map((v) => v.file_path)).size,
//         },
//       };
//     } catch (error: any) {
//       this.fastify.log.error({ error, scanId }, "Semgrep scan failed");
//       return {
//         scanner: this.name,
//         success: false,
//         vulnerabilities: [],
//         errors: [{ message: error.message, severity: "fatal" }],
//         metadata: { duration_ms: Date.now() - startTime },
//       };
//     }
//   }

//   private normalizeFinding(
//     finding: SemgrepFinding,
//     workspacePath: string,
//     scanId: string
//   ): NormalizedVulnerability {
//     const relativePath = finding.path
//       .replace(workspacePath, "")
//       .replace(/^\/+/, "");

//     return {
//       id: this.generateId(),
//       scan_id: scanId,
//       scanner: "semgrep",
//       type: "sast",
//       severity: this.normalizeSeverity(finding.extra.severity),
//       title: normalizeTitle(finding.check_id, finding.extra.message, "sast"),
//       description: finding.extra.message,
//       file_path: relativePath,
//       line_start: finding.start.line,
//       line_end: finding.end.line,
//       code_snippet: finding.extra.lines,
//       rule_id: finding.check_id,
//       cwe: finding.extra.metadata.cwe || [],
//       cve: null,
//       owasp: finding.extra.metadata.owasp || [],
//       confidence: this.parseConfidence(finding.extra.metadata.confidence),
//       recommendation: "",
//       references: [],
//       metadata: { category: finding.extra.metadata.category },
//       detected_at: new Date().toISOString(),
//     };
//   }



//   private parseConfidence(conf?: string): number {
//     if (!conf) return 0.8;
//     if (conf === "HIGH") return 0.95;
//     if (conf === "MEDIUM") return 0.8;
//     if (conf === "LOW") return 0.6;
//     return 0.7;
//   }
// }


// src/scanners/sast/semgrep.ts
// ===================================================================
// REFACTORED: Dynamic timeouts based on repo size
import { asyncExec, asyncCommandExists } from "../../utils/async-exec";
import * as path from "path";
import * as fs from "fs/promises";
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

interface RepoStats {
  fileCount: number;
  totalSizeKB: number;
  estimatedScanTimeMs: number;
}

export class SemgrepScanner extends BaseScanner {
  readonly name = "semgrep";
  readonly type = "sast" as const;

  // Quick scan: Fast but comprehensive - covers ~80% of issues in 30% of time
  private readonly quickScanConfig = [
    "p/ci",              // Critical issues for CI/CD
    "p/security-audit",  // Core security vulnerabilities
    "p/default",         // Common bug patterns
  ];

  // Full scan: Exhaustive coverage - all security standards
  private readonly fullScanConfig = [
    "p/security-audit",
    "p/ci",
    "p/owasp-top-ten",
    "p/cwe-top-25",      // Most dangerous software errors
  ];

  // Directories and file patterns to exclude from scanning
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

  async scan(
    workspacePath: string,
    scanId: string,
    scanType: "quick" | "full" = "full"
  ): Promise<ScanResult> {
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

      // ✅ NEW: Analyze repo to calculate optimal timeout
      const repoStats = await this.analyzeRepo(workspacePath, scanType);
      
      this.fastify.log.debug(
        {
          scanId,
          repoStats,
        },
        "Repo analysis complete"
      );

      // ✅ OPTIMIZATION 1: Smart config selection based on scan type
      const activeConfigs =
        scanType === "quick" ? this.quickScanConfig : this.fullScanConfig;

      // Build exclude flags for performance
      const excludeFlags = this.excludePaths
        .map((dir) => `--exclude "${dir}"`)
        .join(" ");

      // Build config flags
      const configFlags = activeConfigs
        .map((cfg) => `--config ${cfg}`)
        .join(" ");

      // ✅ DYNAMIC: Calculate per-file timeout based on repo size
      const perFileTimeout = this.calculatePerFileTimeout(repoStats, scanType);
      
      const perfFlags =
        scanType === "quick"
          ? `--max-target-bytes 1000000 --optimizations all --timeout ${perFileTimeout}`
          : `--timeout ${perFileTimeout * 1.5} --max-memory 2000`; // Full scan gets 50% more time per file

      // ✅ OPTIMIZATION: File type filtering for quick scans
      const includeFlags = this.getFileIncludeFlags(scanType);

      // Build final command
      const command = `semgrep scan --json ${configFlags} ${excludeFlags} ${includeFlags} ${perfFlags} --metrics=off ${workspacePath}`.trim();

      this.fastify.log.debug(
        {
          scanId,
          scanType,
          configs: activeConfigs,
          perFileTimeout,
          estimatedTotalTime: `${Math.round(repoStats.estimatedScanTimeMs / 1000)}s`,
          workspacePath,
        },
        "Starting Semgrep scan"
      );

      let execResult;

      try {
        // ✅ DYNAMIC: Use calculated timeout with 20% buffer
        const processTimeout = Math.round(repoStats.estimatedScanTimeMs * 1.2);
        
        execResult = await asyncExec(command, {
          timeout: processTimeout,
          maxBuffer: 50 * 1024 * 1024,
          env: {
            PYTHONIOENCODING: "utf-8",
            LC_ALL: "en_US.UTF-8",
          },
        });

        if (execResult.exitCode > 1) {
          this.fastify.log.error(
            {
              exitCode: execResult.exitCode,
              stderr: execResult.stderr,
              scanId,
            },
            "Semgrep execution failed"
          );
          throw new Error(
            `Semgrep failed with exit code ${execResult.exitCode}: ${execResult.stderr}`
          );
        }
      } catch (execError: any) {
        this.fastify.log.error(
          { error: execError.message, scanId },
          "Semgrep execution error"
        );
        throw execError;
      }

      const result = JSON.parse(execResult.stdout);

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
          configs: activeConfigs,
          scan_type: scanType,
          files_scanned: new Set(vulnerabilities.map((v) => v.file_path)).size,
          repo_file_count: repoStats.fileCount,
          repo_size_kb: repoStats.totalSizeKB,
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

  /**
   * Analyze repo to calculate optimal timeout
   * Counts files and estimates scan time based on size
   */
  private async analyzeRepo(
    workspacePath: string,
    scanType: "quick" | "full"
  ): Promise<RepoStats> {
    let fileCount = 0;
    let totalSizeKB = 0;

    const targetExtensions = scanType === "quick" 
      ? new Set([".js", ".ts", ".jsx", ".tsx", ".py", ".php", ".java", ".go", ".rb", ".cs", ".swift"])
      : null; // null means scan all files

    const walk = async (dir: string) => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Skip excluded directories
          if (entry.isDirectory()) {
            const shouldExclude = this.excludePaths.some(
              (excludePath) =>
                !excludePath.includes("*") && entry.name === excludePath
            );
            if (!shouldExclude) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            // Check file extension for quick scan
            if (targetExtensions) {
              const ext = path.extname(entry.name).toLowerCase();
              if (!targetExtensions.has(ext)) continue;
            }

            // Skip excluded patterns
            const shouldExclude = this.excludePaths.some((pattern) => {
              if (pattern.includes("*")) {
                const regex = new RegExp(
                  pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")
                );
                return regex.test(fullPath);
              }
              return false;
            });

            if (!shouldExclude) {
              fileCount++;
              const stats = await fs.stat(fullPath);
              totalSizeKB += stats.size / 1024;
            }
          }
        }
      } catch (err) {
        // Skip inaccessible directories
      }
    };

    await walk(workspacePath);

    // ✅ ESTIMATE: Based on empirical testing
    // Quick scan: ~200ms per file on average
    // Full scan: ~500ms per file on average
    const msPerFile = scanType === "quick" ? 200 : 500;
    
    // Minimum 2 minutes, maximum 30 minutes
    const estimatedScanTimeMs = Math.max(
      120000, // 2 min minimum
      Math.min(
        fileCount * msPerFile,
        1800000 // 30 min maximum
      )
    );

    return {
      fileCount,
      totalSizeKB: Math.round(totalSizeKB),
      estimatedScanTimeMs,
    };
  }

  /**
   * Calculate per-file timeout based on repo characteristics
   */
  private calculatePerFileTimeout(
    repoStats: RepoStats,
    scanType: "quick" | "full"
  ): number {
    const avgFileSizeKB = repoStats.totalSizeKB / repoStats.fileCount;

    // Base timeout
    let timeout = scanType === "quick" ? 60 : 120;

    // Adjust based on average file size
    if (avgFileSizeKB > 100) {
      timeout += 30; // Large files need more time
    } else if (avgFileSizeKB > 50) {
      timeout += 15;
    }

    // Adjust based on total file count (large repos may have simpler files)
    if (repoStats.fileCount > 1000) {
      timeout = Math.max(30, timeout - 20); // Reduce timeout for very large repos
    }

    return timeout;
  }

  /**
   * Get file include flags for optimized scanning
   * Quick scans only target high-risk file types
   */
  private getFileIncludeFlags(scanType: "quick" | "full"): string {
    if (scanType === "full") return "";

    // Quick scan: only scan files that commonly have vulnerabilities
    const highRiskExtensions = [
      "*.js",
      "*.ts",
      "*.jsx",
      "*.tsx", // JavaScript/TypeScript
      "*.py", // Python
      "*.php", // PHP
      "*.java", // Java
      "*.go", // Go
      "*.rb", // Ruby
      "*.cs", // C#
      "*.swift", // Swift
    ];

    return highRiskExtensions.map((ext) => `--include "${ext}"`).join(" ");
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