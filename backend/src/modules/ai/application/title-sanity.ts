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

const ACRONYMS = new Set([
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

const NOISE_WORDS = new Set([
  "admin",
  "asset",
  "assets",
  "category",
  "categories",
  "container",
  "critical",
  "detected",
  "docker",
  "generic",
  "group",
  "groups",
  "high",
  "iac",
  "id",
  "info",
  "issue",
  "low",
  "medium",
  "rule",
  "scanner",
  "section",
  "sections",
  "security",
  "severity",
  "vulnerability",
]);

const INSTRUCTION_STARTERS = new Set([
  "do",
  "ensure",
  "follow",
  "make",
  "must",
  "only",
  "please",
  "return",
  "should",
  "task",
  "you",
]);

const FRAGMENT_SUFFIXES = new Set([
  "ed",
  "er",
  "ers",
  "ing",
  "ion",
  "ly",
  "ment",
  "ness",
  "sion",
  "tion",
]);

const METADATA_LEAK_REGEX =
  /\b(admin[-_\s]*assets?|asset[-_\s]*groups?|generic[-_\s]*assets?)\b/i;
const NOISE_TOKEN_REGEX =
  /\b(CKV(?:_[A-Z0-9_]+)?|CWE[-_\s]?\d+|DOCKER|IAC|SAST|SCA|SECRETS?|CONTAINER|LOW|MEDIUM|HIGH|CRITICAL|INFO|SEVERITY)\b/i;
const INSTRUCTIONAL_PHRASE_REGEX =
  /\b(you\s+should|do\s+not|return\s+only|follow\s+these|required\s+json|task:|rules?:)\b/i;
const STANDALONE_FRAGMENT_REGEX =
  /\b(ing|ed|er|ers|ly|tion|sion|ment|ness)\b/i;

export const TITLE_MIN_WORDS = 3;
export const TITLE_MAX_WORDS = 12;

export interface TitleSanityValidationResult {
  valid: boolean;
  issues: string[];
  wordCount: number;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSourceText(value: string): string {
  return compactWhitespace(
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[()[\]{}<>`"“”'‘’*#]+/g, " ")
      .replace(/[._:/\\]+/g, " ")
      .replace(/\b(CKV(?:_[A-Z0-9_]+)?|CWE[-_\s]?\d+)\b/gi, " ")
      .replace(/\b\d+\b/g, " ")
  );
}

function shouldSplitHyphenatedToken(token: string): boolean {
  if (!token.includes("-")) {
    return false;
  }
  const segments = token.split("-").filter(Boolean);
  return segments.length > 2 || /\d/.test(token) || token.includes("_");
}

function tokenize(value: string): string[] {
  const source = normalizeSourceText(value);
  if (!source) {
    return [];
  }

  const tokens: string[] = [];
  for (const rawToken of source.split(/\s+/)) {
    const cleaned = rawToken.replace(/^[^a-zA-Z0-9-]+|[^a-zA-Z0-9-]+$/g, "");
    if (!cleaned) {
      continue;
    }

    const pieces = shouldSplitHyphenatedToken(cleaned) ? cleaned.split("-") : [cleaned];
    for (const piece of pieces) {
      const normalized = piece.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
      if (normalized) {
        tokens.push(normalized);
      }
    }
  }

  return tokens;
}

function mergeFragmentedWords(tokens: string[]): string[] {
  if (tokens.length < 2) {
    return tokens;
  }

  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const next = tokens[i + 1];
    if (next) {
      const nextLower = next.toLowerCase();
      if (FRAGMENT_SUFFIXES.has(nextLower) && current.length >= 3) {
        merged.push(`${current}${nextLower}`);
        i += 1;
        continue;
      }
    }
    merged.push(current);
  }

  return merged;
}

function isScannerNoise(word: string): boolean {
  const lower = word.toLowerCase();
  if (NOISE_WORDS.has(lower)) {
    return true;
  }
  if (/^\d+$/.test(lower)) {
    return true;
  }
  if (/^ckv(?:_[a-z0-9_]+)?$/i.test(word)) {
    return true;
  }
  if (/^cwe[-_]?\d+$/i.test(word)) {
    return true;
  }
  return false;
}

function cutInstructionTail(tokens: string[]): string[] {
  for (let index = 0; index < tokens.length; index += 1) {
    const lower = tokens[index].toLowerCase();
    if (!INSTRUCTION_STARTERS.has(lower)) {
      continue;
    }
    // Keep short technical titles like "Missing Health Check".
    if (index < TITLE_MIN_WORDS) {
      continue;
    }
    return tokens.slice(0, index);
  }
  return tokens;
}

function trimConnectorBoundaries(tokens: string[]): string[] {
  const trimmed = [...tokens];
  while (trimmed.length > 0 && CONNECTOR_WORDS.has(trimmed[0].toLowerCase())) {
    trimmed.shift();
  }
  while (
    trimmed.length > 0 &&
    (CONNECTOR_WORDS.has(trimmed[trimmed.length - 1].toLowerCase()) ||
      INSTRUCTION_STARTERS.has(trimmed[trimmed.length - 1].toLowerCase()))
  ) {
    trimmed.pop();
  }
  return trimmed;
}

function dedupeWords(tokens: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(token);
  }
  return deduped;
}

function toTitleCaseToken(word: string, index: number): string {
  const segments = word.split("-");
  const formattedSegments = segments.map((segment, segmentIndex) => {
    if (!segment) {
      return segment;
    }

    const upper = segment.toUpperCase();
    if (ACRONYMS.has(upper)) {
      return upper;
    }

    const lower = segment.toLowerCase();
    if (index > 0 && segmentIndex === 0 && CONNECTOR_WORDS.has(lower)) {
      return lower;
    }

    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return formattedSegments.join("-");
}

function normalizeWords(rawText: string): string[] {
  const tokenized = tokenize(rawText);
  const merged = mergeFragmentedWords(tokenized);
  const filtered = merged.filter((token) => !isScannerNoise(token));
  const cut = cutInstructionTail(filtered);
  const deduped = dedupeWords(cut);
  const trimmed = trimConnectorBoundaries(deduped);
  return trimmed;
}

function fallbackWordsByScanner(scannerType?: string): string[] {
  if (scannerType === "secrets") {
    return ["Exposed", "Secret", "in", "Source", "Code"];
  }
  if (scannerType === "iac") {
    return ["Insecure", "Infrastructure", "Configuration", "Increases", "Attack", "Surface"];
  }
  if (scannerType === "sca" || scannerType === "container") {
    return ["Vulnerable", "Dependency", "Requires", "Security", "Update"];
  }
  return ["Application", "Security", "Weakness", "in", "Code", "Path"];
}

export function sanitizeTitleForPersistence(
  rawTitle: string,
  options: {
    fallbackText?: string;
    scannerType?: string;
  } = {}
): string {
  const primaryWords = normalizeWords(rawTitle);
  const fallbackWords = options.fallbackText ? normalizeWords(options.fallbackText) : [];

  let selected =
    primaryWords.length >= TITLE_MIN_WORDS
      ? primaryWords
      : fallbackWords.length >= TITLE_MIN_WORDS
        ? fallbackWords
        : fallbackWordsByScanner(options.scannerType);

  selected = trimConnectorBoundaries(selected).slice(0, TITLE_MAX_WORDS);
  if (selected.length < TITLE_MIN_WORDS) {
    selected = fallbackWordsByScanner(options.scannerType);
  }

  return selected
    .map((word, index) => toTitleCaseToken(word, index))
    .join(" ")
    .trim();
}

export function validateTitleSanity(title: string): TitleSanityValidationResult {
  const issues: string[] = [];
  const normalized = compactWhitespace(title);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (!normalized) {
    issues.push("title_is_empty");
  }
  if (words.length < TITLE_MIN_WORDS) {
    issues.push("title_too_short");
  }
  if (words.length > TITLE_MAX_WORDS) {
    issues.push("title_too_long");
  }
  if (NOISE_TOKEN_REGEX.test(normalized) || METADATA_LEAK_REGEX.test(normalized)) {
    issues.push("metadata_or_scanner_noise_detected");
  }
  if (INSTRUCTIONAL_PHRASE_REGEX.test(normalized)) {
    issues.push("instructional_phrase_detected");
  }
  if (STANDALONE_FRAGMENT_REGEX.test(normalized)) {
    issues.push("fragmented_word_detected");
  }
  if (/\b\d+\b/.test(normalized)) {
    issues.push("numeric_token_detected");
  }

  const titleCaseLooksValid = words.every((rawWord, index) => {
    const word = rawWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (!word) {
      return true;
    }

    const parts = word.split("-");
    return parts.every((part, partIndex) => {
      if (!part) {
        return true;
      }
      const upper = part.toUpperCase();
      if (ACRONYMS.has(upper)) {
        return true;
      }
      const lower = part.toLowerCase();
      if (index > 0 && partIndex === 0 && CONNECTOR_WORDS.has(lower)) {
        return true;
      }
      return part.charAt(0) === part.charAt(0).toUpperCase();
    });
  });

  if (!titleCaseLooksValid) {
    issues.push("title_case_invalid");
  }

  return {
    valid: issues.length === 0,
    issues,
    wordCount: words.length,
  };
}
