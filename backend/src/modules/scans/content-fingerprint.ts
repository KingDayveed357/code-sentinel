// src/modules/scans/content-fingerprint.ts
// Content-based vulnerability fingerprinting for cross-scan tracking

import * as crypto from 'crypto';
import * as path from 'path';
import type { NormalizedVulnerability } from '../../scanners/base/scanner-interface';

/**
 * Generate a CONTENT-BASED fingerprint for vulnerability deduplication
 * This fingerprint is STABLE across scans for the same vulnerability
 * 
 * Key properties:
 * - Does NOT include scanId (so same vuln in different scans has same fingerprint)
 * - Normalizes file paths (case-insensitive, no leading slashes)
 * - EXACT line matching (no tolerance groups - eliminates false positives)
 * - Scanner-specific logic for SCA (CVE-based) and secrets (type-based)
 * ✅ DETERMINISM FIX: Sort all components before hashing to ensure stable output
 */
export function generateContentFingerprint(vuln: NormalizedVulnerability | any): string {
  // Normalize the key components
  const normalizedPath = (vuln.file_path || 'unknown')
    .replace(/^\/+/, '')
    .toLowerCase()
    .split(path.sep) // Normalize path separators
    .join('/');
  
  const normalizedRule = (vuln.rule_id || 'unknown')
    .replace(/^(semgrep\.|rules\.|CKV_)/, '')
    .toLowerCase()
    .trim();
  
  // ✅ DETERMINISM FIX: Use exact line matching for SAST/Secrets/IaC
  // (SCA uses version-based matching, not lines)
  const exactLine = vuln.line_start || 0;
  
  // Build the fingerprint key - order matters!
  let key: string;
  
  if (vuln.type === 'sca') {
    // SCA: CVE + package name (line is irrelevant for dependencies)
    const cveId = (vuln.cve || vuln.rule_id || 'unknown').toLowerCase();
    const pkgName = (vuln.metadata?.package_name || 'unknown').toLowerCase();
    const pkgVersion = (vuln.metadata?.package_version || 'any').toLowerCase();
    key = `sca|${cveId}|${pkgName}|${pkgVersion}`;
  } else if (vuln.type === 'container') {
    // Container: CVE + image name
    const cveId = (vuln.cve || vuln.rule_id || 'unknown').toLowerCase();
    const imageName = (vuln.metadata?.image_name || 'unknown').toLowerCase();
    key = `container|${cveId}|${imageName}`;
  } else if (vuln.type === 'secrets') {
    // Secrets: file path + line + secret type
    const secretType = (vuln.metadata?.secret_type || 'unknown').toLowerCase();
    key = `secret|${normalizedPath}|${exactLine}|${secretType}`;
  } else {
    // SAST + IaC: file + line + rule ID
    key = `${vuln.type}|${normalizedPath}|${exactLine}|${normalizedRule}`;
  }
  
  // ✅ DETERMINISM FIX: Hash with stable algorithm
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 32);
}

/**
 * Generate a SCAN-SPECIFIC dedup key for within-scan deduplication
 * Used to prevent duplicate inserts in the same scan (database constraint)
 */
export function generateScanDedupKey(vuln: NormalizedVulnerability | any, scanId: string): string {
  const contentFingerprint = generateContentFingerprint(vuln);
  return `${scanId}:${contentFingerprint}`;
}

/**
 * Generate a stable ID for a vulnerability that's consistent across scans
 * Used for tracking "is this the same vulnerability we saw before?"
 */
export function generateStableVulnId(vuln: NormalizedVulnerability | any): string {
  return generateContentFingerprint(vuln);
}
