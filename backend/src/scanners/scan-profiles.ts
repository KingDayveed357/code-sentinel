// src/scanners/scan-profiles.ts - Centralized Scan Configuration
// ✅ REAL SCAN TYPES: Each type has distinct rule sets and timeout

export interface ScanProfile {
  name: string;
  description: string;
  enabledScanners: ScannerConfig;
  aiEnrichmentLevel: 'none' | 'lightweight' | 'full';
  timeoutSeconds: number;
  maxRules: number; // Limit rule depth per scanner
  priority: number;
}

export interface ScannerConfig {
  sast: boolean;
  sca: boolean;
  secrets: boolean;
  iac: boolean;
  container: boolean;
}

export const SCAN_PROFILES: Record<'quick' | 'full', ScanProfile> = {
  quick: {
    name: 'Quick Scan',
    description: 'Fast scan for high-confidence issues (SAST + Secrets) - ~30 seconds',
    enabledScanners: { 
      sast: true,      // Semgrep p/ci only (not p/security-audit or p/owasp-top-ten)
      sca: false,      // Skip dependency scanning (time-consuming)
      secrets: true,   // Gitleaks (fast)
      iac: false,      // Skip infrastructure as code
      container: false // Skip container scanning
    },
    aiEnrichmentLevel: 'lightweight',
    timeoutSeconds: 120,    // 2 minutes max
    maxRules: 50,           // Limit SAST rules to top-priority ones
    priority: 1
  },
  full: {
    name: 'Full Scan',
    description: 'Comprehensive security analysis (all scanners) - ~5 minutes',
    enabledScanners: { 
      sast: true,      // All Semgrep rules (p/ci + p/security-audit + p/owasp-top-ten)
      sca: true,       // OSV dependency scanning
      secrets: true,   // Gitleaks
      iac: true,       // Checkov infrastructure as code
      container: true  // Trivy container scanning (if Dockerfile present)
    },
    aiEnrichmentLevel: 'full',
    timeoutSeconds: 300,    // 5 minutes max
    maxRules: 999,          // All rules enabled
    priority: 2
  },
};

/**
 * Get profile by type
 * ✅ FIX: Removed broken 'custom' type - users use 'quick' or 'full'
 */
export function getProfile(scanType: string): ScanProfile {
  if (scanType === 'quick') return SCAN_PROFILES.quick;
  if (scanType === 'full') return SCAN_PROFILES.full;
  // Default to quick for unknown types
  return SCAN_PROFILES.quick;
}
