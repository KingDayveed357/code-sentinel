// src/scanners/sca/osv.ts - OSV.dev Scanner
// ===================================================================
import { BaseScanner } from '../base/scanner-interface';
import type { ScanResult, NormalizedVulnerability } from '../base/scanner-interface';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseOSVOutput } from './parser';

export class OSVScanner extends BaseScanner {
  readonly name = 'osv';
  readonly type = 'sca' as const;

  async scan(workspacePath: string, scanId: string): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      // Check if osv-scanner is installed
      try {
        execSync('osv-scanner --version', { stdio: 'ignore' });
      } catch {
        this.fastify.log.warn('OSV Scanner not installed, skipping SCA scan');
        return {
          scanner: this.name,
          success: false,
          vulnerabilities: [],
          errors: [{ message: 'osv-scanner not installed', severity: 'warning' }],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      // Find dependency files
      const dependencyFiles = this.findDependencyFiles(workspacePath);

      if (dependencyFiles.length === 0) {
        this.fastify.log.info('No dependency files found, skipping SCA scan');
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const outputFile = path.join(workspacePath, 'osv-report.json');
      const command = `osv-scanner --json --output="${outputFile}" --lockfile="${dependencyFiles[0]}"`;

      try {
        execSync(command, {
          stdio: 'ignore',
          cwd: workspacePath,
        });
      } catch {
        // OSV exits with 1 if vulnerabilities found
      }

      if (!fs.existsSync(outputFile)) {
        return {
          scanner: this.name,
          success: true,
          vulnerabilities: [],
          errors: [],
          metadata: { duration_ms: Date.now() - startTime },
        };
      }

      const rawOutput = fs.readFileSync(outputFile, 'utf8');
      const results = JSON.parse(rawOutput);

      const vulnerabilities = parseOSVOutput(results, scanId, workspacePath, this);

      // Cleanup
      fs.unlinkSync(outputFile);

      return {
        scanner: this.name,
        success: true,
        vulnerabilities,
        errors: [],
        metadata: {
          duration_ms: Date.now() - startTime,
          files_scanned: dependencyFiles.length,
        },
      };
    } catch (error: any) {
      this.fastify.log.error({ error, scanId }, 'OSV scan failed');
      return {
        scanner: this.name,
        success: false,
        vulnerabilities: [],
        errors: [{ message: error.message, severity: 'fatal' }],
        metadata: { duration_ms: Date.now() - startTime },
      };
    }
  }

  private findDependencyFiles(workspacePath: string): string[] {
    const files: string[] = [];
    const lockFiles = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'Pipfile.lock',
      'poetry.lock',
      'Gemfile.lock',
      'go.sum',
      'Cargo.lock',
      'composer.lock',
      'pom.xml',
      'build.gradle',
    ];

    const searchDir = (dir: string, depth: number = 0) => {
      if (depth > 3) return; // Limit recursion depth

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            searchDir(fullPath, depth + 1);
          } else if (lockFiles.includes(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch (err) {
        // Ignore permission errors
      }
    };

    searchDir(workspacePath);
    return files;
  }
}