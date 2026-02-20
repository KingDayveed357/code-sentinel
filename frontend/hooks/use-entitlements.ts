import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { entitlementsApi, type Entitlements } from "@/lib/api/entitlements";
import { useWorkspace } from "./use-workspace";

interface UseEntitlementsReturn {
  entitlements: Entitlements | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  isApproachingLimit: (type: 'scans' | 'repositories' | 'seats') => boolean;
  isLimitExceeded: (type: 'scans' | 'repositories' | 'seats') => boolean;
  getUsagePercentage: (type: 'scans' | 'repositories' | 'seats' | 'concurrent') => number;
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
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const isApproachingLimit = useCallback((type: 'scans' | 'repositories' | 'seats'): boolean => {
    if (!entitlements) return false;

    if (type === 'scans') {
      return entitlementsApi.isApproachingLimit(
        entitlements.usage.scans_this_month,
        entitlements.limits.scans_per_month
      );
    } else if (type === 'repositories') {
      return entitlementsApi.isApproachingLimit(
        entitlements.usage.repositories,
        entitlements.limits.repositories
      );
    } else {
      return entitlementsApi.isApproachingLimit(
        entitlements.usage.seats,
        entitlements.limits.seats
      );
    }
  }, [entitlements]);

  const isLimitExceeded = useCallback((type: 'scans' | 'repositories' | 'seats'): boolean => {
    if (!entitlements) return false;

    if (type === 'scans') {
      return entitlementsApi.isLimitExceeded(
        entitlements.usage.scans_this_month,
        entitlements.limits.scans_per_month
      );
    } else if (type === 'repositories') {
      return entitlementsApi.isLimitExceeded(
        entitlements.usage.repositories,
        entitlements.limits.repositories
      );
    } else {
      return entitlementsApi.isLimitExceeded(
        entitlements.usage.seats,
        entitlements.limits.seats
      );
    }
  }, [entitlements]);

  const getUsagePercentage = useCallback((type: 'scans' | 'repositories' | 'seats' | 'concurrent'): number => {
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
      case 'seats':
        return entitlementsApi.calculateUsagePercentage(
          entitlements.usage.seats,
          entitlements.limits.seats
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