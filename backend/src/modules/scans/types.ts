// src/modules/scans/types.ts
export interface ScanRun {
    id: string;
    user_id: string;
    repository_id: string;
    branch: string;
    scan_type: 'quick' | 'full' | 'custom';
    status: 'pending' | 'running' | 'processing_ai' | 'completed' | 'failed' | 'cancelled';
    vulnerabilities_found: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    semgrep_run_id: string | null;
    ai_enhanced_count: number;
    ai_suspected_count: number;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

export interface ScanJobPayload {
    scanId: string;
    repositoryId: string;
    userId: string;
    branch: string;
    scanType: 'quick' | 'full' | 'custom';
}
