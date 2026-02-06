// src/services/ai/titleGenerator.ts
// ============================================================================
// VULNERABILITY TITLE GENERATOR
// ============================================================================
// Enforces strict title rules:
//   - 5-12 words
//   - ≤ 120 characters
//   - Plain English
//   - NO file paths, remediation steps, or scanner boilerplate
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type { AIClientService } from './aiClient';

export interface TitleGenerationContext {
  rule_id: string;
  description: string;
  scanner_type: string;
  severity: string;
  file_path?: string | null;
  cwe?: string | null;
  raw_title?: string | null;
}

export interface TitleValidationResult {
  valid: boolean;
  issues: string[];
  title: string;
}

export class TitleGeneratorService {
  private readonly MAX_LENGTH = 120;
  private readonly MIN_LENGTH = 10;
  private readonly MIN_WORDS = 3;
  private readonly MAX_WORDS = 12;
  
  // Forbidden patterns in titles
  private readonly FORBIDDEN_PATTERNS = [
    /found|detected|scanner/i,           // Scanner boilerplate
    /step \d+|first|then|next/i,         // Remediation steps
    /\.(js|ts|py|go|java|rb|php)/,       // File extensions
    /\/|\\|\.\.\./,                       // File paths
    /line \d+|:\d+/i,                    // Line numbers
    /fix|update|change|modify/i,         // Action verbs (remediation)
  ];

  constructor(
    private fastify: FastifyInstance,
    private aiClient: AIClientService
  ) {}

  /**
   * Generate or validate a vulnerability title
   * Returns a clean, validated title that meets all requirements
   */
  async generateTitle(context: TitleGenerationContext): Promise<string> {
    // Step 1: Try AI generation first (if enabled and appropriate)
    if (this.shouldUseAI(context)) {
      try {
        const aiResult = await this.aiClient.generateTitle({
          rule_id: context.rule_id,
          description: context.description,
          scanner_type: context.scanner_type,
          severity: context.severity,
          file_path: context.file_path,
          cwe: context.cwe,
        });

        const validation = this.validateTitle(aiResult.title);
        if (validation.valid) {
          this.fastify.log.debug(
            { title: aiResult.title, source: aiResult.source, model: aiResult.model },
            'Generated title via AI'
          );
          return aiResult.title;
        }
      } catch (error: any) {
        this.fastify.log.warn(
          { error: error.message, context },
          'AI title generation failed - trying scanner title'
        );
      }
    }

    // Step 2: Check if raw title exists and is valid (fallback)
    if (context.raw_title) {
      const validation = this.validateTitle(context.raw_title);
      if (validation.valid) {
        this.fastify.log.debug(
          { title: context.raw_title, source: 'scanner' },
          'Using scanner-provided title'
        );
        return context.raw_title;
      }
      
      // Try to fix the title
      const fixed = this.fixTitle(context.raw_title);
      const fixedValidation = this.validateTitle(fixed);
      if (fixedValidation.valid) {
        this.fastify.log.debug(
          { original: context.raw_title, fixed, source: 'scanner-fixed' },
          'Fixed scanner title'
        );
        return fixed;
      }
    }

    // Step 3: Fallback to rule-based generation
    const ruleBased = this.generateFromRuleId(context);
    this.fastify.log.debug(
      { title: ruleBased, source: 'rule-based' },
      'Generated title from rule ID'
    );
    return ruleBased;
  }

  /**
   * Validate a title against all rules
   */
  validateTitle(title: string): TitleValidationResult {
    const issues: string[] = [];
    const trimmed = title.trim();

    // Length checks
    if (trimmed.length < this.MIN_LENGTH) {
      issues.push(`Too short (${trimmed.length} < ${this.MIN_LENGTH} chars)`);
    }
    if (trimmed.length > this.MAX_LENGTH) {
      issues.push(`Too long (${trimmed.length} > ${this.MAX_LENGTH} chars)`);
    }

    // Word count checks
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    if (words.length < this.MIN_WORDS) {
      issues.push(`Too few words (${words.length} < ${this.MIN_WORDS})`);
    }
    if (words.length > this.MAX_WORDS) {
      issues.push(`Too many words (${words.length} > ${this.MAX_WORDS})`);
    }

    // Pattern checks
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(trimmed)) {
        issues.push(`Contains forbidden pattern: ${pattern.source}`);
      }
    }

    // Duplication check (title = description)
    const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.length > 20 && normalized === normalized.split('').reverse().join('')) {
      issues.push('Title appears to be duplicated');
    }

    return {
      valid: issues.length === 0,
      issues,
      title: trimmed,
    };
  }

  /**
   * Attempt to fix a broken title
   */
  private fixTitle(title: string): string {
    let fixed = title.trim();

    // Remove common prefixes
    fixed = fixed
      .replace(/^(Found|Detected|Scanner found):\s*/i, '')
      .replace(/^(Vulnerability|Issue|Problem):\s*/i, '');

    // Remove file paths
    fixed = fixed.replace(/\s+in\s+[\w\/\\.]+\.(js|ts|py|go|java|rb|php)/gi, '');
    
    // Remove line numbers
    fixed = fixed.replace(/\s+at line \d+/gi, '');
    fixed = fixed.replace(/:\d+:\d+/g, '');

    // Remove remediation steps
    fixed = fixed.replace(/\.\s+(Fix|Update|Change|Modify).*/i, '');

    // Truncate if too long
    if (fixed.length > this.MAX_LENGTH) {
      const words = fixed.split(/\s+/);
      fixed = words.slice(0, this.MAX_WORDS).join(' ');
      if (fixed.length > this.MAX_LENGTH) {
        fixed = fixed.substring(0, this.MAX_LENGTH - 3) + '...';
      }
    }

    // Capitalize first letter
    if (fixed.length > 0) {
      fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
    }

    return fixed;
  }

  /**
   * Generate title from rule ID (fallback)
   */
  private generateFromRuleId(context: TitleGenerationContext): string {
    const { normalizeTitle } = require('../../scanners/utils/title-normalizer');
    
    let title = normalizeTitle(
      context.rule_id,
      context.description,
      context.scanner_type
    );

    // Ensure it meets length requirements
    if (title.length > this.MAX_LENGTH) {
      const words = title.split(/\s+/);
      title = words.slice(0, this.MAX_WORDS).join(' ');
      if (title.length > this.MAX_LENGTH) {
        title = title.substring(0, this.MAX_LENGTH - 3) + '...';
      }
    }

    return title;
  }

  /**
   * Determine if AI should be used for this title
   */
  private shouldUseAI(context: TitleGenerationContext): boolean {
    // Use AI for critical and high severity issues
    // These benefit most from clear, human-readable titles
    if (context.severity === 'critical' || context.severity === 'high') {
      return true;
    }

    // Don't use AI for low-priority issues (save API costs)
    return false;
  }
}
