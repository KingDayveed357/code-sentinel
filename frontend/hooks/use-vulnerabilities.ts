// hooks/use-vulnerabilities.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { vulnerabilitiesApi, type Vulnerability } from "@/lib/api/vulnerabilities";
import { toast } from "sonner";
import { Divide } from "lucide-react";

export interface VulnerabilityFilters {
  severity?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UseVulnerabilitiesOptions {
  scanId?: string;
  projectId?: string;
  type?: "sast" | "sca" | "secrets" | "iac" | "container";
  filters?: VulnerabilityFilters;
  autoFetch?: boolean;
  refetchInterval?: number;
}

export interface UseVulnerabilitiesReturn {
  vulnerabilities: Vulnerability[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pages: number;
  refetch: () => Promise<void>;
  updateStatus: (
    id: string,
    type: "sast" | "sca" | "secrets" | "iac" | "container",
    status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed",
    note?: string
  ) => Promise<void>;
  getDetails: (
    id: string,
    type: "sast" | "sca" | "secrets" | "iac" | "container"
  ) => Promise<Vulnerability | null>;
}

export function useVulnerabilities(
  options: UseVulnerabilitiesOptions = {}
): UseVulnerabilitiesReturn {
  const {
    scanId,
    projectId,
    type,
    filters = {},
    autoFetch = true,
    refetchInterval,
  } = options;


  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  
  // Prevent duplicate fetches
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchVulnerabilities = useCallback(async () => {
    if (!scanId && !projectId) {
      setError("Either scanId or projectId is required");
      return;
    }

    // Prevent duplicate calls
    if (fetchingRef.current) {
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      let response;

      if (scanId && type) {
        // Fetch by scan and type
        response = await vulnerabilitiesApi.getVulnerabilitiesByScanAndType(
          scanId,
          type,
          filters
        );
      } else if (scanId) {
        // Fetch all vulnerabilities for a scan
        response = await vulnerabilitiesApi.getVulnerabilitiesByScan(
          scanId,
          filters
        );
      } else {
        // This would require a new API endpoint for project-level queries
        throw new Error("Project-level queries not yet implemented");
      }

      // Only update state if component is still mounted
      if (mountedRef.current) {
        setVulnerabilities(response.vulnerabilities);
        setTotal(response.total);
        setPage(response.page);
        setPages(response.pages);
      }
    } catch (err: any) {
      const errorMessage = err.message || "Failed to fetch vulnerabilities";
      if (mountedRef.current) {
        setError(errorMessage);
      }
      console.error("Error fetching vulnerabilities:", err);
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [scanId, projectId, type, JSON.stringify(filters)]);

  const refetch = useCallback(async () => {
    await fetchVulnerabilities();
  }, [fetchVulnerabilities]);

  const updateStatus = useCallback(
    async (
      id: string,
      vulnType: "sast" | "sca" | "secrets" | "iac" | "container",
      status: "open" | "in_review" | "accepted" | "false_positive" | "wont_fix" | "fixed",
      note?: string
    ) => {
      try {
        const updated = await vulnerabilitiesApi.updateStatus(
          id,
          vulnType,
          status,
          note
        );

        // Update local state
        setVulnerabilities((prev) =>
          prev.map((vuln) => (vuln.id === id ? updated : vuln))
        );

        toast.success(`Vulnerability marked as ${status.replace("_", " ")}`);
      } catch (err: any) {
        toast.error("Update Failed")
        throw err;
      }
    },
    [toast]
  );

  const getDetails = useCallback(
    async (
      id: string,
      vulnType: "sast" | "sca" | "secrets" | "iac" | "container"
    ): Promise<Vulnerability | null> => {
      try {
        const details = await vulnerabilitiesApi.getVulnerabilityDetails(
          id,
          vulnType
        );
        return details;
      } catch (err: any) {
        toast.error("Failed to Load Details");
        return null;
      }
    },
    [toast]
  );

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch) {
      fetchVulnerabilities();
    }
  }, [autoFetch, fetchVulnerabilities]);

  // Polling interval
  useEffect(() => {
    if (!refetchInterval) return;

    const interval = setInterval(() => {
      fetchVulnerabilities();
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [refetchInterval, fetchVulnerabilities]);

  return {
    vulnerabilities,
    loading,
    error,
    total,
    page,
    pages,
    refetch,
    updateStatus,
    getDetails,
  };
}

// Specialized hook for scan reports
export function useScanVulnerabilities(
  scanId: string,
  options: Omit<UseVulnerabilitiesOptions, "scanId"> = {}
) {
  return useVulnerabilities({
    ...options,
    scanId,
  });
}

// Hook for fetching all vulnerability types for a scan - FIXED VERSION
export function useAllScanVulnerabilities(scanId: string) {
  const [allVulnerabilities, setAllVulnerabilities] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track if we've done the initial fetch
  const initialFetchDone = useRef(false);
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    // Prevent duplicate calls
    if (fetchingRef.current) {
      return;
    }

    if (!scanId) {
      setError("Scan ID is required");
      setLoading(false);
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      // ✅ TRUST FIX: Use unified endpoint (1 call instead of 5)
      const response = await vulnerabilitiesApi.getVulnerabilitiesByScan(
        scanId,
        {} // No filters - get all vulnerabilities
      );

      if (mountedRef.current) {
        // Backend already deduplicates - no client-side dedup needed
        setAllVulnerabilities(response.vulnerabilities);
        initialFetchDone.current = true;
      }
    } catch (err: any) {
      console.error("Error fetching all vulnerabilities:", err);
      if (mountedRef.current) {
        setError(err.message || "Failed to fetch vulnerabilities");
      }
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [scanId]);

  // Only fetch once on mount
  useEffect(() => {
    if (!initialFetchDone.current) {
      fetchAll();
    }
  }, [fetchAll]);

  return {
    vulnerabilities: allVulnerabilities,
    loading,
    error,
    refetch: fetchAll,
  };
}