// src/ai/smart-enrichment.ts - Selective AI Enrichment
// ===================================================================
import type { FastifyInstance } from 'fastify';
import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';
import type { AIEnrichmentResult } from './types';
import { buildEnrichmentPrompt, validateTokenBudget, DEFAULT_TOKEN_BUDGETS } from './prompts';
import { RateLimiterPresets } from '../utils/rate-limit';
import { env } from '../env';

export class SmartAIEnrichmentService {
  private provider: 'gemini' | 'claude' | 'disabled';
  private apiKey: string;
  private model: string;
  private limiter: any;
  private failureCount = 0;
  private successCount = 0;
  private skippedCount = 0;

  constructor(private fastify: FastifyInstance) {
    if (env.GEMINI_API_KEY) {
      this.provider = 'gemini';
      this.apiKey = env.GEMINI_API_KEY;
      this.model = 'gemini-2.0-flash-exp';
      this.limiter = RateLimiterPresets.GEMINI_FREE();
      fastify.log.info('Smart AI enrichment: Gemini FREE tier mode');
    } else if (env.ANTHROPIC_API_KEY) {
      this.provider = 'claude';
      this.apiKey = env.ANTHROPIC_API_KEY;
      this.model = 'claude-3-haiku-20240307';
      this.limiter = RateLimiterPresets.CLAUDE_FREE();
      fastify.log.info('Smart AI enrichment: Claude FREE tier mode');
    } else {
      this.provider = 'disabled';
      this.apiKey = '';
      this.model = '';
      this.limiter = null;
      fastify.log.warn('AI enrichment disabled');
    }
  }

  /**
   * SMART ENRICHMENT STRATEGY:
   * Only enrich vulnerabilities that NEED AI analysis
   * - Critical/High severity
   * - Has code context
   * - Complex issues (not simple config errors)
   */
  async enrichBatch(
    vulnerabilities: NormalizedVulnerability[]
  ): Promise<Map<string, AIEnrichmentResult>> {
    const results = new Map<string, AIEnrichmentResult>();

    if (this.provider === 'disabled' || vulnerabilities.length === 0) {
      vulnerabilities.forEach(v => results.set(v.id, this.getFallback(v)));
      return results;
    }

    // STEP 1: Filter vulnerabilities worth enriching
    const { worthEnriching, skipEnrichment } = this.prioritizeVulnerabilities(vulnerabilities);

    this.fastify.log.info(
      {
        total: vulnerabilities.length,
        enriching: worthEnriching.length,
        skipping: skipEnrichment.length,
        savings: `${Math.round((skipEnrichment.length / vulnerabilities.length) * 100)}%`,
      },
      'Smart AI enrichment: Filtered vulnerabilities'
    );

    // STEP 2: Skip low-priority items (use rule-based fallback)
    for (const vuln of skipEnrichment) {
      results.set(vuln.id, this.getFallback(vuln));
      this.skippedCount++;
    }

    // STEP 3: Enrich high-priority items with AI
    if (worthEnriching.length > 0) {
      await this.enrichPrioritizedBatch(worthEnriching, results);
    }

    this.fastify.log.info(
      {
        total: vulnerabilities.length,
        success: this.successCount,
        failed: this.failureCount,
        skipped: this.skippedCount,
        cost_saved: `~$${this.estimateSavings(skipEnrichment.length).toFixed(4)}`,
      },
      'Smart AI enrichment completed'
    );

    return results;
  }

  /**
   * Prioritize vulnerabilities for AI enrichment
   */
  private prioritizeVulnerabilities(vulns: NormalizedVulnerability[]) {
    const worthEnriching: NormalizedVulnerability[] = [];
    const skipEnrichment: NormalizedVulnerability[] = [];

    for (const vuln of vulns) {
      if (this.shouldEnrichWithAI(vuln)) {
        worthEnriching.push(vuln);
      } else {
        skipEnrichment.push(vuln);
      }
    }

    // Sort high-priority vulns by severity (critical first)
    worthEnriching.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });

    return { worthEnriching, skipEnrichment };
  }

  /**
   * Determine if vulnerability needs AI enrichment
   */
  private shouldEnrichWithAI(vuln: NormalizedVulnerability): boolean {
    // Rule 1: ALWAYS enrich Critical + High severity
    if (vuln.severity === 'critical' || vuln.severity === 'high') {
      return true;
    }

    // Rule 2: Skip if already has CVE (well-documented)
    if (vuln.cve) {
      return false;
    }

    // Rule 3: Skip simple config issues (IaC with clear fixes)
    if (vuln.type === 'iac' && vuln.recommendation?.length > 50) {
      return false;
    }

    // Rule 4: Enrich if has code snippet (needs context analysis)
    if (vuln.code_snippet && vuln.code_snippet.length > 20) {
      return true;
    }

    // Rule 5: Skip low confidence findings
    if (vuln.confidence < 0.6) {
      return false;
    }

    // Rule 6: Enrich complex SAST issues (medium severity with code)
    if (vuln.type === 'sast' && vuln.severity === 'medium') {
      return true;
    }

    // Default: Skip to save quota
    return false;
  }

  /**
   * Enrich prioritized batch with proper rate limiting
   */
  private async enrichPrioritizedBatch(
    vulns: NormalizedVulnerability[],
    results: Map<string, AIEnrichmentResult>
  ) {
    const batchSize = 3;
    const delayBetweenBatches = this.provider === 'gemini' ? 4500 : 13000;

    for (let i = 0; i < vulns.length; i += batchSize) {
      const batch = vulns.slice(i, i + batchSize);

      for (const vuln of batch) {
        try {
          await this.limiter.acquire(1);
          const enrichment = await this.enrichSingle(vuln);
          results.set(vuln.id, enrichment);
          this.successCount++;
        } catch (error: any) {
          this.failureCount++;
          this.fastify.log.warn({ error: error.message, vulnId: vuln.id }, 'AI enrichment failed');
          results.set(vuln.id, this.getFallback(vuln));
        }

        // Small delay between items
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Longer delay between batches
      if (i + batchSize < vulns.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
  }

  /**
   * Enrich single vulnerability
   */
  private async enrichSingle(vuln: NormalizedVulnerability): Promise<AIEnrichmentResult> {
    const prompt = buildEnrichmentPrompt(vuln);
    
    if (this.provider === 'disabled') {
      return this.getFallback(vuln);
    }
    
    const validation = validateTokenBudget(prompt, DEFAULT_TOKEN_BUDGETS[this.provider]);

    if (!validation.valid) {
      return this.getFallback(vuln);
    }

    const response = await this.callAI(prompt.user);
    return this.parseResponse(response, vuln);
  }

  /**
   * Call AI API
   */
  private async callAI(prompt: string): Promise<string> {
    if (this.provider === 'gemini') {
      return this.callGemini(prompt);
    } else if (this.provider === 'claude') {
      return this.callClaude(prompt);
    }
    throw new Error('AI provider not configured');
  }

  private async callGemini(prompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 120,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Parse AI response
   */
  private parseResponse(text: string, vuln: NormalizedVulnerability): AIEnrichmentResult {
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        explanation: parsed.explanation || this.generateExplanation(vuln),
        business_impact: parsed.business_impact || this.generateImpact(vuln),
        remediation: parsed.remediation || vuln.recommendation || 'Review and fix',
        suggested_patch: parsed.suggested_patch || null,
        risk_score: Math.min(Math.max(parsed.risk_score || 50, 0), 100),
        priority: ['P0', 'P1', 'P2', 'P3'].includes(parsed.priority) ? parsed.priority : 'P2',
        false_positive_score: Math.min(Math.max(parsed.false_positive_score || 0, 0), 1),
        confidence: Math.min(Math.max(parsed.confidence || 0.7, 0), 1),
      };
    } catch {
      return this.getFallback(vuln);
    }
  }

  /**
   * Rule-based fallback (NO AI)
   */
  private getFallback(vuln: NormalizedVulnerability): AIEnrichmentResult {
    return {
      explanation: this.generateExplanation(vuln),
      business_impact: this.generateImpact(vuln),
      remediation: vuln.recommendation || this.generateRemediation(vuln),
      suggested_patch: null,
      risk_score: this.calculateRiskScore(vuln),
      priority: this.calculatePriority(vuln),
      false_positive_score: this.calculateFalsePositiveScore(vuln),
      confidence: vuln.confidence,
    };
  }

  private generateExplanation(vuln: NormalizedVulnerability): string {
    const typeMap = {
      sast: 'This code pattern may introduce a security vulnerability',
      sca: 'This dependency has a known security vulnerability',
      secret: 'Hardcoded credentials detected in source code',
      iac: 'Infrastructure configuration does not follow security best practices',
      container: 'Container image contains vulnerable packages',
    };
    return typeMap[vuln.type] + '. ' + vuln.description;
  }

  private generateImpact(vuln: NormalizedVulnerability): string {
    const severityImpact = {
      critical: 'Could lead to complete system compromise or data breach',
      high: 'May allow unauthorized access or data exposure',
      medium: 'Could be exploited under certain conditions',
      low: 'Minor security concern with limited impact',
      info: 'Informational finding for awareness',
    };
    return severityImpact[vuln.severity];
  }

  private generateRemediation(vuln: NormalizedVulnerability): string {
    if (vuln.cve) return `Update to a patched version that fixes ${vuln.cve}`;
    if (vuln.type === 'secret') return 'Remove hardcoded credential and use environment variables';
    return 'Review the security documentation for this finding type';
  }

  private calculateRiskScore(vuln: NormalizedVulnerability): number {
    const severityScores = { critical: 90, high: 70, medium: 50, low: 30, info: 10 };
    return severityScores[vuln.severity];
  }

  private calculatePriority(vuln: NormalizedVulnerability): 'P0' | 'P1' | 'P2' | 'P3' {
    if (vuln.severity === 'critical') return 'P0';
    if (vuln.severity === 'high') return 'P1';
    if (vuln.severity === 'medium') return 'P2';
    return 'P3';
  }

  private calculateFalsePositiveScore(vuln: NormalizedVulnerability): number {
    if (vuln.cve) return 0.05; // CVEs are reliable
    if (vuln.confidence > 0.9) return 0.1;
    if (vuln.confidence < 0.5) return 0.6;
    return 0.3;
  }

  private estimateSavings(skipped: number): number {
    const costPerEnrichment = this.provider === 'gemini' ? 0.0002 : 0.0005;
    return skipped * costPerEnrichment;
  }
}