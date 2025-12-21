// hooks/use-scan-status.ts - Real-time Scanning with Logs
import { useState, useEffect, useRef, useCallback } from "react";
import { scansApi, type Scan, type ScanLog, type ScanSummary } from "@/lib/api/scans";

export function useScanStatus(scanId: string, pollInterval: number = 3000) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);
  const lastLogCountRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const data = await scansApi.getStatus(scanId);
      
      if (!isMountedRef.current) return;
      
      setScan(data.scan);
      setSummary(data.summary);
      setError(null);
      
      // Fetch logs if scan is in progress
      if (data.scan.status === 'running' || 
          data.scan.status === 'normalizing' || 
          data.scan.status === 'ai_enriching') {
        
        const logsData = await scansApi.getLogs(scanId);
        
        if (!isMountedRef.current) return;
        
        // Only update if logs changed (avoid unnecessary re-renders)
        if (logsData.logs.length !== lastLogCountRef.current) {
          setLogs(logsData.logs);
          lastLogCountRef.current = logsData.logs.length;
        }
      }
      
      // Stop polling if scan is complete or failed
      if (data.scan.status === 'completed' || 
          data.scan.status === 'failed' || 
          data.scan.status === 'cancelled') {
        setIsPolling(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        
        // Fetch final logs
        const logsData = await scansApi.getLogs(scanId);
        if (isMountedRef.current) {
          setLogs(logsData.logs);
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      
      setError(err.message || "Failed to fetch scan status");
      setIsPolling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [scanId]);

  useEffect(() => {
    isMountedRef.current = true;
    
    // Initial fetch
    fetchStatus();

    // Start polling
    setIsPolling(true);
    intervalRef.current = setInterval(fetchStatus, pollInterval);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [scanId, pollInterval, fetchStatus]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchStatus();
  }, [fetchStatus]);

  return {
    scan,
    summary,
    logs,
    loading,
    error,
    isPolling,
    refresh,
  };
}

// Hook for repository page with latest scan info
export function useRepositoryScanStatus(repoId: string, pollInterval: number = 5000) {
  const [latestScan, setLatestScan] = useState<Scan | null>(null);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout>();
  const isMountedRef = useRef(true);

  const fetchLatestScan = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const data = await scansApi.getHistory(repoId, { page: 1, limit: 1 });
      
      if (!isMountedRef.current) return;
      
      if (data.scans.length > 0) {
        const scan = data.scans[0];
        setLatestScan(scan);
        
        // Fetch logs if scan is in progress
        if (scan.status === 'running' || 
            scan.status === 'normalizing' || 
            scan.status === 'ai_enriching') {
          
          const logsData = await scansApi.getLogs(scan.id);
          if (isMountedRef.current) {
            setLogs(logsData.logs);
          }
        } else {
          setLogs([]);
        }
      }
      
      setError(null);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setError(err.message || "Failed to fetch scan status");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [repoId]);

  useEffect(() => {
    isMountedRef.current = true;
    
    // Initial fetch
    fetchLatestScan();

    // Start polling only if there's an active scan
    intervalRef.current = setInterval(() => {
      if (latestScan && 
          (latestScan.status === 'running' || 
           latestScan.status === 'normalizing' || 
           latestScan.status === 'ai_enriching')) {
        fetchLatestScan();
      }
    }, pollInterval);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [repoId, latestScan?.status, pollInterval, fetchLatestScan]);

  return {
    latestScan,
    logs,
    loading,
    error,
    refresh: fetchLatestScan,
  };
}