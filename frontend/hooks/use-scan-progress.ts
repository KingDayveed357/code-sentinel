// hooks/use-scan-progress.ts
import { useState, useEffect, useCallback } from 'react';
import { scansApi } from '@/lib/api/scans';
import { useAuth } from './use-auth';

export interface ScanProgressEvent {
  id: string;
  scan_id: string;
  stage: string;
  progress_percent: number;
  current_scanner: string | null;
  message: string;
  created_at: string;
}

/**
 * Hook to track scan progress
 * Progress is stored directly in the scans table (progress_percentage, progress_stage)
 * This hook polls the scan detail endpoint to get the latest progress
 */
export function useScanProgress(scanId: string, enabled: boolean = true) {
  const { workspaceId } = useAuth();
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!enabled || !scanId || !workspaceId) return;

    try {
      // Fetch scan details which includes progress_percentage and progress_stage
      const scan = await scansApi.getById(workspaceId, scanId);
      
      // Convert scan progress to ScanProgressEvent format
      if (scan.progress_percentage !== null && scan.progress_percentage !== undefined) {
        setProgress({
          id: scan.id,
          scan_id: scan.id,
          stage: scan.progress_stage || 'Scanning',
          progress_percent: scan.progress_percentage,
          current_scanner: null, // Not tracked separately
          message: scan.progress_stage || 'Scanning in progress',
          created_at: new Date().toISOString(),
        });
      }
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch progress:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [scanId, workspaceId, enabled]);

  useEffect(() => {
    if (!enabled || !scanId || !workspaceId) return;

    // Initial fetch
    fetchProgress();

    // Poll every 3 seconds (matches scan detail page polling)
    const interval = setInterval(fetchProgress, 3000);

    return () => clearInterval(interval);
  }, [scanId, workspaceId, enabled, fetchProgress]);

  return { progress, loading, error };
}
