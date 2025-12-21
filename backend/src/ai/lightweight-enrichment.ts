// // src/ai/lightweight-enrichment.ts - Minimal AI Usage for Free Tier
// import type { FastifyInstance } from 'fastify';
// import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';
// import type { AIEnrichmentResult } from './types';
// import { RateLimiterPresets } from '../utils/rate-limit';
// import { env } from '../env';

// export class LightweightAIEnrichmentService {
//   private provider: 'gemini' | 'claude' | 'disabled';
//   private apiKey: string;
//   private model: string;
//   private limiter: any;

//   constructor(private fastify: FastifyInstance) {
//     if (env.GEMINI_API_KEY) {
//       this.provider = 'gemini';
//       this.apiKey = env.GEMINI_API_KEY;
//       this.model = 'gemini-2.0-flash-exp';
//       this.limiter = RateLimiterPresets.GEMINI_FREE();
//       fastify.log.info('Lightweight AI enrichment: Gemini FREE tier');
//     } else if (env.ANTHROPIC_API_KEY) {
//       this.provider = 'claude';
//       this.apiKey = env.ANTHROPIC_API_KEY;
//       this.model = 'claude-3-haiku-20240307';
//       this.limiter = RateLimiterPresets.CLAUDE_FREE();
//       fastify.log.info('Lightweight AI enrichment: Claude FREE tier');
//     } else {
//       this.provider = 'disabled';
//       this.apiKey = '';
//       this.model = '';
//       this.limiter = null;
//       fastify.log.warn('AI enrichment disabled');
//     }
//   }

//   /**
//    * Enrich ONLY grouped/summarized vulnerabilities (one per rule type)
//    * This dramatically reduces API calls - e.g., 100 vulns → 10 calls
//    */
//   async enrichSummaryBatch(
//     summarizedVulnerabilities: NormalizedVulnerability[]
//   ): Promise<Map<string, AIEnrichmentResult>> {
//     const results = new Map<string, AIEnrichmentResult>();

//     if (this.provider === 'disabled' || summarizedVulnerabilities.length === 0) {
//       summarizedVulnerabilities.forEach(v => 
//         results.set(v.id, this.getFallback(v))
//       );
//       return results;
//     }

//     // Only enrich critical and high severity (further reduction)
//     const toEnrich = summarizedVulnerabilities.filter(
//       v => v.severity === 'critical' || v.severity === 'high'
//     );

//     this.fastify.log.info(
//       {
//         total: summarizedVulnerabilities.length,
//         enriching: toEnrich.length,
//         skipping: summarizedVulnerabilities.length - toEnrich.length,
//         estimated_savings: `${Math.round(((summarizedVulnerabilities.length - toEnrich.length) / summarizedVulnerabilities.length) * 100)}%`,
//       },
//       'Lightweight AI enrichment strategy'
//     );

//     // Skip non-critical items
//     for (const vuln of summarizedVulnerabilities) {
//       if (vuln.severity !== 'critical' && vuln.severity !== 'high') {
//         results.set(vuln.id, this.getFallback(vuln));
//       }
//     }

//     // Enrich critical/high items with rate limiting
//     for (const vuln of toEnrich) {
//       try {
//         await this.limiter.acquire(1);
//         const enrichment = await this.enrichSingle(vuln);
//         results.set(vuln.id, enrichment);
        
//         // Delay between requests (free tier safety)
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       } catch (error: any) {
//         this.fastify.log.warn(
//           { error: error.message, vulnId: vuln.id },
//           'AI enrichment failed, using fallback'
//         );
//         results.set(vuln.id, this.getFallback(vuln));
//       }
//     }

//     this.fastify.log.info(
//       { enriched: toEnrich.length, total: summarizedVulnerabilities.length },
//       'Lightweight AI enrichment completed'
//     );

//     return results;
//   }

//   /**
//    * Enrich single vulnerability with minimal prompt
//    */
//   private async enrichSingle(vuln: NormalizedVulnerability): Promise<AIEnrichmentResult> {
//     const prompt = this.buildMinimalPrompt(vuln);
    
//     try {
//       const response = await this.callAI(prompt);
//       return this.parseResponse(response, vuln);
//     } catch (error) {
//       return this.getFallback(vuln);
//     }
//   }

//   /**
//    * Build minimal prompt to save tokens
//    */
//   private buildMinimalPrompt(vuln: NormalizedVulnerability): string {
//     const affectedFiles = vuln.metadata?.affected_files || [vuln.file_path];
//     const groupCount = vuln.metadata?.grouped_count || 1;

//     return `Security issue analysis:

// Rule: ${vuln.rule_id}
// Severity: ${vuln.severity}
// Type: ${vuln.type}
// Description: ${vuln.description}
// Affected: ${groupCount} instance(s) in ${affectedFiles.length} file(s)

// Provide JSON response:
// {
//   "explanation": "Brief 2-sentence explanation in plain English",
//   "fix": "Concrete fix recommendation",
//   "impact": "Real-world risk in one sentence"
// }`;
//   }

//   /**
//    * Call AI API
//    */
//   private async callAI(prompt: string): Promise<string> {
//     if (this.provider === 'gemini') {
//       const response = await fetch(
//         `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
//         {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({
//             contents: [{ parts: [{ text: prompt }] }],
//             generationConfig: { 
//               temperature: 0.1,
//               maxOutputTokens: 150, // Minimal output
//             },
//           }),
//         }
//       );

//       if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
//       const data = await response.json();
//       return data.candidates[0].content.parts[0].text;
//     } else if (this.provider === 'claude') {
//       const response = await fetch('https://api.anthropic.com/v1/messages', {
//         method: 'POST',
//         headers: {
//           'x-api-key': this.apiKey,
//           'anthropic-version': '2023-06-01',
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           model: this.model,
//           max_tokens: 150,
//           messages: [{ role: 'user', content: prompt }],
//         }),
//       });

//       if (!response.ok) throw new Error(`Claude error: ${response.status}`);
//       const data = await response.json();
//       return data.content[0].text;
//     }
    
//     throw new Error('No AI provider configured');
//   }

//   /**
//    * Parse AI response
//    */
//   private parseResponse(text: string, vuln: NormalizedVulnerability): AIEnrichmentResult {
//     try {
//       const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
//       const parsed = JSON.parse(cleaned);
      
//       return {
//         explanation: parsed.explanation || this.generateExplanation(vuln),
//         business_impact: parsed.impact || this.generateImpact(vuln),
//         remediation: parsed.fix || vuln.recommendation,
//         suggested_patch: null,
//         risk_score: this.calculateRiskScore(vuln),
//         priority: this.calculatePriority(vuln),
//         false_positive_score: 0.1,
//         confidence: 0.85,
//       };
//     } catch {
//       return this.getFallback(vuln);
//     }
//   }

//   /**
//    * Rule-based fallback (NO AI)
//    */
//   private getFallback(vuln: NormalizedVulnerability): AIEnrichmentResult {
//     return {
//       explanation: this.generateExplanation(vuln),
//       business_impact: this.generateImpact(vuln),
//       remediation: vuln.recommendation || this.generateRemediation(vuln),
//       suggested_patch: null,
//       risk_score: this.calculateRiskScore(vuln),
//       priority: this.calculatePriority(vuln),
//       false_positive_score: 0.15,
//       confidence: vuln.confidence,
//     };
//   }

//   private generateExplanation(vuln: NormalizedVulnerability): string {
//     const groupCount = vuln.metadata?.grouped_count || 1;
//     const plural = groupCount > 1 ? 's' : '';
    
//     const typeMap = {
//       sast: `This code pattern introduces a security vulnerability`,
//       sca: `This dependency has a known security vulnerability`,
//       secret: `Hardcoded credentials detected in source code`,
//       iac: `Infrastructure configuration does not follow security best practices`,
//       container: `Container image contains vulnerable packages`,
//     };
    
//     const base = typeMap[vuln.type];
//     const suffix = groupCount > 1 
//       ? ` Found in ${groupCount} location${plural}.`
//       : '.';
    
//     return base + suffix + ' ' + vuln.description;
//   }

//   private generateImpact(vuln: NormalizedVulnerability): string {
//     const severityImpact = {
//       critical: 'Could lead to complete system compromise or data breach',
//       high: 'May allow unauthorized access or significant data exposure',
//       medium: 'Could be exploited under certain conditions',
//       low: 'Minor security concern with limited impact',
//       info: 'Informational finding for awareness',
//     };
//     return severityImpact[vuln.severity];
//   }

//   private generateRemediation(vuln: NormalizedVulnerability): string {
//     if (vuln.cve) return `Update to a patched version that fixes ${vuln.cve}`;
//     if (vuln.type === 'secret') return 'Remove hardcoded credential and use environment variables or secret managers';
//     if (vuln.type === 'iac') return 'Apply recommended security configuration from the rule documentation';
//     return 'Review the security documentation and apply the recommended fix';
//   }

//   private calculateRiskScore(vuln: NormalizedVulnerability): number {
//     const severityScores = { critical: 95, high: 75, medium: 50, low: 25, info: 10 };
//     return severityScores[vuln.severity];
//   }

//   private calculatePriority(vuln: NormalizedVulnerability): 'P0' | 'P1' | 'P2' | 'P3' {
//     if (vuln.severity === 'critical') return 'P0';
//     if (vuln.severity === 'high') return 'P1';
//     if (vuln.severity === 'medium') return 'P2';
//     return 'P3';
//   }
// }



// src/ai/lightweight-enrichment.ts - IMPROVED with better rate limiting
import type { FastifyInstance } from 'fastify';
import type { NormalizedVulnerability } from '../scanners/base/scanner-interface';
import type { AIEnrichmentResult } from './types';
import { RateLimiterPresets } from '../utils/rate-limit';
import { env } from '../env';

export class LightweightAIEnrichmentService {
  private provider: 'gemini' | 'claude' | 'disabled';
  private apiKey: string;
  private model: string;
  private limiter: any;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;
  private backoffUntil: number = 0;

  constructor(private fastify: FastifyInstance) {
    if (env.GEMINI_API_KEY) {
      this.provider = 'gemini';
      this.apiKey = env.GEMINI_API_KEY;
      this.model = 'gemini-2.0-flash-exp';
      this.limiter = RateLimiterPresets.GEMINI_FREE();
      fastify.log.info('Lightweight AI enrichment: Gemini FREE tier');
    } else if (env.ANTHROPIC_API_KEY) {
      this.provider = 'claude';
      this.apiKey = env.ANTHROPIC_API_KEY;
      this.model = 'claude-3-haiku-20240307';
      this.limiter = RateLimiterPresets.CLAUDE_FREE();
      fastify.log.info('Lightweight AI enrichment: Claude FREE tier');
    } else {
      this.provider = 'disabled';
      this.apiKey = '';
      this.model = '';
      this.limiter = null;
      fastify.log.warn('AI enrichment disabled');
    }
  }

  /**
   * Check if we should skip AI enrichment due to repeated failures
   */
  private shouldSkipAI(): boolean {
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      const now = Date.now();
      if (now < this.backoffUntil) {
        return true; // Still in backoff period
      }
      // Reset after backoff period
      this.consecutiveFailures = 0;
      this.backoffUntil = 0;
    }
    return false;
  }

  /**
   * Record a failure and implement exponential backoff
   */
  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      // Backoff for 5 minutes
      this.backoffUntil = Date.now() + (5 * 60 * 1000);
      this.fastify.log.warn(
        { backoffUntil: new Date(this.backoffUntil) },
        'AI enrichment entering backoff period due to repeated failures'
      );
    }
  }

  /**
   * Enrich ONLY critical/high severity vulnerabilities (summary mode)
   */
  async enrichSummaryBatch(
    summarizedVulnerabilities: NormalizedVulnerability[]
  ): Promise<Map<string, AIEnrichmentResult>> {
    const results = new Map<string, AIEnrichmentResult>();

    // Early exit if disabled or in backoff
    if (this.provider === 'disabled' || this.shouldSkipAI()) {
      summarizedVulnerabilities.forEach(v => 
        results.set(v.id, this.getFallback(v))
      );
      return results;
    }

    if (summarizedVulnerabilities.length === 0) {
      return results;
    }

    // Only enrich critical and high severity
    const toEnrich = summarizedVulnerabilities.filter(
      v => v.severity === 'critical' || v.severity === 'high'
    );

    const skipped = summarizedVulnerabilities.filter(
      v => v.severity !== 'critical' && v.severity !== 'high'
    );

    this.fastify.log.info(
      {
        total: summarizedVulnerabilities.length,
        enriching: toEnrich.length,
        skipping: skipped.length,
      },
      'Lightweight AI enrichment strategy'
    );

    // Add fallbacks for skipped items
    for (const vuln of skipped) {
      results.set(vuln.id, this.getFallback(vuln));
    }

    // Don't even try if nothing to enrich
    if (toEnrich.length === 0) {
      return results;
    }

    // Process with generous delays for free tier
    let enrichedCount = 0;
    let failedCount = 0;

    for (const vuln of toEnrich) {
      // Check if we should stop due to failures
      if (this.shouldSkipAI()) {
        this.fastify.log.warn('Stopping enrichment due to backoff period');
        // Fill remaining with fallbacks
        results.set(vuln.id, this.getFallback(vuln));
        continue;
      }

      try {
        await this.limiter.acquire(1);
        
        const enrichment = await this.enrichSingle(vuln);
        results.set(vuln.id, enrichment);
        enrichedCount++;
        
        // Reset failure count on success
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
        }

        // Generous delay between requests (free tier safety)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error: any) {
        failedCount++;
        this.recordFailure();
        
        this.fastify.log.warn(
          { 
            error: error.message, 
            vulnId: vuln.id,
            consecutiveFailures: this.consecutiveFailures 
          },
          'AI enrichment failed, using fallback'
        );
        
        results.set(vuln.id, this.getFallback(vuln));

        // If we're approaching failure limit, add extra delay
        if (this.consecutiveFailures >= 2) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }

    this.fastify.log.info(
      { 
        enriched: enrichedCount,
        failed: failedCount,
        total: summarizedVulnerabilities.length 
      },
      'Lightweight AI enrichment completed'
    );

    return results;
  }

  /**
   * Enrich single vulnerability with minimal prompt
   */
  private async enrichSingle(vuln: NormalizedVulnerability): Promise<AIEnrichmentResult> {
    const prompt = this.buildMinimalPrompt(vuln);
    
    try {
      const response = await this.callAI(prompt);
      return this.parseResponse(response, vuln);
    } catch (error: any) {
      // Check if it's a rate limit error
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        // Wait longer and retry once
        await new Promise(resolve => setTimeout(resolve, 10000));
        try {
          const response = await this.callAI(prompt);
          return this.parseResponse(response, vuln);
        } catch (retryError) {
          throw retryError; // Give up after one retry
        }
      }
      throw error;
    }
  }

  /**
   * Build minimal prompt to save tokens
   */
  private buildMinimalPrompt(vuln: NormalizedVulnerability): string {
    const affectedFiles = vuln.metadata?.affected_files || [vuln.file_path];
    const groupCount = vuln.metadata?.grouped_count || 1;

    return `Security issue analysis:

Rule: ${vuln.rule_id}
Severity: ${vuln.severity}
Type: ${vuln.type}
Description: ${vuln.description.substring(0, 200)}
Affected: ${groupCount} instance(s) in ${affectedFiles.length} file(s)

Provide JSON response (no markdown):
{
  "explanation": "Brief 2-sentence explanation",
  "fix": "Concrete fix recommendation",
  "impact": "Real-world risk in one sentence"
}`;
  }

  /**
   * Call AI API with timeout
   */
  private async callAI(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      if (this.provider === 'gemini') {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { 
                temperature: 0.1,
                maxOutputTokens: 150,
              },
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Gemini error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
          throw new Error('No response from Gemini API');
        }
        
        return text;
        
      } else if (this.provider === 'claude') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 150,
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Claude error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const text = data.content?.[0]?.text;
        
        if (!text) {
          throw new Error('No response from Claude API');
        }
        
        return text;
      }
      
      throw new Error('No AI provider configured');
      
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse AI response with better error handling
   */
  private parseResponse(text: string, vuln: NormalizedVulnerability): AIEnrichmentResult {
    try {
      // Remove markdown formatting
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      return {
        explanation: parsed.explanation || this.generateExplanation(vuln),
        business_impact: parsed.impact || this.generateImpact(vuln),
        remediation: parsed.fix || vuln.recommendation,
        suggested_patch: null,
        risk_score: this.calculateRiskScore(vuln),
        priority: this.calculatePriority(vuln),
        false_positive_score: 0.1,
        confidence: 0.85,
      };
    } catch (parseError) {
      this.fastify.log.warn(
        { parseError, responsePreview: text.substring(0, 100) },
        'Failed to parse AI response, using fallback'
      );
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
      false_positive_score: 0.15,
      confidence: vuln.confidence,
    };
  }

  private generateExplanation(vuln: NormalizedVulnerability): string {
    const groupCount = vuln.metadata?.grouped_count || 1;
    const plural = groupCount > 1 ? 's' : '';
    
    const typeMap = {
      sast: 'This code pattern introduces a security vulnerability',
      sca: 'This dependency has a known security vulnerability',
      secret: 'Hardcoded credentials detected in source code',
      iac: 'Infrastructure configuration does not follow security best practices',
      container: 'Container image contains vulnerable packages',
    };
    
    const base = typeMap[vuln.type];
    const suffix = groupCount > 1 ? ` Found in ${groupCount} location${plural}.` : '.';
    
    return base + suffix;
  }

  private generateImpact(vuln: NormalizedVulnerability): string {
    const severityImpact = {
      critical: 'Could lead to complete system compromise or data breach',
      high: 'May allow unauthorized access or significant data exposure',
      medium: 'Could be exploited under certain conditions',
      low: 'Minor security concern with limited impact',
      info: 'Informational finding for awareness',
    };
    return severityImpact[vuln.severity];
  }

  private generateRemediation(vuln: NormalizedVulnerability): string {
    if (vuln.cve) return `Update to a patched version that fixes ${vuln.cve}`;
    if (vuln.type === 'secret') return 'Remove hardcoded credential and use environment variables';
    if (vuln.type === 'iac') return 'Apply recommended security configuration';
    return 'Review the security documentation and apply the recommended fix';
  }

  private calculateRiskScore(vuln: NormalizedVulnerability): number {
    const severityScores = { critical: 95, high: 75, medium: 50, low: 25, info: 10 };
    return severityScores[vuln.severity];
  }

  private calculatePriority(vuln: NormalizedVulnerability): 'P0' | 'P1' | 'P2' | 'P3' {
    if (vuln.severity === 'critical') return 'P0';
    if (vuln.severity === 'high') return 'P1';
    if (vuln.severity === 'medium') return 'P2';
    return 'P3';
  }
}