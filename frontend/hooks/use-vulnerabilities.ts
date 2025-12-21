// hooks/use-vulnerabilities.ts
import { useState, useEffect, useCallback } from "react";
import { vulnerabilitiesApi, type Vulnerability } from "@/lib/api/vulnerabilities";
import { useToast } from "@/hooks/use-toast";

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

  const { toast } = useToast();
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const fetchVulnerabilities = useCallback(async () => {
    if (!scanId && !projectId) {
      setError("Either scanId or projectId is required");
      return;
    }

    try {
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

      setVulnerabilities(response.vulnerabilities);
      setTotal(response.total);
      setPage(response.page);
      setPages(response.pages);
    } catch (err: any) {
      const errorMessage = err.message || "Failed to fetch vulnerabilities";
      setError(errorMessage);
      console.error("Error fetching vulnerabilities:", err);
    } finally {
      setLoading(false);
    }
  }, [scanId, projectId, type, filters]);

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

        toast({
          title: "Status Updated",
          description: `Vulnerability marked as ${status.replace("_", " ")}`,
        });
      } catch (err: any) {
        toast({
          title: "Update Failed",
          description: err.message || "Failed to update vulnerability status",
          variant: "destructive",
        });
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
        toast({
          title: "Failed to Load Details",
          description: err.message || "Could not fetch vulnerability details",
          variant: "destructive",
        });
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

// Hook for fetching all vulnerability types for a scan
export function useAllScanVulnerabilities(scanId: string) {
  const [allVulnerabilities, setAllVulnerabilities] = useState<Vulnerability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sast = useVulnerabilities({ scanId, type: "sast", autoFetch: false });
  const sca = useVulnerabilities({ scanId, type: "sca", autoFetch: false });
  const secrets = useVulnerabilities({ scanId, type: "secrets", autoFetch: false });
  const iac = useVulnerabilities({ scanId, type: "iac", autoFetch: false });
  const container = useVulnerabilities({ scanId, type: "container", autoFetch: false });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        sast.refetch(),
        sca.refetch(),
        secrets.refetch(),
        iac.refetch(),
        container.refetch(),
      ]);

      const combined = [
        ...sast.vulnerabilities,
        ...sca.vulnerabilities,
        ...secrets.vulnerabilities,
        ...iac.vulnerabilities,
        ...container.vulnerabilities,
      ];

      setAllVulnerabilities(combined);
    } catch (err: any) {
      setError(err.message || "Failed to fetch vulnerabilities");
    } finally {
      setLoading(false);
    }
  }, [sast, sca, secrets, iac, container]);

  useEffect(() => {
    fetchAll();
  }, []);

  return {
    vulnerabilities: allVulnerabilities,
    loading: loading || sast.loading || sca.loading || secrets.loading || iac.loading || container.loading,
    error: error || sast.error || sca.error || secrets.error || iac.error || container.error,
    refetch: fetchAll,
    byType: {
      sast: sast.vulnerabilities,
      sca: sca.vulnerabilities,
      secrets: secrets.vulnerabilities,
      iac: iac.vulnerabilities,
      container: container.vulnerabilities,
    },
  };
}