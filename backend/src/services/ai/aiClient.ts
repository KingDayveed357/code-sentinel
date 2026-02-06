// src/services/ai/aiClient.ts
// ============================================================================
// PRODUCTION AI SERVICE - Single Source of Truth
// ============================================================================
// Architecture:
//   - All AI calls go through this service
//   - No direct model calls anywhere else in codebase
//   - Deterministic, observable, cost-controlled
//   - Graceful degradation on failures
//   - Strict Gemini Free Tier limits:
//       - 8 RPM (spacing enforced)
//       - 20 RPD (daily cap)
//       - Single concurrency (no clusters)
//       - Fail-fast to rule-based fallback
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { env } from '../../env';

// ============================================================================
// Types
// ============================================================================

export interface AIExplanation {
  summary: string;
  why_it_matters: string;
  annotated_code: string | null;
  step_by_step_fix: string[];
  false_positive_indicators: string[];
  generated_at: string;
  model_version: string;
}

export interface AITitleGenerationRequest {
  rule_id: string;
  description: string;
  scanner_type: string;
  severity: string;
  file_path?: string | null;
  cwe?: string | null;
}

export interface AITitleGenerationResult {
  title: string;
  source: 'ai' | 'rule-based';
  model?: string;
  cached?: boolean;
}

interface AIInvocationLog {
  timestamp: string;
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  success: boolean;
  error?: string;
}

// AI Client Service
export class AIClientService {
  private provider: 'gemini' | 'claude' | 'disabled';
  private apiKey: string;
  private model: string;
  private invocationLogs: AIInvocationLog[] = [];
  private titleCache: Map<string, string> = new Map();
  // Request coalescing map to deduplicate in-flight requests
  private pendingRequests: Map<string, Promise<AITitleGenerationResult>> = new Map();

  // Cost & safety guards
  private readonly MAX_TITLE_LENGTH = 120;
  private readonly MAX_TITLE_WORDS = 12;
  private readonly MAX_FAILURES_BEFORE_DISABLE = 10;
  
  // Rate Limiting & Quotas (Gemini Free Tier Optimization)
  // - RPM Limit: 15 (Official) -> 8 (Target Safe)
  // - RPD Limit: 1500 (Official) -> 20 (Conservative Target)
  // strategy: Minimum spacing + Hard daily cap + Fail-fast
  private readonly MIN_REQUEST_SPACING_MS = 8000; // 8 seconds (~7.5 RPM)
  private readonly MAX_DAILY_REQUESTS = 20;       
  private readonly COOLDOWN_DEFAULT_MS = 60000;   // 1 min cooldown on 429
  
  // Mutable State
  private failureCount = 0;
  private lastRequestTime = 0;
  private cooldownUntil = 0;
  private dailyRequestCount = 0;
  private dailyResetDay = new Date().getDate();
  private isProcessing = false; // Mutex for single concurrency

  constructor(private fastify: FastifyInstance) {
    if (env.GEMINI_API_KEY) {
      this.provider = 'gemini';
      this.apiKey = env.GEMINI_API_KEY;
      this.model = 'gemini-2.5-flash-lite';
      fastify.log.info('AI Service: Gemini 2.5 Flash Lite (FREE tier - Restricted Mode: 8 RPM, 20 RPD)');
    } else if (env.ANTHROPIC_API_KEY) {
      this.provider = 'claude';
      this.apiKey = env.ANTHROPIC_API_KEY;
      this.model = 'claude-3-haiku-20240307';
      fastify.log.info('AI Service: Claude Haiku (FREE tier)');
    } else {
      this.provider = 'disabled';
      this.apiKey = '';
      this.model = '';
      fastify.log.warn('AI Service: DISABLED (no API key)');
    }
  }

  // Public API
  isEnabled(): boolean {
    if (this.provider === 'disabled') return false;

    // 1. Check Failure Threshold
    if (this.failureCount >= this.MAX_FAILURES_BEFORE_DISABLE) {
      return false;
    }

    // 2. Check Cooldown
    if (Date.now() < this.cooldownUntil) {
      return false;
    }

    // 3. Check Daily Quota
    this.checkDailyReset();
    if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
      return false;
    }

    return true;
  }

  /**
   * Generate a short, human-readable title for a vulnerability
   * STRATEGY: Fail-fast to Rule-Based.
   * If the AI is busy, cooling down, or rate limited, we do NOT wait/block.
   * We immediately fallback to rule-based title generation to keep scan speeds high.
   */
  async generateTitle(request: AITitleGenerationRequest): Promise<AITitleGenerationResult> {
    const cacheKey = this.getTitleCacheKey(request);

    // 1. Check Cache
    const cached = this.titleCache.get(cacheKey);
    if (cached) {
      return { title: cached, source: 'ai', cached: true, model: this.model };
    }

    // 2. Request Coalescing (Deduplication)
    // If we are already fetching this title, wait for that promise
    if (this.pendingRequests.has(cacheKey)) {
      this.fastify.log.debug({ rule_id: request.rule_id }, 'AI: Attaching to pending request');
      return this.pendingRequests.get(cacheKey)!;
    }

    // 3. Fail-Fast Checks (Do not block/wait)
    if (!this.isEnabled()) {
      return this.generateTitleRuleBased(request);
    }
    
    // Check Spacing
    const timeSinceLast = Date.now() - this.lastRequestTime;
    if (timeSinceLast < this.MIN_REQUEST_SPACING_MS) {
      this.fastify.log.debug('AI: Rate limit spacing enforced (skipping AI)');
      return this.generateTitleRuleBased(request);
    }

    // Check Mutex (Strictly one request at a time)
    if (this.isProcessing) {
      this.fastify.log.debug('AI: Concurrency limit enforced (skipping AI)');
      return this.generateTitleRuleBased(request);
    }

    // 4. Executution with coalescing wrapper
    const promise = this.executeGenerateTitle(request, cacheKey);
    this.pendingRequests.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Internal execution logic - guarded by mutex and coalescing
   */
  private async executeGenerateTitle(
    request: AITitleGenerationRequest,
    cacheKey: string
  ): Promise<AITitleGenerationResult> {
    this.isProcessing = true;
    
    try {
      // Double check daily quota inside lock logic
      if (this.dailyRequestCount >= this.MAX_DAILY_REQUESTS) {
        return this.generateTitleRuleBased(request);
      }

      this.dailyRequestCount++;
      // Set timer BEFORE request to include connection time in spacing, but primarily
      // we update it AFTER to ensure full quiet period.
      // Updating here ensures we don't start another while this one is preparing.
      this.lastRequestTime = Date.now(); 

      const prompt = this.buildTitlePrompt(request);
      const startTime = Date.now();
      
      // Call AI with timeout
      const response = await this.callAIWithTimeout(prompt, 50, 10000); // 50 tokens, 10s timeout
      
      // Parse and validate
      const title = this.parseAndValidateTitle(response, request);
      const duration = Date.now() - startTime;
      
      this.logInvocation({
        timestamp: new Date().toISOString(),
        operation: 'generate_title',
        model: this.model,
        input_tokens: Math.ceil(prompt.length / 4),
        output_tokens: Math.ceil(title.length / 4),
        cost_usd: this.calculateCost(prompt.length / 4, title.length / 4),
        duration_ms: duration,
        success: true,
      });

      // Cache result
      this.titleCache.set(cacheKey, title);
      
      // Success => Reduce failure count
      this.failureCount = Math.max(0, this.failureCount - 1);

      return { title, source: 'ai', model: this.model };

    } catch (error: any) {
      return this.handleError(error, request);
    } finally {
      this.isProcessing = false;
      this.lastRequestTime = Date.now(); // Ensure we space form the END of this request
    }
  }

  private handleError(error: any, request: AITitleGenerationRequest): AITitleGenerationResult {
    // Adaptive Cooldown Logic
    const isRateLimit = error.message.includes('429') || 
                        error.message.includes('Quota exceeded') || 
                        error.message.includes('Resource Exhausted');

    if (isRateLimit) {
      this.fastify.log.warn('AI: 429 Resource Exhausted. Pausing AI for 60s.');
      this.cooldownUntil = Date.now() + this.COOLDOWN_DEFAULT_MS;
      // Don't count as system failure, just quota limit
    } else {
      this.failureCount++;
      this.fastify.log.error({ error: error.message }, 'AI: Generation Failed');
    }

    this.logInvocation({
        timestamp: new Date().toISOString(),
        operation: 'generate_title',
        model: this.model,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        duration_ms: 0,
        success: false,
        error: error.message,
    });

    // Fallback
    return this.generateTitleRuleBased(request);
  }

  /**
   * Get AI usage statistics
   */
  getUsageStats() {
    const successful = this.invocationLogs.filter(l => l.success);
    const failed = this.invocationLogs.filter(l => !l.success);
    
    return {
      total_invocations: this.invocationLogs.length,
      successful: successful.length,
      failed: failed.length,
      daily_usage: `${this.dailyRequestCount}/${this.MAX_DAILY_REQUESTS}`,
      cooldown_active: Date.now() < this.cooldownUntil,
      remaining_cooldown_s: Math.max(0, Math.ceil((this.cooldownUntil - Date.now()) / 1000)),
      total_cost_usd: successful.reduce((sum, l) => sum + l.cost_usd, 0),
      cache_size: this.titleCache.size,
      provider: this.provider,
      failures: this.failureCount
    };
  }

  /**
   * Clear caches (for testing or memory management)
   */
  clearCaches() {
    this.titleCache.clear();
    this.invocationLogs = [];
    this.failureCount = 0;
    this.dailyRequestCount = 0;
    this.cooldownUntil = 0;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private checkDailyReset() {
    const today = new Date().getDate();
    if (today !== this.dailyResetDay) {
      this.dailyRequestCount = 0;
      this.dailyResetDay = today;
      this.fastify.log.info({ dailyResetDay: today }, 'AI: Daily quota counters reset');
    }
  }

  private buildTitlePrompt(request: AITitleGenerationRequest): string {
    return `Generate a SHORT, human-readable title for this security vulnerability.

RULES:
- 5-12 words maximum
- ≤ 120 characters
- Plain English, no jargon
- NO file paths, line numbers, or code
- NO "Found", "Detected", or scanner boilerplate
- NO remediation steps

Vulnerability:
- Scanner: ${request.scanner_type}
- Severity: ${request.severity}
- Rule ID: ${request.rule_id}
- Description: ${request.description.substring(0, 200)}
${request.cwe ? `- CWE: ${request.cwe}` : ''}

Respond with ONLY the title, nothing else.`;
  }

  private parseAndValidateTitle(response: string, request: AITitleGenerationRequest): string {
    let title = response.trim()
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/^Title:\s*/i, '')  // Remove "Title:" prefix
      .replace(/\n.*/g, '');       // Remove everything after first line

    // Enforce length constraints
    if (title.length > this.MAX_TITLE_LENGTH) {
      title = title.substring(0, this.MAX_TITLE_LENGTH - 3) + '...';
    }

    // Enforce word count
    const words = title.split(/\s+/);
    if (words.length > this.MAX_TITLE_WORDS) {
      title = words.slice(0, this.MAX_TITLE_WORDS).join(' ') + '...';
    }

    // Validate: must not be empty
    if (!title || title.length < 5) {
      return this.generateTitleRuleBased(request).title;
    }

    // Validate: must not contain file paths
    if (title.includes('/') || title.includes('\\') || title.match(/\.\w{2,4}$/)) {
      return this.generateTitleRuleBased(request).title;
    }

    return title;
  }

  private generateTitleRuleBased(request: AITitleGenerationRequest): AITitleGenerationResult {
    // Import title normalizer logic
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { normalizeTitle } = require('../../scanners/utils/title-normalizer');
    
    const title = normalizeTitle(
      request.rule_id,
      request.description,
      request.scanner_type
    );

    return { title, source: 'rule-based' };
  }

  private getTitleCacheKey(request: AITitleGenerationRequest): string {
    return `${request.rule_id}:${request.scanner_type}:${request.severity}`;
  }

  private async callAIWithTimeout(
    prompt: string,
    maxTokens: number,
    timeoutMs: number
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: string;
      
      if (this.provider === 'gemini') {
        response = await this.callGemini(prompt, maxTokens, controller.signal);
      } else if (this.provider === 'claude') {
        response = await this.callClaude(prompt, maxTokens, controller.signal);
      } else {
        throw new Error('AI provider not configured');
      }

      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('AI request timeout');
      }
      throw error;
    }
  }

  private async callGemini(
    prompt: string,
    maxTokens: number,
    signal: AbortSignal
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: maxTokens,
          topP: 0.9,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const detailedError = `Gemini API error (${response.status}): ${errorText}`;
      
      // Explicit 429 check here to help debugging, though we handle it in caller too
      if (response.status === 429) {
        throw new Error('Gemini API 429: Resource Exhausted');
      }
      throw new Error(detailedError);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Gemini API');
    }

    return text;
  }

  private async callClaude(
    prompt: string,
    maxTokens: number,
    signal: AbortSignal
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) throw new Error('Claude API 429: Too Many Requests');
        throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Claude API');
    }

    return text;
  }

  private calculateCost(inputTokens: number, outputTokens: number): number {
    if (this.provider === 'gemini') {
      const inputCost = (inputTokens / 1_000_000) * 0.075;
      const outputCost = (outputTokens / 1_000_000) * 0.3;
      return inputCost + outputCost;
    } else if (this.provider === 'claude') {
      const inputCost = (inputTokens / 1_000_000) * 0.25;
      const outputCost = (outputTokens / 1_000_000) * 1.25;
      return inputCost + outputCost;
    }
    return 0;
  }

  private logInvocation(log: AIInvocationLog) {
    this.invocationLogs.push(log);
    
    // Keep only last 1000 logs to prevent memory leak
    if (this.invocationLogs.length > 1000) {
      this.invocationLogs = this.invocationLogs.slice(-1000);
    }

    if (log.success) {
      this.fastify.log.debug(
        {
          operation: log.operation,
          model: log.model,
          cost: `$${log.cost_usd.toFixed(6)}`,
          duration: log.duration_ms,
        },
        'AI invocation successful'
      );
    }
  }
}
