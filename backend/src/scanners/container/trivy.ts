// src/scanners/container/trivy.ts - Container Image Scanner
// ===================================================================
import { BaseScanner } from '../base/scanner-interface';
import type { ScanResult } from '../base/scanner-interface';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseTrivyOutput } from './parser';

export class TrivyScanner extends BaseScanner {
  readonly name = 'trivy';
  readonly type = 'container' as const;

  async scan(workspacePath: string, scanId: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if trivy is installed
      try {
        execSync('trivy --version', { stdio: 'ignore' });
      } catch {
        this.fastify.log.warn('Trivy not installed, skipping container scan');
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: 'trivy not installed', severity: 'warning' }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // Find Dockerfiles and docker-compose files
      const containerFiles = this.findContainerFiles(workspacePath);

      if (containerFiles.length === 0) {
        this.fastify.log.info('No container files found, skipping scan');
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

        const command = `trivy filesystem --format json --output "${outputFile}" "${path.dirname(file)}"`;

        try {
          execSync(command, {
            stdio: 'ignore',
            cwd: workspacePath,
          });

          if (fs.existsSync(outputFile)) {
            const rawOutput = fs.readFileSync(outputFile, 'utf8');
            const results = JSON.parse(rawOutput);

            const vulns = parseTrivyOutput(results, scanId, file, workspacePath, this);
            allVulnerabilities.push(...vulns);

            fs.unlinkSync(outputFile);
          }
        } catch (err) {
          this.fastify.log.warn({ file, err }, 'Trivy scan failed for file');
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
      this.fastify.log.error({ error, scanId }, 'Trivy scan failed');
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: 'fatal' }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }

  private findContainerFiles(workspacePath: string): string[] {
    const files: string[] = [];
    const targetFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'];

    const searchDir = (dir: string, depth: number = 0) => {
      if (depth > 5) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

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