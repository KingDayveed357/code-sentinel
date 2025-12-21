// hooks/use-entitlements.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { entitlementsApi, entitlementsClient, type Entitlements } from "@/lib/api/entitlements";
import { useAuth } from "./use-auth";

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

/**
 * React hook for managing entitlements and usage tracking
 * Automatically refreshes when user changes and provides utility methods
 */
export function useEntitlements(): UseEntitlementsReturn {
  const { user, session } = useAuth();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEntitlements = useCallback(async (forceRefresh: boolean = false) => {
    if (!user || !session) {
      setEntitlements(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await entitlementsClient.getEntitlements(forceRefresh);
      setEntitlements(data);
    } catch (err) {
      console.error("Failed to fetch entitlements:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch entitlements"));
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  // Initial fetch and refresh on user change
  useEffect(() => {
    fetchEntitlements();
  }, [fetchEntitlements]);

  const refresh = useCallback(async () => {
    await fetchEntitlements(true);
  }, [fetchEntitlements]);

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
    entitlements,
    loading,
    error,
    refresh,
    isApproachingLimit,
    isLimitExceeded,
    getUsagePercentage,
    formatLimit,
  };
}