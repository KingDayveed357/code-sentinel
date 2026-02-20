import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { scansApi, type Scan, type ScanStatus } from "@/lib/api/scans";

export interface ScanFilters {
  page?: number;
  limit?: number;
  sort?: string;
  status?: string;
}

export interface UseScansReturn {
  scans: Scan[];
  loading: boolean;
  error: unknown;
  total: number;
  perPage: number;
  totalPages: number;
}

export function useScans(filters: ScanFilters = {}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id;

  const {
    page = 1,
    limit = 15,
    sort = "recent",
    status
  } = filters;

  const queryKey = ['scans', workspaceId, { page, limit, sort, status }];

  const { 
    data, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: workspaceId ? queryKey : ['scans', 'none'],
    queryFn: async () => {
      if (!workspaceId) throw new Error("Workspace ID required");
      
      console.log('🔍 Fetching scans history:', { workspaceId, page, limit });
      return scansApi.getAll(workspaceId, {
        page,
        limit,
        sort,
        status,
      });
    },
    enabled: !!workspaceId,
    staleTime: 5 * 1000, // 5 seconds - keep fresh for active monitoring
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true, // Override global for scan-critical pages
    // ✅ Smart polling: poll while any scan is in-progress, stop when all are terminal
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActiveScans = data?.data?.some(
        (s: Scan) => s.status === 'processing' || s.status === 'queued'
      );
      return hasActiveScans ? 5000 : false;
    },
  });

  return {
    scans: data?.data || [],
    loading: isLoading,
    error,
    total: data?.meta?.total || 0,
    perPage: limit,
    totalPages: data?.meta?.total_pages || 1,
  };
}
