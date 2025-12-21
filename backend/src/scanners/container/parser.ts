import type { NormalizedVulnerability } from '../base/scanner-interface';
import type { BaseScanner } from '../base/scanner-interface';

export function parseTrivyOutput(
  results: any,
  scanId: string,
  containerFile: string,
  workspacePath: string,
  scanner: BaseScanner
): NormalizedVulnerability[] {
  const vulnerabilities: NormalizedVulnerability[] = [];

  // Trivy output has a 'Results' array with vulnerability data
  const trivyResults = results?.Results || [];

  for (const result of trivyResults) {
    const target = result.Target || 'unknown';
    const vulns = result.Vulnerabilities || [];

    for (const vuln of vulns) {
      vulnerabilities.push({
        id: scanner['generateId'](),
        scan_id: scanId,
        scanner: 'trivy',
        type: 'container',
        severity: mapTrivySeverity(vuln.Severity),
        title: `${vuln.PkgName}: ${vuln.VulnerabilityID}`,
        description: vuln.Title || vuln.Description || 'Container vulnerability detected',
        file_path: containerFile.replace(workspacePath, '').replace(/^\/+/, ''),
        line_start: null,
        line_end: null,
        code_snippet: null,
        rule_id: vuln.VulnerabilityID,
        cwe: vuln.CweIDs || [],
        cve: vuln.VulnerabilityID.startsWith('CVE-') ? vuln.VulnerabilityID : null,
        owasp: ['A06:2021'],
        confidence: 1.0,
        recommendation: vuln.FixedVersion
          ? `Update ${vuln.PkgName} from ${vuln.InstalledVersion} to ${vuln.FixedVersion}`
          : `Review ${vuln.PkgName} (no fix available yet)`,
        references: [vuln.PrimaryURL].filter(Boolean),
        metadata: {
          image_name: target,
          package_name: vuln.PkgName,
          installed_version: vuln.InstalledVersion,
          fixed_version: vuln.FixedVersion || null,
          layer: vuln.Layer?.Digest || null,
          cvss_score: vuln.CVSS?.nvd?.V3Score || null,
        },
        detected_at: new Date().toISOString(),
      });
    }
  }

  return vulnerabilities;
}

function mapTrivySeverity(severity?: string): NormalizedVulnerability['severity'] {
  if (!severity) return 'medium';
  
  const normalized = severity.toUpperCase();
  if (normalized === 'CRITICAL') return 'critical';
  if (normalized === 'HIGH') return 'high';
  if (normalized === 'MEDIUM') return 'medium';
  if (normalized === 'LOW') return 'low';
  
  return 'info';
}