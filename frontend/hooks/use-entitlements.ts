import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { entitlementsApi, type Entitlements } from "@/lib/api/entitlements";
import { useWorkspace } from "./use-workspace";
import { useAuth } from "./use-auth"; // Keep imports if needed for types

interface UseEntitlementsReturn {
  entitlements: Entitlements | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  isApproachingLimit: (type: 'scans' | 'repositories') => boolean;
  isLimitExceeded: (type: 'scans' | 'repositories') => boolean;
  getUsagePercentage: (type: 'scans' | 'repositories' | 'concurrent') => number;
  formatLimit: (value: number | null) => string;
}

export function useEntitlements(): UseEntitlementsReturn {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  // Define query key
  const queryKey = ['entitlements', workspace?.id];

  const { 
    data: entitlements, 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!workspace?.id) throw new Error("Workspace ID required");
      console.log('💰 Fetching entitlements for workspace:', { 
        workspaceId: workspace.id, 
        name: workspace.name 
      });
      return entitlementsApi.getEntitlements(workspace.id);
    },
    enabled: !!workspace?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes (React Query cache, key-isolated!)
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const isApproachingLimit = useCallback((type: 'scans' | 'repositories'): boolean => {
    if (!entitlements) return false;

    if (type === 'scans') {
      return entitlementsApi.isApproachingLimit(
        entitlements.usage.scans_this_month,
        entitlements.limits.scans_per_month
      );
    } else {
      return entitlementsApi.isApproachingLimit(
        entitlements.usage.repositories,
        entitlements.limits.repositories
      );
    }
  }, [entitlements]);

  const isLimitExceeded = useCallback((type: 'scans' | 'repositories'): boolean => {
    if (!entitlements) return false;

    if (type === 'scans') {
      return entitlementsApi.isLimitExceeded(
        entitlements.usage.scans_this_month,
        entitlements.limits.scans_per_month
      );
    } else {
      return entitlementsApi.isLimitExceeded(
        entitlements.usage.repositories,
        entitlements.limits.repositories
      );
    }
  }, [entitlements]);

  const getUsagePercentage = useCallback((type: 'scans' | 'repositories' | 'concurrent'): number => {
    if (!entitlements) return 0;

    switch (type) {
      case 'scans':
        return entitlementsApi.calculateUsagePercentage(
          entitlements.usage.scans_this_month,
          entitlements.limits.scans_per_month
        );
      case 'repositories':
        return entitlementsApi.calculateUsagePercentage(
          entitlements.usage.repositories,
          entitlements.limits.repositories
        );
      case 'concurrent':
        return entitlementsApi.calculateUsagePercentage(
          entitlements.usage.concurrent_scans,
          entitlements.limits.concurrent_scans
        );
      default:
        return 0;
    }
  }, [entitlements]);

  const formatLimit = useCallback((value: number | null): string => {
    return entitlementsApi.formatLimit(value);
  }, []);

  return {
    entitlements: entitlements || null,
    loading: isLoading,
    error: error as Error | null,
    refresh,
    isApproachingLimit,
    isLimitExceeded,
    getUsagePercentage,
    formatLimit,
  };
}