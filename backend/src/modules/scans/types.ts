
export interface ScanFilters {
  status?: string;
  repository_id?: string;
  page: number;
  limit: number;
  sort?: "recent" | "oldest" | "duration";
  severity?: string; // For filtering scans that have specific severity findings
}

export interface ScanWithRepository {
  id: string;
  repository_id: string;
  workspace_id: string;
  status: string;
  branch?: string;
  commit_hash?: string;
  created_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  vulnerabilities_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  repository: {
    id: string;
    name: string;
    full_name: string;
    url: string;
  };
}

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
