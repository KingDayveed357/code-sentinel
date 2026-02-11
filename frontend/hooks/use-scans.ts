import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { scansApi, type Scan } from "@/lib/api/scans";

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
    staleTime: 1000 * 30, // 30 seconds
    placeholderData: keepPreviousData,
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
