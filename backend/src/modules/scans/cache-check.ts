// src/modules/scans/cache-check.ts
// Scan result caching based on commit hash

import type { FastifyInstance } from 'fastify';
import type { ScannerConfig } from '../../scanners/orchestrator';

export interface ScanCacheResult {
  cached: boolean;
  scanId?: string;
  message?: string;
}

/**
 * Check if we have a completed scan for this exact commit and scanner config
 * If yes, we can skip rescanning and clone the results
 */
export async function checkScanCache(
  fastify: FastifyInstance,
  repositoryId: string,
  commitHash: string,
  scannerConfig: ScannerConfig
): Promise<ScanCacheResult> {
  
  if (commitHash === 'unknown' || !commitHash) {
    return { 
      cached: false, 
      message: 'No commit hash available for caching' 
    };
  }
  
  // Find a completed scan with same commit and same scanner config
  const { data: existingScan, error } = await fastify.supabase
    .from('scans')
    .select('id, commit_hash, sast_enabled, sca_enabled, secrets_enabled, iac_enabled, container_enabled, created_at')
    .eq('repository_id', repositoryId)
    .eq('commit_hash', commitHash)
    .eq('status', 'completed')
    .eq('sast_enabled', scannerConfig.sast)
    .eq('sca_enabled', scannerConfig.sca)
    .eq('secrets_enabled', scannerConfig.secrets)
    .eq('iac_enabled', scannerConfig.iac)
    .eq('container_enabled', scannerConfig.container)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  if (error || !existingScan) {
    return { 
      cached: false, 
      message: 'No cached scan found for this commit and configuration' 
    };
  }
  
  fastify.log.info(
    { 
      cachedScanId: existingScan.id, 
      commitHash: commitHash.substring(0, 7),
      age: new Date().getTime() - new Date(existingScan.created_at).getTime()
    },
    'Found cached scan results'
  );
  
  return { 
    cached: true, 
    scanId: existingScan.id,
    message: `Using cached results from scan ${existingScan.id.substring(0, 8)}`
  };
}

/**
 * Clone vulnerability records from a cached scan to a new scan
 * This maintains scan history while avoiding rescan
 */
export async function cloneScanResults(
  fastify: FastifyInstance,
  sourceScanId: string,
  newScanId: string
): Promise<{ cloned: number }> {
  
  const tables = [
    'vulnerabilities_sast',
    'vulnerabilities_sca', 
    'vulnerabilities_secrets',
    'vulnerabilities_iac',
    'vulnerabilities_container'
  ];
  
  let totalCloned = 0;
  
  for (const table of tables) {
    try {
      const { data: vulns, error: fetchError } = await fastify.supabase
        .from(table)
        .select('*')
        .eq('scan_id', sourceScanId);
      
      if (fetchError) {
        fastify.log.warn({ error: fetchError, table }, 'Failed to fetch vulnerabilities for cloning');
        continue;
      }
      
      if (vulns && vulns.length > 0) {
        // Clone vulnerabilities with new scan_id
        const clonedVulns = vulns.map(v => {
          const { id, created_at, ...rest } = v;
          return {
            ...rest,
            scan_id: newScanId,
            detected_at: new Date().toISOString()
          };
        });
        
        const { error: insertError } = await fastify.supabase
          .from(table)
          .insert(clonedVulns);
        
        if (insertError) {
          fastify.log.error({ error: insertError, table }, 'Failed to clone vulnerabilities');
        } else {
          totalCloned += clonedVulns.length;
          fastify.log.info({ table, count: clonedVulns.length }, 'Cloned vulnerabilities');
        }
      }
    } catch (err) {
      fastify.log.error({ err, table }, 'Error cloning vulnerabilities');
    }
  }
  
  return { cloned: totalCloned };
}
