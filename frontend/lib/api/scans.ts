
// // lib/api/scans.ts
// import { apiFetch } from "@/lib/api";

// export interface Scan {
//   id: string;
//   user_id: string;
//   repository_id: string;
//   branch: string;
//   scan_type: "quick" | "full" | "custom";
//   status: "pending" | "running" | "processing_ai" | "completed" | "failed" | "cancelled";
//   vulnerabilities_found: number;
//   critical_count: number;
//   high_count: number;
//   medium_count: number;
//   low_count: number;
//   semgrep_run_id: string | null;
//   ai_enhanced_count: number;
//   ai_suspected_count: number;
//   error_message: string | null;
//   started_at: string | null;
//   completed_at: string | null;
//   created_at: string;
// }

// export interface ScanSummary {
//   total_issues: number;
//   semgrep_verified: number;
//   ai_suspected: number;
//   severity_distribution: {
//     critical: number;
//     high: number;
//     medium: number;
//     low: number;
//   };
// }

// export interface StartScanResponse {
//   scan_id: string;
//   status: string;
//   message: string;
// }

// export const scansApi = {
//   /**
//    * Start a new scan
//    */
//   async start(
//     repoId: string,
//     options: {
//       branch?: string;
//       scan_type?: "quick" | "full" | "custom";
//     } = {}
//   ): Promise<StartScanResponse> {
//     return apiFetch(`/scans/${repoId}/start`, {
//       method: "POST",
//       requireAuth: true,
//       body: JSON.stringify({
//         branch: options.branch || "main",
//         scan_type: options.scan_type || "full",
//       }),
//     });
//   },

//   /**
//    * Get scan history for a repository
//    */
//   async getHistory(
//     repoId: string,
//     params: {
//       page?: number;
//       limit?: number;
//     } = {}
//   ): Promise<{
//     scans: Scan[];
//     total: number;
//     page: number;
//     pages: number;
//   }> {
//     const query = new URLSearchParams({
//       page: String(params.page || 1),
//       limit: String(params.limit || 20),
//     });

//     return apiFetch(`/scans/${repoId}/history?${query}`, {
//       requireAuth: true,
//     });
//   },

//   /**
//    * Get scan status and details
//    */
//   async getStatus(scanId: string): Promise<{
//     scan: Scan;
//     summary: ScanSummary;
//   }> {
//     return apiFetch(`/scans/run/${scanId}`, {
//       requireAuth: true,
//     });
//   },
// };



// lib/api/scans.ts - FIXED export method
import { apiFetch } from "@/lib/api";
import { getCurrentSession } from "@/lib/supabase-client";

export interface Scan {
  id: string;
  user_id: string;
  repository_id: string;
  branch: string;
  scan_type: "quick" | "full" | "custom";
  status: "pending" | "running" | "normalizing" | "ai_enriching" | "completed" | "failed" | "cancelled";
  vulnerabilities_found: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  files_scanned: number | null;
  duration_seconds: number | null;
  commit_sha: string | null;
}

export interface ScanLog {
  id: string;
  created_at: string;
  level: "info" | "warning" | "error";
  message: string;
  details: any;
}

export interface ScanSummary {
  total_issues: number;
  by_type: {
    sast: number;
    sca: number;
    secrets: number;
    iac: number;
    container: number;
  };
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface StartScanResponse {
  scan_id: string;
  status: string;
  message: string;
}

export const scansApi = {
  async start(
    repoId: string,
    options: {
      branch?: string;
      scan_type?: "quick" | "full" | "custom";
    } = {}
  ): Promise<StartScanResponse> {
    return apiFetch(`/scans/${repoId}/start`, {
      method: "POST",
      requireAuth: true,
      body: JSON.stringify({
        branch: options.branch || "main",
        scan_type: options.scan_type || "full",
      }),
    });
  },

  async getHistory(
    repoId: string,
    params: {
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    scans: Scan[];
    total: number;
    page: number;
    pages: number;
  }> {
    const query = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
    });

    return apiFetch(`/scans/${repoId}/history?${query}`, {
      requireAuth: true,
    });
  },

  async getStatus(scanId: string): Promise<{
    scan: Scan;
    summary: ScanSummary;
  }> {
    return apiFetch(`/scans/run/${scanId}`, {
      requireAuth: true,
    });
  },

  async getLogs(scanId: string): Promise<{
    logs: ScanLog[];
  }> {
    return apiFetch(`/scans/run/${scanId}/logs`, {
      requireAuth: true,
    });
  },

  async exportResults(
    scanId: string,
    format: "json" | "csv" = "json"
  ): Promise<Blob> {
    // FIX: Use getCurrentSession from supabase-client
    const session = await getCurrentSession();
    
    if (!session?.access_token) {
      throw new Error("Authentication required - please log in again");
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/scans/run/${scanId}/export?format=${format}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Accept": format === "json" ? "application/json" : "text/csv",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => `Export failed: ${response.status}`);
      console.error("Export failed:", response.status, errorText);
      throw new Error(errorText || `Failed to export scan results: ${response.status}`);
    }

    return response.blob();
  },

  async cancel(scanId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch(`/scans/run/${scanId}`, {
      method: "DELETE",
      requireAuth: true,
    });
  },
};