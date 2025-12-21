
// src/ai/client.ts (FIXED - Free Tier + Graceful Degradation)
import type { FastifyInstance } from 'fastify';
import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';
import type { AIEnrichmentResult, TokenUsageMetrics } from './types';
import {
  buildEnrichmentPrompt,
  validateTokenBudget,
  DEFAULT_TOKEN_BUDGETS,
  type TokenBudget,
} from './prompts';
import { env } from '../env';
import { RateLimiter } from "../utils/rate-limit";

export class AIService {
  private provider: 'gemini' | 'claude' | 'disabled';
  private apiKey: string;
  private model: string;
  private tokenBudget: TokenBudget;
  private tokenUsage: TokenUsageMetrics[] = [];
  
  // FREE TIER LIMITS: Gemini = 15 RPM, Claude = 5 RPM
  private limiter: RateLimiter;
  private maxRetries = 2;
  private failedEnrichments = 0;
  private maxFailuresBeforeDisable = 10;

  constructor(private fastify: FastifyInstance) {
    if (env.GEMINI_API_KEY) {
      this.provider = 'gemini';
      this.apiKey = env.GEMINI_API_KEY;
      this.model = 'gemini-2.0-flash-exp';
      this.tokenBudget = DEFAULT_TOKEN_BUDGETS.gemini;
      // FREE TIER: 15 requests per minute = 1 request per 4 seconds
      this.limiter = new RateLimiter(15, 0.25); // 0.25 tokens/sec = 15/min
      fastify.log.info('AI service initialized with Gemini 2.0 Flash (FREE TIER)');
    } else if (env.ANTHROPIC_API_KEY) {
      this.provider = 'claude';
      this.apiKey = env.ANTHROPIC_API_KEY;
      this.model = 'claude-3-haiku-20240307';
      this.tokenBudget = DEFAULT_TOKEN_BUDGETS.claude;
      // Claude free tier is more restrictive
      this.limiter = new RateLimiter(5, 0.083); // ~5 requests per minute
      fastify.log.info('AI service initialized with Claude Haiku (FREE TIER)');
    } else {
      this.provider = 'disabled';
      this.apiKey = '';
      this.model = '';
      this.tokenBudget = DEFAULT_TOKEN_BUDGETS.gemini;
      this.limiter = new RateLimiter(1, 1);
      fastify.log.warn('AI service disabled - no API key configured');
    }
  }

  isEnabled(): boolean {
    // Auto-disable if too many failures
    if (this.failedEnrichments >= this.maxFailuresBeforeDisable) {
      this.fastify.log.warn(
        { failures: this.failedEnrichments },
        'AI service auto-disabled due to repeated failures'
      );
      return false;
    }
    return this.provider !== 'disabled';
  }

  getTokenUsage() {
    const totalInput = this.tokenUsage.reduce((sum, m) => sum + m.input_tokens, 0);
    const totalOutput = this.tokenUsage.reduce((sum, m) => sum + m.output_tokens, 0);
    const totalCost = this.tokenUsage.reduce((sum, m) => sum + m.total_cost_usd, 0);

    return {
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      total_cost_usd: totalCost,
      requests_count: this.tokenUsage.length,
      failed_count: this.failedEnrichments,
    };
  }

  /**
   * Enrich a single vulnerability with AI analysis
   * Returns fallback if AI fails - NEVER throws
   */
  async enrichVulnerability(vuln: NormalizedVulnerability): Promise<AIEnrichmentResult> {
    if (!this.isEnabled()) {
      return this.getFallbackEnrichment();
    }

    const promptTemplate = buildEnrichmentPrompt(vuln);
    const validation = validateTokenBudget(promptTemplate, this.tokenBudget);
    
    if (!validation.valid) {
      this.fastify.log.warn({ vulnId: vuln.id }, 'Prompt exceeds token budget - using fallback');
      return this.getFallbackEnrichment();
    }

    try {
      const startTime = Date.now();
      
      // Try AI enrichment with limited retries
      const response = await this.callAIWithRetry(
        promptTemplate.user,
        150, // Reduced max tokens for free tier
        this.maxRetries
      );

      const inputTokens = promptTemplate.estimatedTokens;
      const outputTokens = Math.ceil(response.length / 4);
      const cost = this.calculateCost(inputTokens, outputTokens);

      this.tokenUsage.push({
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_cost_usd: cost,
        timestamp: new Date().toISOString(),
      });

      this.fastify.log.debug(
        {
          vulnId: vuln.id,
          inputTokens,
          outputTokens,
          cost: `$${cost.toFixed(6)}`,
          duration: Date.now() - startTime,
        },
        'AI enrichment completed'
      );

      // Reset failure count on success
      this.failedEnrichments = Math.max(0, this.failedEnrichments - 1);

      return this.parseEnrichmentResponse(response);
    } catch (error: any) {
      this.failedEnrichments++;
      this.fastify.log.error(
        { 
          error: error.message, 
          vulnId: vuln.id,
          totalFailures: this.failedEnrichments 
        },
        'AI enrichment failed - using fallback'
      );
      
      // Return fallback instead of throwing
      return this.getFallbackEnrichment();
    }
  }

  /**
   * Batch enrichment with FREE TIER optimization
   * - Smaller batches
   * - Longer delays between batches
   * - Graceful degradation on failures
   */
  async enrichBatch(
    vulnerabilities: NormalizedVulnerability[]
  ): Promise<Map<string, AIEnrichmentResult>> {
    const results = new Map<string, AIEnrichmentResult>();

    if (!this.isEnabled() || vulnerabilities.length === 0) {
      vulnerabilities.forEach((v) => {
        results.set(v.id, this.getFallbackEnrichment());
      });
      return results;
    }

    // FREE TIER: Process in VERY small batches
    const batchSize = this.provider === 'gemini' ? 3 : 2; // Smaller for free tier
    const delayBetweenBatches = this.provider === 'gemini' ? 5000 : 12000; // 5s for Gemini, 12s for Claude
    const totalBatches = Math.ceil(vulnerabilities.length / batchSize);

    this.fastify.log.info(
      { 
        total: vulnerabilities.length, 
        batches: totalBatches,
        batchSize,
        provider: this.provider,
        estimatedTime: `${Math.ceil((totalBatches * delayBetweenBatches) / 1000)}s`
      },
      'Starting batch AI enrichment (FREE TIER MODE)'
    );

    for (let i = 0; i < vulnerabilities.length; i += batchSize) {
      const batch = vulnerabilities.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      this.fastify.log.debug(
        { batchNum, totalBatches, items: batch.length },
        'Processing batch'
      );

      // Process batch items sequentially to respect rate limits
      for (const vuln of batch) {
        const enrichment = await this.enrichVulnerability(vuln);
        results.set(vuln.id, enrichment);
        
        // Small delay between individual items
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Longer delay between batches for free tier
      if (i + batchSize < vulnerabilities.length) {
        this.fastify.log.debug(
          { waitingMs: delayBetweenBatches },
          'Waiting between batches (free tier rate limit)'
        );
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
      }

      // Stop enrichment if too many failures
      if (this.failedEnrichments >= this.maxFailuresBeforeDisable) {
        this.fastify.log.warn(
          { 
            processed: results.size, 
            remaining: vulnerabilities.length - results.size 
          },
          'Stopping batch enrichment due to repeated failures'
        );
        
        // Fill remaining with fallback
        for (let j = i + batchSize; j < vulnerabilities.length; j++) {
          results.set(vulnerabilities[j].id, this.getFallbackEnrichment());
        }
        break;
      }
    }

    const usage = this.getTokenUsage();
    const successfulEnrichments = vulnerabilities.length - this.failedEnrichments;
    
    this.fastify.log.info(
      {
        total: results.size,
        successful: successfulEnrichments,
        failed: this.failedEnrichments,
        totalCost: `$${usage.total_cost_usd.toFixed(4)}`,
        avgCostPerVuln: `$${(usage.total_cost_usd / Math.max(successfulEnrichments, 1)).toFixed(6)}`,
      },
      'Batch enrichment completed'
    );

    return results;
  }

  deduplicateFindings(vulnerabilities: NormalizedVulnerability[]): NormalizedVulnerability[] {
    const groups = new Map<string, NormalizedVulnerability[]>();

    for (const vuln of vulnerabilities) {
      const lineGroup = Math.floor((vuln.line_start || 0) / 10) * 10;
      const key = `${vuln.file_path}:${vuln.rule_id}:${lineGroup}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(vuln);
    }

    const deduplicated: NormalizedVulnerability[] = [];
    const scannerPriority = { semgrep: 5, osv: 4, gitleaks: 3, checkov: 2, trivy: 1 };

    for (const group of groups.values()) {
      if (group.length === 1) {
        deduplicated.push(group[0]);
      } else {
        group.sort((a, b) => {
          if (a.confidence !== b.confidence) {
            return b.confidence - a.confidence;
          }
          return (scannerPriority[b.scanner] || 0) - (scannerPriority[a.scanner] || 0);
        });
        deduplicated.push(group[0]);
      }
    }

    const removed = vulnerabilities.length - deduplicated.length;
    if (removed > 0) {
      this.fastify.log.info(
        { original: vulnerabilities.length, deduplicated: deduplicated.length, removed },
        'Deduplication complete'
      );
    }

    return deduplicated;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    if (this.provider === 'gemini') {
      // Gemini 2.0 Flash pricing
      const inputCost = (inputTokens / 1_000_000) * 0.075;
      const outputCost = (outputTokens / 1_000_000) * 0.3;
      return inputCost + outputCost;
    } else if (this.provider === 'claude') {
      // Claude Haiku pricing
      const inputCost = (inputTokens / 1_000_000) * 0.25;
      const outputCost = (outputTokens / 1_000_000) * 1.25;
      return inputCost + outputCost;
    }
    return 0;
  }

  /**
   * Call AI with retry logic - LIMITED retries for free tier
   */
  private async callAIWithRetry(
    prompt: string,
    maxTokens: number,
    retriesLeft: number
  ): Promise<string> {
    try {
      return await this.callAI(prompt, maxTokens);
    } catch (error: any) {
      if (retriesLeft <= 0) {
        throw error;
      }

      // Only retry on rate limit errors (429)
      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        const backoffDelay = (this.maxRetries - retriesLeft + 1) * 3000; // 3s, 6s
        this.fastify.log.warn(
          { retriesLeft, backoffDelay },
          'Rate limit hit - backing off'
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        return this.callAIWithRetry(prompt, maxTokens, retriesLeft - 1);
      }

      // Don't retry other errors
      throw error;
    }
  }

  private async callAI(prompt: string, maxTokens: number): Promise<string> {
    if (this.provider === 'gemini') {
      return this.callGemini(prompt, maxTokens);
    } else if (this.provider === 'claude') {
      return this.callClaude(prompt, maxTokens);
    }
    throw new Error('AI provider not configured');
  }

  private async callGemini(prompt: string, maxTokens: number): Promise<string> {
    await this.limiter.acquire(1); // Respect rate limits

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: Math.min(maxTokens, 150), // FREE TIER SAFE
            topP: 0.9
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No response from Gemini API');
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Gemini API timeout');
      }
      
      throw error;
    }
  }

  private async callClaude(prompt: string, maxTokens: number): Promise<string> {
    await this.limiter.acquire(1);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: Math.min(maxTokens, 150),
          messages: [{ role: "user", content: prompt }]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = data?.content?.[0]?.text;
      
      if (!text) {
        throw new Error('No response from Claude API');
      }

      return text;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Claude API timeout');
      }
      
      throw error;
    }
  }

  private parseEnrichmentResponse(text: string): AIEnrichmentResult {
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        explanation: parsed.explanation || 'AI analysis unavailable',
        business_impact: parsed.business_impact || 'Potential security risk',
        remediation: parsed.remediation || 'Review and address the issue',
        suggested_patch: parsed.suggested_patch || null,
        risk_score: Math.min(Math.max(parsed.risk_score || 50, 0), 100),
        priority: ['P0', 'P1', 'P2', 'P3'].includes(parsed.priority) ? parsed.priority : 'P2',
        false_positive_score: Math.min(Math.max(parsed.false_positive_score || 0, 0), 1),
        confidence: Math.min(Math.max(parsed.confidence || 0.7, 0), 1),
      };
    } catch (error) {
      this.fastify.log.error({ error, text: text.substring(0, 200) }, 'Failed to parse AI response');
      return this.getFallbackEnrichment();
    }
  }

  private getFallbackEnrichment(): AIEnrichmentResult {
    return {
      explanation: 'This vulnerability was detected by automated scanning. AI enrichment unavailable.',
      business_impact: 'This issue could pose a security risk to your application.',
      remediation: 'Review the finding and apply the recommended security fix from the scanner documentation.',
      suggested_patch: null,
      risk_score: 50,
      priority: 'P2',
      false_positive_score: 0,
      confidence: 0.5,
    };
  }
}