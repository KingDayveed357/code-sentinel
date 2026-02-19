// src/scanners/utils/title-normalizer.ts
// Deterministic title normalization for scanner findings.

const MAX_TITLE_LENGTH = 120;
const MAX_TITLE_WORDS = 10;
const MIN_TITLE_WORDS = 4;

const CONNECTOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
]);

const NOISE_WORDS = new Set([
  "admin",
  "asset",
  "assets",
  "category",
  "categories",
  "generic",
  "group",
  "groups",
  "section",
  "sections",
  "rule",
  "scanner",
  "severity",
  "security",
  "vulnerability",
  "issue",
  "detected",
  "found",
  "checkov",
  "semgrep",
  "trivy",
  "gitleaks",
  "osv",
  "ckv",
  "cwe",
  "cve",
  "ghsa",
]);

const ACRONYMS = new Set([
  "ACL",
  "API",
  "AWS",
  "CORS",
  "CSRF",
  "CSP",
  "CVE",
  "CWE",
  "DOS",
  "HSTS",
  "IAM",
  "IDOR",
  "JWT",
  "RCE",
  "S3",
  "SQL",
  "SSRF",
  "TLS",
  "XSS",
  "XXE",
]);

const METADATA_PHRASE_REGEX =
  /\b(admin assets?|asset groups?|generic assets?|category)\b/gi;

const SCANNER_ID_REGEX =
  /\b(CKV(?:_[A-Z0-9_]+)?|CWE-\d+|CVE-\d{4}-\d+|GHSA-[A-Z0-9-]+)\b/gi;

const PATH_AND_LINE_REGEX =
  /\b[\w./\\-]+\.(js|ts|py|go|java|rb|php|c|cpp|h)\b|:\d+(?::\d+)?|\bline\s+\d+\b/gi;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanSourceText(value: string): string {
  return compactWhitespace(
    value
      .replace(METADATA_PHRASE_REGEX, " ")
      .replace(SCANNER_ID_REGEX, " ")
      .replace(PATH_AND_LINE_REGEX, " ")
      .replace(/[_./\\:-]+/g, " ")
      .replace(/[()[\]{}<>`"'#*]+/g, " ")
      .replace(/\b\d+\b/g, " ")
  );
}

function splitAndFilterWords(value: string): string[] {
  const rawWords = value
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ""))
    .filter(Boolean);

  const deduped: string[] = [];
  for (const rawWord of rawWords) {
    const lower = rawWord.toLowerCase();
    if (NOISE_WORDS.has(lower)) {
      continue;
    }
    if (/^\d+$/.test(lower)) {
      continue;
    }
    if (lower.length === 1 && !["x", "c"].includes(lower)) {
      continue;
    }
    if (!deduped.some((existing) => existing.toLowerCase() === lower)) {
      deduped.push(rawWord);
    }
  }

  return deduped;
}

function toTitleCase(words: string[]): string {
  const titled = words.map((word, index) => {
    const upper = word.toUpperCase();
    if (ACRONYMS.has(upper)) {
      return upper;
    }

    const lower = word.toLowerCase();
    if (index > 0 && CONNECTOR_WORDS.has(lower)) {
      return lower;
    }

    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return titled.join(" ");
}

function enforceLimits(words: string[]): string[] {
  const limited =
    words.length <= MAX_TITLE_WORDS ? [...words] : words.slice(0, MAX_TITLE_WORDS);

  while (
    limited.length > 0 &&
    CONNECTOR_WORDS.has(limited[limited.length - 1].toLowerCase())
  ) {
    limited.pop();
  }
  while (limited.length > 0 && CONNECTOR_WORDS.has(limited[0].toLowerCase())) {
    limited.shift();
  }

  return limited;
}

function fallbackByScanner(scannerType?: string): string {
  if (scannerType === "secrets") {
    return "Exposed Secret in Source Code";
  }
  if (scannerType === "iac") {
    return "Insecure Infrastructure Configuration Risk";
  }
  if (scannerType === "sca" || scannerType === "container") {
    return "Vulnerable Dependency Requires Security Update";
  }
  return "Application Security Weakness in Code Path";
}

function buildTitleFromSource(value: string): string | null {
  const cleaned = cleanSourceText(value);
  if (!cleaned) {
    return null;
  }

  const filteredWords = splitAndFilterWords(cleaned);
  if (filteredWords.length < MIN_TITLE_WORDS) {
    return null;
  }

  const limitedWords = enforceLimits(filteredWords);
  const title = compactWhitespace(toTitleCase(limitedWords));
  if (!title) {
    return null;
  }

  if (title.length <= MAX_TITLE_LENGTH) {
    return title;
  }

  const trimmed = compactWhitespace(
    title
      .split(/\s+/)
      .reduce<string[]>((acc, word) => {
        const candidate = compactWhitespace([...acc, word].join(" "));
        if (candidate.length <= MAX_TITLE_LENGTH) {
          acc.push(word);
        }
        return acc;
      }, [])
      .join(" ")
  );

  return trimmed || null;
}

/**
 * Normalize a vulnerability title from scanner output into a human-readable title.
 */
export function normalizeTitle(
  ruleId: string,
  rawTitle?: string | null,
  scannerType?: string,
  description?: string | null
): string {
  const sourceOrder: Array<string | null | undefined> = [rawTitle, description, ruleId];
  for (const source of sourceOrder) {
    if (!source || !source.trim()) {
      continue;
    }
    const title = buildTitleFromSource(source);
    if (title) {
      return title;
    }
  }

  return fallbackByScanner(scannerType);
}

/**
 * Create a title for SCA vulnerabilities.
 */
export function createSCATitle(
  packageName: string,
  vulnerabilityId: string,
  version?: string
): string {
  const source = [packageName, vulnerabilityId, version].filter(Boolean).join(" ");
  return normalizeTitle(vulnerabilityId, source, "sca", source);
}

/**
 * Create a title for secret detection findings.
 */
export function createSecretTitle(secretType: string): string {
  return normalizeTitle(secretType, `${secretType} exposed secret`, "secrets", secretType);
}

/**
 * Create a title for IaC findings.
 */
export function createIaCTitle(checkName: string, resourceType?: string): string {
  const source = [checkName, resourceType].filter(Boolean).join(" ");
  return normalizeTitle(checkName, source, "iac", source);
}
