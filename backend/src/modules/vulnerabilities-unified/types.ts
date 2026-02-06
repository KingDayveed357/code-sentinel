// src/modules/vulnerabilities-unified/types.ts
// TypeScript interfaces for unified vulnerabilities

export interface VulnerabilityUnified {
  id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  scanner_type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
  repository_id: string;
  workspace_id: string;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  cwe: string | null;
  rule_id: string;
  scanner_metadata: Record<string, any>;
  confidence: number | null;
  ai_risk_score: number | null;
  ai_priority: 'P0' | 'P1' | 'P2' | 'P3' | null;
  status: 'open' | 'in_review' | 'accepted' | 'false_positive' | 'wont_fix' | 'fixed' | 'ignored';
  assigned_to: string | null;
  triaged_by: string | null;
  triaged_at: string | null;
  triage_note: string | null;
  ai_explanation: AIExplanation | null;
  ai_remediation: string | null;
  ai_business_impact: string | null;
  ai_false_positive_score: number | null;
  risk_context: RiskContext;
  first_detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIExplanation {
  summary: string;
  why_it_matters?: string;
  annotated_code?: string;
  generated_at: string;
  model_version: string;
  tokens_used?: number;
}

export interface RiskContext {
  public_facing?: boolean;
  auth_required?: boolean;
  framework?: string;
  exploit_likelihood?: 'high' | 'medium' | 'low';
}

export interface VulnerabilityInstance {
  id: string;
  scan_id: string;
  vulnerability_id: string;
  source_table: string;
  source_id: string;
  detected_at: string;
  raw_finding: Record<string, any>;
  created_at: string;
}

export interface VulnerabilityWithInstances extends VulnerabilityUnified {
  instances?: VulnerabilityInstance[];
  instance_count?: number;
  instances_page?: number;
  instances_total_pages?: number;
  related_issues?: Array<{
    id: string;
    title: string;
    severity: string;
  }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface VulnerabilityFilters {
  severity?: string | string[];
  status?: string;
  search?: string;
  scanner_type?: string;
  assigned_to?: string;
  page: number;
  limit: number;
  sort?: 'severity' | 'recent' | 'oldest' | 'confidence';
}

export interface VulnerabilityStats {
  total: number;
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  by_status: {
    open: number;
    in_review: number;
    accepted: number;
    false_positive: number;
    wont_fix: number;
    fixed: number;
    ignored: number;
  };
  by_scanner_type: {
    sast: number;
    sca: number;
    secrets: number;
    iac: number;
    container: number;
  };
  verified_findings: {
    likely_exploitable_percent: number;
    likely_false_positive_percent: number;
  };
}
