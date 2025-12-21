import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';

export interface PromptTemplate {
  system?: string;
  user: string;
  estimatedTokens: number;
}

/**
 * Estimate tokens for text (rough approximation)
 * Rule: 1 token ≈ 4 characters for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit token limit
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  
  return text.substring(0, maxChars - 50) + '\n\n... [truncated for length]';
}

/**
 * Smart code snippet truncation - keep important parts
 */
export function smartTruncateCode(code: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  
  if (code.length <= maxChars) return code;

  const lines = code.split('\n');
  
  // Priority: keep imports, function signatures, and key patterns
  const important: string[] = [];
  const regular: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('from ') ||
      trimmed.includes('function ') ||
      trimmed.includes('const ') ||
      trimmed.includes('class ') ||
      trimmed.includes('async ') ||
      trimmed.includes('await ') ||
      // Security-relevant keywords
      trimmed.includes('auth') ||
      trimmed.includes('password') ||
      trimmed.includes('token') ||
      trimmed.includes('secret') ||
      trimmed.includes('api') ||
      trimmed.includes('sql') ||
      trimmed.includes('query') ||
      trimmed.includes('exec')
    ) {
      important.push(line);
    } else {
      regular.push(line);
    }
  }

  // Build result: important lines first
  let result = important.join('\n');
  const remainingSpace = maxChars - result.length - 100;

  if (remainingSpace > 0 && regular.length > 0) {
    const additionalLines = regular.join('\n').substring(0, remainingSpace);
    result += '\n' + additionalLines;
  }

  return result + '\n\n// ... [code truncated]';
}

/**
 * Build enrichment prompt for a single vulnerability
 */
export function buildEnrichmentPrompt(
  vuln: NormalizedVulnerability
): PromptTemplate {
  const codeContext = vuln.code_snippet
    ? `\n\n**Vulnerable Code:**\n\`\`\`${vuln.file_path?.split('.').pop() || 'code'}\n${smartTruncateCode(vuln.code_snippet, 200)}\n\`\`\``
    : '';

  const prompt = `You are a security expert analyzing application vulnerabilities. Provide actionable insights for developers.

**Vulnerability Details:**
- Type: ${vuln.type.toUpperCase()}
- Scanner: ${vuln.scanner}
- Severity: ${vuln.severity}
- Rule ID: ${vuln.rule_id}
- File: ${vuln.file_path || 'N/A'}
- Line: ${vuln.line_start || 'N/A'}
- Description: ${truncateToTokenLimit(vuln.description, 150)}${codeContext}

${vuln.cwe.length > 0 ? `- CWE: ${vuln.cwe.join(', ')}` : ''}
${vuln.cve ? `- CVE: ${vuln.cve}` : ''}

**Required Response (JSON only, no markdown):**
{
  "explanation": "Explain the vulnerability in 2-3 sentences. Be clear and concise.",
  "business_impact": "What's the real-world risk if exploited? Focus on business consequences.",
  "remediation": "Provide step-by-step fix instructions. Be specific and actionable.",
  "suggested_patch": "If applicable, provide fixed code snippet. Otherwise use null.",
  "risk_score": 0-100,
  "priority": "P0" (critical, fix now) | "P1" (urgent, this week) | "P2" (important, this month) | "P3" (backlog),
  "false_positive_score": 0.0-1.0,
  "confidence": 0.0-1.0
}

Guidelines:
- Be concise but thorough
- Focus on practical, actionable advice
- Consider the severity and CWE/CVE context
- Risk score formula: (exploitability × impact × exposure)
- False positive score: Low if CWE/CVE present, higher for generic rules`;

  return {
    user: prompt,
    estimatedTokens: estimateTokens(prompt),
  };
}

/**
 * Build batch enrichment prompt (more efficient for multiple vulnerabilities)
 */
export function buildBatchEnrichmentPrompt(
  vulnerabilities: NormalizedVulnerability[],
  maxVulnsPerBatch: number = 3
): PromptTemplate {
  const batch = vulnerabilities.slice(0, maxVulnsPerBatch);

  const vulnDescriptions = batch
    .map(
      (v, i) =>
        `**Vulnerability ${i + 1}:**
- ID: ${v.id}
- Type: ${v.type} (${v.scanner})
- Severity: ${v.severity}
- Rule: ${v.rule_id}
- File: ${v.file_path || 'N/A'}:${v.line_start || '?'}
- Description: ${truncateToTokenLimit(v.description, 100)}`
    )
    .join('\n\n');

  const prompt = `Analyze these ${batch.length} vulnerabilities and provide enrichment for each.

${vulnDescriptions}

Respond with JSON array (no markdown):
[
  {
    "id": "vulnerability-id-here",
    "explanation": "...",
    "business_impact": "...",
    "remediation": "...",
    "suggested_patch": null,
    "risk_score": 0-100,
    "priority": "P0|P1|P2|P3",
    "false_positive_score": 0.0-1.0,
    "confidence": 0.0-1.0
  }
]`;

  return {
    user: prompt,
    estimatedTokens: estimateTokens(prompt),
  };
}

/**
 * Build deduplication prompt
 */
export function buildDeduplicationPrompt(
  vulnerabilities: NormalizedVulnerability[]
): PromptTemplate {
  const descriptions = vulnerabilities
    .map(
      (v, i) =>
        `${i + 1}. ${v.file_path}:${v.line_start} - ${v.rule_id} (${v.severity})`
    )
    .join('\n');

  const prompt = `Analyze these ${vulnerabilities.length} vulnerabilities and identify duplicates or closely related issues.

${descriptions}

Group related vulnerabilities and return JSON:
{
  "groups": [
    {
      "primary_id": "keep this one",
      "duplicates": ["id1", "id2"],
      "reason": "why they're duplicates"
    }
  ]
}`;

  return {
    user: prompt,
    estimatedTokens: estimateTokens(prompt),
  };
}

/**
 * Build false positive detection prompt
 */
export function buildFalsePositivePrompt(
  vuln: NormalizedVulnerability
): PromptTemplate {
  const codeContext = vuln.code_snippet
    ? `\n\nCode:\n\`\`\`\n${smartTruncateCode(vuln.code_snippet, 150)}\n\`\`\``
    : '';

  const prompt = `Analyze if this is a false positive.

Vulnerability: ${vuln.title}
File: ${vuln.file_path}
Rule: ${vuln.rule_id}
Description: ${vuln.description}${codeContext}

Respond with JSON:
{
  "is_false_positive": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explain why"
}`;

  return {
    user: prompt,
    estimatedTokens: estimateTokens(prompt),
  };
}

/**
 * Token budget validator
 */
export interface TokenBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  reservedTokens: number; // For system messages, etc.
}

export const DEFAULT_TOKEN_BUDGETS = {
  gemini: {
    maxInputTokens: 900000, // Gemini 2.0 Flash: 1M context
    maxOutputTokens: 8192,
    reservedTokens: 1000,
  },
  claude: {
    maxInputTokens: 180000, // Claude Haiku: 200k context
    maxOutputTokens: 4096,
    reservedTokens: 500,
  },
};

export function validateTokenBudget(
  prompt: PromptTemplate,
  budget: TokenBudget
): { valid: boolean; message?: string } {
  const totalInput = prompt.estimatedTokens + budget.reservedTokens;

  if (totalInput > budget.maxInputTokens) {
    return {
      valid: false,
      message: `Prompt too large: ~${totalInput} tokens (max: ${budget.maxInputTokens})`,
    };
  }

  const totalEstimate = totalInput + budget.maxOutputTokens;
  const modelLimit = budget.maxInputTokens + budget.maxOutputTokens;

  if (totalEstimate > modelLimit) {
    return {
      valid: false,
      message: `Combined input+output exceeds model capacity`,
    };
  }

  return { valid: true };
}