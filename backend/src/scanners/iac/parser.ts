// src/scanners/iac/parser.ts
// ===================================================================
import type { NormalizedVulnerability } from '../base/scanner-interface';
import type { BaseScanner } from '../base/scanner-interface';
import { createIaCTitle } from '../utils/title-normalizer';

export function parseCheckovOutput(
  results: any,
  scanId: string,
  workspacePath: string,
  scanner: BaseScanner
): NormalizedVulnerability[] {
  const vulnerabilities: NormalizedVulnerability[] = [];

  // Checkov wraps results in a 'results' key
  const checksResults = results?.results || results;
  
  const checks = [
    ...(checksResults?.failed_checks || []),
  ];

  for (const check of checks) {
    const filePath = check.file_path?.replace(workspacePath, '').replace(/^\/+/, '') || 'unknown';

    vulnerabilities.push({
      id: scanner['generateId'](),
      scan_id: scanId,
      scanner: 'checkov',
      type: 'iac',
      severity: mapCheckovSeverity(check.check_result?.result || check.severity || 'MEDIUM'),
      title: createIaCTitle(check.check_name || check.check_id, check.resource),
      description: check.description || 'IaC misconfiguration detected',
      file_path: filePath,
      line_start: check.file_line_range?.[0] || null,
      line_end: check.file_line_range?.[1] || null,
      code_snippet: check.code_block?.[0]?.join('\n') || null,
      rule_id: check.check_id,
      cwe: extractCWEsFromCheckov(check),
      cve: null,
      owasp: ['A02:2021', 'A05:2021'],
      confidence: 0.95,
      recommendation: check.guideline || 'Review IaC configuration and apply security best practices',
      references: [check.guideline].filter(Boolean),
      metadata: {
        resource_type: check.resource,
        check_type: check.check_type,
        benchmark: check.benchmark || [],
      },
      detected_at: new Date().toISOString(),
    });
  }

  return vulnerabilities;
}

function mapCheckovSeverity(severity: string): NormalizedVulnerability['severity'] {
  const normalized = severity.toLowerCase();
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('medium') || normalized.includes('moderate')) return 'medium';
  if (normalized.includes('low')) return 'low';
  
  return 'medium';
}

function extractCWEsFromCheckov(check: any): string[] {
  const cwes: string[] = [];
  
  // Checkov doesn't always provide CWEs, infer from check type
  const checkIdLower = check.check_id?.toLowerCase() || '';
  const checkNameLower = check.check_name?.toLowerCase() || '';
  
  if (checkIdLower.includes('encryption') || checkNameLower.includes('encrypt')) {
    cwes.push('CWE-311');
  }
  if (checkIdLower.includes('access') || checkNameLower.includes('public')) {
    cwes.push('CWE-732');
  }
  if (checkIdLower.includes('logging') || checkNameLower.includes('log')) {
    cwes.push('CWE-778');
  }
  if (checkIdLower.includes('secrets') || checkNameLower.includes('credential')) {
    cwes.push('CWE-798');
  }
  
  return cwes.length > 0 ? cwes : ['CWE-16']; // Default: Configuration
}