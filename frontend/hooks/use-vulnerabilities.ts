// hooks/use-vulnerabilities.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { vulnerabilitiesApi, type Vulnerability } from "@/lib/api/vulnerabilities";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";

export interface VulnerabilityFilters {
  severity?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface UseVulnerabilitiesOptions {
  workspaceId?: string;
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

// Define query keys for cache management
const vulnKeys = {
  all: (workspaceId: string) => ['vulnerabilities', workspaceId] as const,
  list: (workspaceId: string, params: any) => [...vulnKeys.all(workspaceId), 'list', params] as const,
  detail: (workspaceId: string, id: string) => [...vulnKeys.all(workspaceId), 'detail', id] as const,
  stats: (workspaceId: string) => [...vulnKeys.all(workspaceId), 'stats'] as const,
};

export function useVulnerabilityStats(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceId ? vulnKeys.stats(workspaceId) : ['vulnerability-stats', 'none'],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return vulnerabilitiesApi.getStats(workspaceId);
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useVulnerabilities(options: UseVulnerabilitiesOptions): UseVulnerabilitiesReturn {
  const {
    workspaceId,
    scanId,
    projectId,
    type,
    filters = {},
    autoFetch = true,
    refetchInterval,
  } = options;

  const queryClient = useQueryClient();

  // Construct stable query params
  const queryParams = {
    workspaceId,
    scanId,
    projectId,
    type,
    page: filters.page,
    limit: filters.limit,
    status: filters.status,
    severity: filters.severity,
    search: filters.search,
    sort: filters.sort,
  };

  const { 
    data, 
    isLoading, 
    error: queryError, 
    refetch 
  } = useQuery({
    queryKey: workspaceId ? vulnKeys.list(workspaceId, queryParams) : ['vulnerabilities', 'none'],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Workspace ID required");
      
      console.log('🛡️ Fetching vulnerabilities:', queryParams);

      if (scanId) {
        const response = await vulnerabilitiesApi.getByScan(
          workspaceId,
          scanId,
          {
            page: filters.page,
            limit: filters.limit,
            status: filters.status,
            severity: filters.severity ? [filters.severity] : undefined,
          }
        );
        return {
          vulnerabilities: response.vulnerabilities || [],
          total: response.total || 0,
          page: response.page || 1,
          pages: response.pages || 1,
        };
      } 
      
      const response = await vulnerabilitiesApi.getAll(workspaceId, {
        page: filters.page || 1,
        limit: filters.limit || 15,
        search: filters.search,
        severity: filters.severity ? [filters.severity] : undefined,
        status: filters.status,
        sort: filters.sort as any,
      });

      return {
        vulnerabilities: (response as any).data || [],
        total: (response as any).meta?.total || 0,
        page: (response as any).meta?.current_page || 1,
        pages: (response as any).meta?.total_pages || 1,
      };
    },
    enabled: !!workspaceId && autoFetch,
    refetchInterval: refetchInterval,
    staleTime: 1000 * 30, // 30 seconds
    placeholderData: keepPreviousData,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string, status: string, note?: string }) => {
      if (!workspaceId) throw new Error("Workspace ID required");
      return vulnerabilitiesApi.updateStatus(workspaceId, id, status as any, note);
    },
    onSuccess: (updatedVuln) => {
      // Invalidate list queries
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: vulnKeys.all(workspaceId) });
      }
      toast.success(`Vulnerability updated`);
    },
    onError: (err: any) => {
      toast.error("Update Failed");
      console.error(err);
    }
  });

  return {
    vulnerabilities: data?.vulnerabilities || [],
    loading: isLoading,
    error: queryError ? (queryError as Error).message : null,
    total: data?.total || 0,
    page: data?.page || 1,
    pages: data?.pages || 1,
    refetch: async () => { await refetch(); },
    updateStatus: async (id, type, status, note) => {
      await updateMutation.mutateAsync({ id, status, note });
    },
    getDetails: async (id, type) => {
      if (!workspaceId) return null;
      return queryClient.fetchQuery({
        queryKey: vulnKeys.detail(workspaceId, id),
        queryFn: () => vulnerabilitiesApi.getById(workspaceId, id),
        staleTime: 1000 * 60 * 5, // 5 minutes
      });
    },
  };
} 

// Specialized hook for scan reports
export function useScanVulnerabilities(
  workspaceId: string,
  scanId: string,
  options: Omit<UseVulnerabilitiesOptions, "workspaceId" | "scanId"> = {}
) {
  return useVulnerabilities({
    ...options,
    workspaceId,
    scanId,
  });
}

// Hook for fetching all vulnerability types for a scan
export function useAllScanVulnerabilities(workspaceId: string, scanId: string) {
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

    if (!scanId || !workspaceId) {
      setError("Scan ID and Workspace ID are required");
      setLoading(false);
      return;
    }

    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);

      // Use ByScan endpoint to get all vulnerabilities for a scan
      const response = await vulnerabilitiesApi.getByScan(
        workspaceId,
        scanId,
        {} // No filters - get all vulnerabilities
      );

      if (mountedRef.current) {
        // Backend already deduplicates - no client-side dedup needed
        setAllVulnerabilities(response.vulnerabilities || []);
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
  }, [scanId, workspaceId]);

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