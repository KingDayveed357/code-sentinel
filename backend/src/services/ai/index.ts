// src/services/ai/index.ts
// ============================================================================
// AI SERVICE EXPORTS
// ============================================================================
// Single entry point for all AI services
// Ensures singleton pattern and proper initialization
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { AIClientService } from './aiClient';
import { TitleGeneratorService } from './titleGenerator';
import { VulnerabilityExplainerService } from './vulnerability-explainer';

let aiClientInstance: AIClientService | null = null;
let titleGeneratorInstance: TitleGeneratorService | null = null;
let explainerInstance: VulnerabilityExplainerService | null = null;

/**
 * Initialize AI services (call once during app startup)
 */
export function initializeAIServices(fastify: FastifyInstance) {
  if (!aiClientInstance) {
    aiClientInstance = new AIClientService(fastify);
  }
  
  if (!titleGeneratorInstance) {
    titleGeneratorInstance = new TitleGeneratorService(fastify, aiClientInstance);
  }

  // Explainer is optional (requires ANTHROPIC_API_KEY)
  try {
    if (!explainerInstance && process.env.ANTHROPIC_API_KEY) {
      explainerInstance = new VulnerabilityExplainerService(fastify);
    }
  } catch (error) {
    fastify.log.warn('VulnerabilityExplainerService not available (missing ANTHROPIC_API_KEY)');
  }

  fastify.log.info('AI services initialized');
}

/**
 * Get AI client instance
 */
export function getAIClient(fastify: FastifyInstance): AIClientService {
  if (!aiClientInstance) {
    initializeAIServices(fastify);
  }
  return aiClientInstance!;
}

/**
 * Get title generator instance
 */
export function getTitleGenerator(fastify: FastifyInstance): TitleGeneratorService {
  if (!titleGeneratorInstance) {
    initializeAIServices(fastify);
  }
  return titleGeneratorInstance!;
}

/**
 * Get vulnerability explainer instance (may be null if not configured)
 */
export function getVulnerabilityExplainer(fastify: FastifyInstance): VulnerabilityExplainerService | null {
  if (!explainerInstance) {
    initializeAIServices(fastify);
  }
  return explainerInstance;
}

// Re-export types
export type { AIExplanation, AITitleGenerationRequest, AITitleGenerationResult } from './aiClient';
export type { TitleGenerationContext, TitleValidationResult } from './titleGenerator';
export { AIClientService } from './aiClient';
export { TitleGeneratorService } from './titleGenerator';
