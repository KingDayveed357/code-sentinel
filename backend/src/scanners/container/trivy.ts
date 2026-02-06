// src/scanners/container/trivy.ts - Container Image Scanner
// ===================================================================
// REFACTORED: Uses async/await - no blocking execSync
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
import { parseTrivyOutput } from "./parser";

export class TrivyScanner extends BaseScanner {
  readonly name = "trivy";
  readonly type = "container" as const;

  async scan(workspacePath: string, scanId: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if trivy is installed (ASYNC - non-blocking)
      const installed = await asyncCommandExists("trivy");
      if (!installed) {
        this.fastify.log.warn("Trivy not installed, skipping container scan");
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: "trivy not installed", severity: "warning" }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // Find Dockerfiles and docker-compose files
      const containerFiles = this.findContainerFiles(workspacePath);

      if (containerFiles.length === 0) {
        this.fastify.log.info("No container files found, skipping scan");
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const allVulnerabilities: any[] = [];

      // Scan filesystem for vulnerabilities
      for (const file of containerFiles) {
        const outputFile = path.join(
          workspacePath,
          `trivy-report-${path.basename(file)}.json`
        );

        const command = `trivy filesystem --format json --output "${outputFile}" "${path.dirname(
          file
        )}"`;

        try {
          await asyncExec(command, {
            cwd: workspacePath,
            timeout: 300000,
          });

          const fileExists = await asyncFileExists(outputFile);
          if (fileExists) {
            const rawOutput = await asyncReadFile(outputFile, "utf8");
            const results = JSON.parse(rawOutput);

            const vulns = parseTrivyOutput(
              results,
              scanId,
              file,
              workspacePath,
              this
            );
            allVulnerabilities.push(...vulns);

            await asyncRmdir(outputFile);
          }
        } catch (err) {
          this.fastify.log.warn({ file, err }, "Trivy scan failed for file");
        }
      }

      return {
        scanner: this.name,
        success: true,
        vulnerabilities: allVulnerabilities,
        errors: [],
        metadata: {
          duration_ms: Date.now() - startTime,
          files_scanned: containerFiles.length,
        },
      };
    } catch (error: any) {
      this.fastify.log.error({ error, scanId }, "Trivy scan failed");
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: "fatal" }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }

  private findContainerFiles(workspacePath: string): string[] {
    // Note: This method is called during scan setup, before async operations.
    // It's acceptable to use sync here as it's brief file enumeration on startup.
    // If this becomes a bottleneck, convert to async and await in scan() method.
    const files: string[] = [];
    const targetFiles = [
      "Dockerfile",
      "docker-compose.yml",
      "docker-compose.yaml",
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
          } else if (targetFiles.includes(entry.name)) {
            files.push(fullPath);
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
