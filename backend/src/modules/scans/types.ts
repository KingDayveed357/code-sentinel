// =====================================================
// CANONICAL SCAN STATUS LIFECYCLE
// =====================================================
// Wave 1: Unified status enum across backend and frontend
// DO NOT add statuses outside this enum without updating both backend and frontend

export enum ScanStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// =====================================================
// AI ENRICHMENT STATUS (SEPARATE FROM SCAN LIFECYCLE)
// =====================================================
// Wave 1: AI enrichment is tracked separately and never blocks scan completion

export enum AIEnrichmentStatus {
  NOT_REQUESTED = 'not_requested',
  ENRICHING = 'enriching',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// =====================================================
// SCAN FILTERS
// =====================================================

export interface ScanFilters {
  status?: ScanStatus | 'all';
  repository_id?: string;
  page: number;
  limit: number;
  sort?: "recent" | "oldest" | "duration";
  severity?: string; // For filtering scans that have specific severity findings
}

// =====================================================
// SCAN WITH REPOSITORY
// =====================================================

export interface ScanWithRepository {
  id: string;
  repository_id: string;
  workspace_id: string;
  status: ScanStatus;
  branch?: string;
  commit_hash?: string;
  scan_type: 'quick' | 'full';
  created_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  vulnerabilities_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  
  // AI enrichment (separate lifecycle)
  ai_enrichment_status: AIEnrichmentStatus;
  ai_enrichment_started_at: string | null;
  ai_enrichment_completed_at: string | null;
  ai_enrichment_error: string | null;
  
  repository: {
    id: string;
    name: string;
    full_name: string;
    url: string;
  };
}

// =====================================================
// SCAN DETAIL
// =====================================================

export interface ScanDetail extends ScanWithRepository {
  scanner_breakdown: {
    sast: { findings: number; status: string };
    sca: { findings: number; status: string };
    secrets: { findings: number; status: string };
    iac: { findings: number; status: string };
    container: { findings: number; status: string };
  };
  logs: any[];
  top_vulnerabilities: any[];
}

// =====================================================
// PAGINATED SCANS RESPONSE
// =====================================================

export interface PaginatedScansResponse {
  data: ScanWithRepository[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
