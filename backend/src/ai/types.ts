// ===================================================================
// src/ai/types.ts
// ===================================================================
export interface AIEnrichmentResult {
  explanation: string;
  business_impact: string;
  remediation: string;
  suggested_patch: string | null;
  risk_score: number; // 0-100
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  false_positive_score: number; // 0-1
  confidence: number; // 0-1
}

export interface AIBatchEnrichmentResult {
  id: string;
  enrichment: AIEnrichmentResult;
}

export interface AIDeduplicationResult {
  groups: Array<{
    primary_id: string;
    duplicates: string[];
    reason: string;
  }>;
}

export interface TokenUsageMetrics {
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  timestamp: string;
}