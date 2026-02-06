// src/scanners/utils/title-normalizer.ts
// ============================================================================
// VULNERABILITY TITLE NORMALIZER - Production Rules
// ============================================================================
// STRICT RULES (enforced):
//   1. 5-12 words
//   2. ≤ 120 characters
//   3. Plain English, no jargon
//   4. NO file paths, line numbers, or code snippets
//   5. NO "Found", "Detected", or scanner boilerplate
//   6. NO remediation steps or action verbs
//   7. NO duplication (title ≠ description)
// ============================================================================

const MAX_TITLE_LENGTH = 120;
const MAX_TITLE_WORDS = 12;
const MIN_TITLE_WORDS = 3;

/**
 * Normalize a vulnerability title from scanner output
 * Enforces strict production rules for title quality
 * 
 * @param ruleId - Machine identifier (e.g., "javascript.lang.security.audit.xss.taint-unsafe-echo-tag")
 * @param rawTitle - Raw title from scanner (may be empty, may duplicate ruleId)
 * @param scannerType - Type of scanner for context-specific formatting
 * @returns Clean, validated, human-readable title
 */
export function normalizeTitle(
  ruleId: string,
  rawTitle?: string | null,
  scannerType?: string
): string {
  // If no raw title provided, extract from rule ID
  if (!rawTitle || rawTitle.trim() === '') {
    return extractTitleFromRuleId(ruleId, scannerType);
  }

  // Clean the raw title
  let cleaned = rawTitle.trim();

  // Check if title is just the rule ID or a duplicate
  if (cleaned === ruleId || cleaned.toLowerCase() === ruleId.toLowerCase()) {
    return extractTitleFromRuleId(ruleId, scannerType);
  }

  // Remove scanner boilerplate
  cleaned = cleaned
    .replace(/^(Found|Detected|Scanner found|Issue|Vulnerability):\s*/i, '')
    .replace(/^(Security|Warning|Error):\s*/i, '');

  // Remove file paths and line numbers
  cleaned = cleaned
    .replace(/\s+in\s+[\w\/\\.]+\.(js|ts|py|go|java|rb|php|c|cpp|h)/gi, '')
    .replace(/\s+at line \d+/gi, '')
    .replace(/:\d+:\d+/g, '');

  // Remove remediation steps (anything after "Fix", "Update", etc.)
  cleaned = cleaned.replace(/\.\s+(Fix|Update|Change|Modify|Replace|Remove).*/i, '');

  // Check for duplication patterns like "Taint-unsafe-echo-tag Taint-unsafe-echo-tag"
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length % 2 === 0 && words.length > 2) {
    const halfLength = words.length / 2;
    const firstHalf = words.slice(0, halfLength).join(' ');
    const secondHalf = words.slice(halfLength).join(' ');
    
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      // Duplication detected, use only first half
      cleaned = firstHalf;
    }
  }

  // Enforce word count limits
  const finalWords = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (finalWords.length > MAX_TITLE_WORDS) {
    cleaned = finalWords.slice(0, MAX_TITLE_WORDS).join(' ') + '...';
  } else if (finalWords.length < MIN_TITLE_WORDS) {
    // Too short, extract from rule ID instead
    return extractTitleFromRuleId(ruleId, scannerType);
  }

  // Enforce character length limit
  if (cleaned.length > MAX_TITLE_LENGTH) {
    cleaned = cleaned.substring(0, MAX_TITLE_LENGTH - 3) + '...';
  }

  // Final validation: must not be empty
  if (cleaned.length < 5) {
    return extractTitleFromRuleId(ruleId, scannerType);
  }

  // Return cleaned and capitalized title
  return capitalizeTitle(cleaned);
}

/**
 * Extract human-readable title from rule ID
 * Enforces length limits even for rule-based titles
 * 
 * Examples:
 *   "javascript.lang.security.audit.xss.taint-unsafe-echo-tag" → "XSS Taint Unsafe Echo"
 *   "CVE-2023-12345" → "CVE-2023-12345"
 *   "generic-api-key" → "Generic API Key"
 */
function extractTitleFromRuleId(ruleId: string, scannerType?: string): string {
  // Handle CVE/CWE identifiers - keep as-is
  if (ruleId.match(/^(CVE|CWE|GHSA)-/i)) {
    return ruleId.toUpperCase();
  }

  let title: string;

  // For dot-separated rule IDs (e.g., Semgrep), take the last 2-3 segments
  if (ruleId.includes('.')) {
    const parts = ruleId.split('.');
    
    // Take last 2-3 meaningful parts
    const relevantParts = parts.slice(-3).filter(part => 
      !['security', 'audit', 'lang', 'check', 'rules'].includes(part.toLowerCase())
    );
    
    const titleParts = relevantParts.slice(-2);
    title = titleParts
      .map(part => humanizeSegment(part))
      .join(' ');
  } else {
    // For hyphen/underscore-separated IDs
    title = humanizeSegment(ruleId);
  }

  // Enforce word count limit
  const words = title.split(/\s+/).filter(w => w.length > 0);
  if (words.length > MAX_TITLE_WORDS) {
    title = words.slice(0, MAX_TITLE_WORDS).join(' ');
  }

  // Enforce character length limit
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.substring(0, MAX_TITLE_LENGTH - 3) + '...';
  }

  return title;
}

/**
 * Convert a segment like "taint-unsafe-echo-tag" to "Taint Unsafe Echo Tag"
 */
function humanizeSegment(segment: string): string {
  return segment
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Capitalize title properly
 */
function capitalizeTitle(title: string): string {
  // Already capitalized
  if (title.charAt(0) === title.charAt(0).toUpperCase()) {
    return title;
  }

  // Capitalize first letter of each word
  return title
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Create a title for SCA vulnerabilities
 * 
 * @param packageName - Name of the vulnerable package
 * @param vulnerabilityId - CVE/GHSA/etc identifier
 * @param version - Current version (optional)
 * @returns Formatted title like "lodash: CVE-2023-12345"
 */
export function createSCATitle(
  packageName: string,
  vulnerabilityId: string,
  version?: string
): string {
  // Normalize vulnerability ID
  const vulnId = vulnerabilityId.toUpperCase();
  
  // Format: "package: VULN-ID"
  return `${packageName}: ${vulnId}`;
}

/**
 * Create a title for secret detection findings
 * 
 * @param secretType - Type of secret (e.g., "generic-api-key")
 * @returns Formatted title like "Generic API Key Exposed"
 */
export function createSecretTitle(secretType: string): string {
  const humanized = humanizeSegment(secretType);
  
  // Add "Exposed" suffix if not already present
  if (!humanized.toLowerCase().includes('exposed')) {
    return `${humanized} Exposed`;
  }
  
  return humanized;
}

/**
 * Create a title for IaC findings
 * 
 * @param checkName - Name of the check
 * @param resourceType - Type of resource (optional)
 * @returns Formatted title
 */
export function createIaCTitle(checkName: string, resourceType?: string): string {
  const humanized = humanizeSegment(checkName);
  
  if (resourceType) {
    return `${humanized} (${resourceType})`;
  }
  
  return humanized;
}
