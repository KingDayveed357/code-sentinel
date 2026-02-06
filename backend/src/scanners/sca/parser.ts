// src/scanners/sca/parser.ts
// ===================================================================
import type { NormalizedVulnerability } from '../base/scanner-interface';
import type { BaseScanner } from '../base/scanner-interface';
import { createSCATitle } from '../utils/title-normalizer';

export function parseOSVOutput(
  results: any,
  scanId: string,
  workspacePath: string,
  scanner: BaseScanner
): NormalizedVulnerability[] {
  const vulnerabilities: NormalizedVulnerability[] = [];

  if (!results.results || results.results.length === 0) {
    return vulnerabilities;
  }

  for (const result of results.results) {
    const source = result.source?.path || 'package.json';

    for (const pkg of result.packages || []) {
      for (const vuln of pkg.vulnerabilities || []) {
        const fixedVersion = getFixedVersion(vuln);
        
        vulnerabilities.push({
          id: scanner['generateId'](),
          scan_id: scanId,
          scanner: 'osv',
          type: 'sca',
          severity: mapOSVSeverity(vuln.database_specific?.severity || vuln.severity),
          title: createSCATitle(pkg.package.name, vuln.id, pkg.package.version),
          description: vuln.summary || vuln.details || 'Vulnerable dependency detected',
          file_path: source.replace(workspacePath, '').replace(/^\/+/, ''),
          line_start: null,
          line_end: null,
          code_snippet: null,
          rule_id: vuln.id,
          cwe: extractCWEs(vuln),
          cve: extractCVE(vuln.id),
          owasp: ['A06:2021'],
          confidence: 1.0,
          recommendation: `Update ${pkg.package.name} from ${pkg.package.version} to ${fixedVersion}`,
          references: vuln.references?.map((r: any) => r.url) || [],
          metadata: {
            package_name: pkg.package.name,
            package_version: pkg.package.version,
            fixed_version: fixedVersion,
            ecosystem: pkg.package.ecosystem,
            aliases: vuln.aliases || [],
          },
          detected_at: new Date().toISOString(),
        });
      }
    }
  }

  return vulnerabilities;
}

function mapOSVSeverity(severity?: string): NormalizedVulnerability['severity'] {
  if (!severity) return 'medium';
  
  const normalized = severity.toUpperCase();
  if (normalized.includes('CRITICAL')) return 'critical';
  if (normalized.includes('HIGH')) return 'high';
  if (normalized.includes('MODERATE') || normalized.includes('MEDIUM')) return 'medium';
  if (normalized.includes('LOW')) return 'low';
  
  return 'medium';
}

function extractCWEs(vuln: any): string[] {
  const cwes: string[] = [];
  
  if (vuln.database_specific?.cwe_ids) {
    cwes.push(...vuln.database_specific.cwe_ids);
  }
  
  return cwes;
}

function extractCVE(id: string): string | null {
  if (id.startsWith('CVE-')) return id;
  return null;
}

function getFixedVersion(vuln: any): string {
  if (vuln.affected?.[0]?.ranges?.[0]?.events) {
    const events = vuln.affected[0].ranges[0].events;
    const fixedEvent = events.find((e: any) => e.fixed);
    if (fixedEvent) return fixedEvent.fixed;
  }
  
  return 'latest';
}