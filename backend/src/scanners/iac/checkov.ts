import { BaseScanner } from "../base/scanner-interface";
import type { ScanResult } from "../base/scanner-interface";
import {
  asyncExec,
  asyncCommandExists,
  asyncReadFile,
  asyncFileExists,
  asyncRmdir,
} from "../../utils/async-exec";
import * as fs from "fs";
import * as path from "path";
import { parseCheckovOutput } from "./parser";

export class CheckovScanner extends BaseScanner {
  readonly name = "checkov";
  readonly type = "iac" as const;

  async scan(workspacePath: string, scanId: string, scanType?: 'quick' | 'full'): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if checkov is installed (ASYNC - non-blocking)
      const installed = await asyncCommandExists("checkov");
      if (!installed) {
        this.fastify.log.warn("Checkov not installed, skipping IaC scan");
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: "checkov not installed", severity: "warning" }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // Find IaC files
      const iacFiles = this.findIaCFiles(workspacePath);

      if (iacFiles.length === 0) {
        this.fastify.log.info("No IaC files found, skipping scan");
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // const outputFile = path.join(workspacePath, "checkov-report.json");
      const outputFile = path.join(workspacePath, `checkov-report-${scanId}.json`);
      const command = `checkov --directory "${workspacePath}" --output json --output-file-path "${outputFile}" --quiet --compact`;

      try {
        await asyncExec(command, {
          cwd: workspacePath,
          timeout: 300000,
          env: {
            CHECKOV_RUN_SCA_PACKAGE_SCAN: "false", // Disable SCA to avoid duplicates
          },
        });
      } catch {
        // Checkov exits with 1 if issues found
      }

      const reportPath = path.join(outputFile, "results_json.json");

      const fileExists = await asyncFileExists(reportPath);
      if (!fileExists) {
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const rawOutput = await asyncReadFile(reportPath, "utf8");
      const results = JSON.parse(rawOutput);

      const vulnerabilities = parseCheckovOutput(
        results,
        scanId,
        workspacePath,
        this
      );

      // Cleanup (ASYNC)
      try {
        await asyncRmdir(outputFile);
      } catch (err) {
        this.fastify.log.warn({ err }, "Failed to cleanup Checkov report");
      }

      return {
        scanner: this.name,
        success: true,
        vulnerabilities,
        errors: [],
        metadata: {
          duration_ms: Date.now() - startTime,
          files_scanned: iacFiles.length,
        },
      };
    } catch (error: any) {
      this.fastify.log.error({ error, scanId }, "Checkov scan failed");
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: "fatal" }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }

  private findIaCFiles(workspacePath: string): string[] {
    // Note: This method is called during scan setup, before async operations.
    // It's acceptable to use sync here as it's brief file enumeration on startup.
    // If this becomes a bottleneck, convert to async and await in scan() method.
    const files: string[] = [];
    const iacExtensions = [".tf", ".yaml", ".yml", ".json"];
    const iacPatterns = [
      "terraform",
      "cloudformation",
      "kubernetes",
      "docker-compose",
    ];

    const searchDir = (dir: string, depth: number = 0) => {
      if (depth > 5) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            searchDir(fullPath, depth + 1);
          } else {
            const ext = path.extname(entry.name);
            const namePattern = iacPatterns.some((p) =>
              entry.name.toLowerCase().includes(p)
            );

            if (iacExtensions.includes(ext) || namePattern) {
              files.push(fullPath);
            }
          }
        }
      } catch (err) {
        // Ignore errors
      }
    };

    searchDir(workspacePath);
    return files;
  }
}
