// src/modules/scans/pipeline/utils/cache.ts
// Scan result caching based on commit hash

import type { FastifyInstance } from 'fastify';

export interface ScanCacheResult {
  cached: boolean;
  scanId?: string;
  message?: string;
}

interface ScannerConfig {
  sast: boolean;
  sca: boolean;
  secrets: boolean;
  iac: boolean;
  container: boolean;
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
 * ✅ UPDATED: Clones from vulnerability_instances (Source of Truth) to new vulnerability_instances
 * Links to existing unified vulnerabilities
 */
export async function cloneScanResults(
  fastify: FastifyInstance,
  sourceScanId: string,
  newScanId: string
): Promise<{ cloned: number }> {
  
  let totalCloned = 0;
  
  try {
    fastify.log.info({ sourceScanId, newScanId }, '🔍 Starting cloneScanResults');
    
    // 1. Fetch all instances from source scan
    const { data: instances, error: fetchError } = await fastify.supabase
      .from('vulnerability_instances')
      .select('*')
      .eq('scan_id', sourceScanId);
    
    fastify.log.info({ 
      sourceScanId, 
      newScanId,
      instanceCount: instances?.length || 0,
      hasError: !!fetchError,
      errorMessage: fetchError?.message
    }, '📊 Fetched instances from source scan');
    
    if (fetchError) {
      fastify.log.warn({ error: fetchError, sourceScanId }, '❌ Failed to fetch instances for cloning');
      return { cloned: 0 };
    }
    
    if (!instances || instances.length === 0) {
      fastify.log.warn({ sourceScanId, newScanId }, '⚠️ Source scan has 0 instances to clone');
      return { cloned: 0 };
    }
    
    // Log sample of first instance for debugging
    fastify.log.debug({ 
      sourceScanId,
      newScanId,
      sampleInstance: {
        id: instances[0].id,
        vulnerability_id: instances[0].vulnerability_id,
        has_raw_finding: !!instances[0].raw_finding,
        raw_finding_type: typeof instances[0].raw_finding,
        raw_finding_has_type: instances[0].raw_finding?.type || 'N/A'
      }
    }, '🔬 Sample instance data');

    // Import generateInstanceKey dynamically to avoid circular dependency
    const { generateInstanceKey } = await import('../steps/deduplicate');

    // 2. Validate and prepare new instances 
    // ✅ CRITICAL FIX: Regenerate instance_key with the NEW scanId
    const clonedInstances: any[] = [];
    const skippedInstances: any[] = [];
    
    for (const inst of instances) {
      // ✅ SAFETY: Parse raw_finding if it's a string (Supabase sometimes returns JSON as string)
      let rawFinding = inst.raw_finding;
      if (typeof rawFinding === 'string') {
        try {
          rawFinding = JSON.parse(rawFinding);
        } catch (parseError) {
          fastify.log.warn({ 
            instanceId: inst.id,
            rawFindingType: typeof rawFinding,
            sourceScanId,
            newScanId
          }, '⚠️ Skipping instance: raw_finding is a string but failed to parse as JSON');
          skippedInstances.push({ id: inst.id, reason: 'json_parse_failed' });
          continue;
        }
      }
      
      // ✅ VALIDATION: Ensure raw_finding exists and is valid
      if (!rawFinding) {
        fastify.log.warn({ 
          instanceId: inst.id, 
          vulnerabilityId: inst.vulnerability_id,
          sourceScanId,
          newScanId 
        }, '⚠️ Skipping instance: raw_finding is null or undefined');
        skippedInstances.push({ id: inst.id, reason: 'missing_raw_finding' });
        continue;
      }

      // ✅ VALIDATION: Ensure raw_finding has required fields
      if (!rawFinding.type) {
        fastify.log.warn({ 
          instanceId: inst.id,
          rawFinding: rawFinding,
          sourceScanId,
          newScanId
        }, '⚠️ Skipping instance: raw_finding.type is missing');
        skippedInstances.push({ id: inst.id, reason: 'invalid_raw_finding' });
        continue;
      }

      try {
        const { id, created_at, ...rest } = inst;
        
        // Re-generate key for the new scan using the parsed raw_finding
        const newKey = generateInstanceKey(newScanId, rawFinding, inst.vulnerability_id);
        
        clonedInstances.push({
          ...rest,
          scan_id: newScanId,
          instance_key: newKey,
          raw_finding: rawFinding, // ✅ Use the parsed version
          detected_at: new Date().toISOString()
        });
      } catch (keyError: any) {
        fastify.log.error({ 
          error: keyError.message,
          instanceId: inst.id,
          rawFinding: rawFinding,
          sourceScanId,
          newScanId
        }, '❌ Failed to generate instance key');
        skippedInstances.push({ id: inst.id, reason: 'key_generation_failed', error: keyError.message });
      }
    }
    
    // ✅ VALIDATION: Check if we have any instances to clone
    if (clonedInstances.length === 0) {
      const errorMsg = `Failed to clone any instances. Total: ${instances.length}, Skipped: ${skippedInstances.length}`;
      fastify.log.error({ 
        sourceScanId, 
        newScanId, 
        totalInstances: instances.length,
        skippedInstances,
        skippedCount: skippedInstances.length
      }, `❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (skippedInstances.length > 0) {
      fastify.log.warn({ 
        sourceScanId, 
        newScanId, 
        skippedCount: skippedInstances.length,
        clonedCount: clonedInstances.length,
        skippedInstances: skippedInstances.slice(0, 5) // Log first 5 for debugging
      }, `⚠️ Skipped ${skippedInstances.length} instances during cloning`);
    }
    
    fastify.log.info({ 
      sourceScanId, 
      newScanId, 
      count: clonedInstances.length,
      skipped: skippedInstances.length
    }, '📦 Prepared instances for cloning');

    // 3. Batch insert (UPSERT to be safe and idempotent)
    const { error: insertError } = await fastify.supabase
      .from('vulnerability_instances')
      .upsert(clonedInstances, { onConflict: 'instance_key' });
    
    if (insertError) {
      fastify.log.error({ 
        error: insertError, 
        count: clonedInstances.length,
        sourceScanId,
        newScanId,
        errorCode: insertError.code,
        errorDetails: insertError.details
      }, '❌ Failed to clone vulnerability instances');
      throw insertError;
    }
    
    totalCloned = clonedInstances.length;
    fastify.log.info({ 
      count: totalCloned, 
      newScanId,
      sourceScanId
    }, '✅ Successfully cloned vulnerability instances');
    
    // 4. Update unified vulnerabilities last_seen_at
    const unifiedIds = [...new Set(instances.map(i => i.vulnerability_id))];
    if (unifiedIds.length > 0) {
      const { error: updateError } = await fastify.supabase
        .from('vulnerabilities_unified')
        .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in('id', unifiedIds);
      
      if (updateError) {
        fastify.log.warn({ error: updateError, unifiedIds: unifiedIds.length }, '⚠️ Failed to update unified vulnerabilities last_seen_at');
      }
    }
  } catch (err: any) {
    fastify.log.error({ 
      err: err.message,
      stack: err.stack,
      sourceScanId, 
      newScanId 
    }, '💥 Error cloning scan results');
    // ✅ RE-THROW: Don't silently swallow errors
    throw err;
  }
  
  return { cloned: totalCloned };
}
