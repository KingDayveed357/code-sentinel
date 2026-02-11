// src/modules/scans/pipeline/steps/deduplicate.ts
// Core logic for processing raw scanner findings into unified model

import type { FastifyInstance } from "fastify";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Fingerprint — the identity key for vulnerabilities_unified
// ---------------------------------------------------------------------------
function generateFingerprint(
  vulnerability: any,
  repositoryId: string
): string {
  const scannerType = vulnerability.type;
  const ruleId = vulnerability.rule_id || "unknown";
  const cwe = vulnerability.cwe?.[0] || null;

  let input: string;

  if (scannerType === "sast" || scannerType === "secrets" || scannerType === "iac") {
    // ✅ CRITICAL FIX: File path is EXCLUDED from fingerprint
    // Same rule + CWE = same logical vulnerability
    // File locations are tracked in vulnerability_instances
    input = `${repositoryId}|${ruleId}|${cwe || ""}`;
  } else {
    // SCA / Container: repo + package_name + rule_id.
    const pkgName = vulnerability.metadata?.package_name || "unknown";
    input = `${repositoryId}|${pkgName}|${ruleId}`;
  }

  return crypto.createHash("sha256").update(input).digest("hex");
}

// ---------------------------------------------------------------------------
// Instance key — uniqueness within a single scan
// ---------------------------------------------------------------------------
export function generateInstanceKey(
  scanId: string,
  vulnerability: any,
  unifiedId: string
): string {
  const scannerType = vulnerability.type;

  let locationPart: string;
  if (scannerType === "sast" || scannerType === "secrets" || scannerType === "iac") {
    locationPart = `${vulnerability.file_path || "unknown"}:${vulnerability.line_start || 0}`;
  } else {
    locationPart = `${vulnerability.metadata?.package_name || "unknown"}:${vulnerability.metadata?.package_version || "unknown"}`;
  }

  return crypto
    .createHash("sha256")
    .update(`${scanId}|${unifiedId}|${locationPart}`)
    .digest("hex");
}

function generateRiskContext(vulnerability: any): any {
  const likelihood =
    vulnerability.severity === "critical" || vulnerability.severity === "high"
      ? "high"
      : vulnerability.severity === "medium"
      ? "medium"
      : "low";

  return {
    public_facing: true,
    auth_required: false,
    framework: "unknown",
    exploit_likelihood: likelihood,
  };
}

function prepareScannerMetadata(vuln: any): any {
  const metadata: any = { scanner: vuln.scanner, ...vuln.metadata };

  if (vuln.type === "sast") {
    metadata.category = vuln.category;
    metadata.owasp = vuln.owasp;
    metadata.cvss = vuln.cvss;
  } else if (vuln.type === "sca" || vuln.type === "container") {
    metadata.package_name = vuln.metadata?.package_name;
    metadata.package_version = vuln.metadata?.package_version;
    metadata.fixed_version = vuln.metadata?.fixed_version;
    metadata.ecosystem = vuln.metadata?.ecosystem;
    metadata.cve = vuln.cve;
  } else if (vuln.type === "secrets") {
    metadata.secret_type = vuln.metadata?.secret_type;
    metadata.entropy = vuln.metadata?.entropy;
  } else if (vuln.type === "iac") {
    metadata.resource_type = vuln.metadata?.resource_type;
    metadata.cloud_provider = vuln.metadata?.cloud_provider;
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function processUnifiedVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  workspaceId: string,
  repositoryId: string,
  vulnerabilities: any[]
): Promise<void> {
  fastify.log.info(
    { scanId, count: vulnerabilities.length, workspaceId, repositoryId },
    "🔄 START: Processing vulnerabilities for unified deduplication"
  );

  if (!vulnerabilities || vulnerabilities.length === 0) {
    fastify.log.warn({ scanId }, "⚠️  No vulnerabilities provided to process");
    return;
  }

  const now = new Date().toISOString();
  const stats = { created: 0, updated: 0, instances: 0, instancesSkipped: 0, titlesNormalized: 0, titleErrors: 0 };

  // Initialize AI service with proper error handling
  let titleGenerator: any = null;
  try {
    const { getTitleGenerator } = await import('../../../../services/ai');
    titleGenerator = getTitleGenerator(fastify);
    fastify.log.info({ scanId }, '✅ AI title generator initialized');
  } catch (error: any) {
    fastify.log.error(
      { error: error.message, stack: error.stack, scanId },
      '❌ CRITICAL: Failed to initialize AI title generator - will use fallback'
    );
  }

  // Always have synchronous title normalizer available
  const { normalizeTitle } = await import('../../../../scanners/utils/title-normalizer');

  try {
    // 1. Compute fingerprints + normalize titles
    fastify.log.info({ scanId, count: vulnerabilities.length }, "📝 Step 1: Computing fingerprints and normalizing titles");
    
    const vulnsWithFP = await Promise.all(
      vulnerabilities.map(async (vuln) => {
        let normalizedTitle = vuln.title || 'Untitled Vulnerability';
        
        try {
          if (titleGenerator) {
            try {
              normalizedTitle = await titleGenerator.generateTitle({
                rule_id: vuln.rule_id,
                description: vuln.description || '',
                scanner_type: vuln.type,
                severity: vuln.severity,
                file_path: vuln.file_path,
                cwe: vuln.cwe?.[0] || null,
                raw_title: vuln.title,
              });
              
              if (normalizedTitle !== vuln.title) {
                stats.titlesNormalized++;
              }
            } catch (aiError: any) {
                // Fallback handled below
              fastify.log.warn(
                { error: aiError.message, vulnId: vuln.id, scanId },
                '⚠️  AI title generation failed for vulnerability - using fallback'
              );
              stats.titleErrors++;
              normalizedTitle = normalizeTitle(vuln.rule_id, vuln.title, vuln.type);
            }
          } else {
            normalizedTitle = normalizeTitle(vuln.rule_id, vuln.title, vuln.type);
          }
        } catch (normalizationError: any) {
          fastify.log.error(
            { error: normalizationError.message, vulnId: vuln.id, scanId },
            '❌ CRITICAL: Title normalization failed - using original or rule_id'
          );
          stats.titleErrors++;
          normalizedTitle = vuln.title || vuln.rule_id || 'Unknown Vulnerability';
        }

        return {
          vuln: { ...vuln, title: normalizedTitle },
          fingerprint: generateFingerprint(vuln, repositoryId),
        };
      })
    );
    
    fastify.log.info(
      { scanId, uniqueFingerprints: new Set(vulnsWithFP.map(v => v.fingerprint)).size }, 
      "✅ Step 1 complete"
    );

    // 2. Fetch existing rows
    const uniqueFPs = [...new Set(vulnsWithFP.map((v) => v.fingerprint))];
    fastify.log.info({ scanId, uniqueFPs: uniqueFPs.length }, "🔍 Step 2: Fetching existing unified rows");

    const { data: existingRows, error: fetchError } = await fastify.supabase
      .from("vulnerabilities_unified")
      .select("id, fingerprint")
      .in("fingerprint", uniqueFPs);

    if (fetchError) {
      throw new Error(`Failed to fetch existing vulnerabilities: ${fetchError.message}`);
    }

    const existingMap = new Map<string, { id: string }>();
    existingRows?.forEach((r) => existingMap.set(r.fingerprint, { id: r.id }));

    // 3. Separate creates/updates
    fastify.log.info({ scanId }, "🔀 Step 3: Separating creates vs updates");
    const toCreate: any[] = [];
    const toUpdateFPs: string[] = [];
    const seenFPsThisBatch = new Set<string>();

    for (const { vuln, fingerprint } of vulnsWithFP) {
      if (existingMap.has(fingerprint)) {
        if (!toUpdateFPs.includes(fingerprint)) toUpdateFPs.push(fingerprint);
      } else if (!seenFPsThisBatch.has(fingerprint)) {
        seenFPsThisBatch.add(fingerprint);
        toCreate.push({
          fingerprint,
          title: vuln.title,
          description: vuln.description || "No description available",
          severity: vuln.severity,
          scanner_type: vuln.type,
          repository_id: repositoryId,
          workspace_id: workspaceId,
          file_path: vuln.file_path || null,
          line_start: vuln.line_start || null,
          line_end: vuln.line_end || null,
          cwe: vuln.cwe?.[0] || null,
          rule_id: vuln.rule_id || "unknown",
          scanner_metadata: prepareScannerMetadata(vuln),
          confidence: vuln.confidence || null,
          ai_risk_score: vuln.ai_risk_score || null,
          ai_priority: vuln.ai_priority || null,
          status: "open",
          ai_explanation: vuln.ai_explanation
            ? { summary: vuln.ai_explanation, generated_at: now, model_version: "legacy" }
            : null,
          ai_remediation: vuln.ai_remediation || null,
          ai_business_impact: vuln.ai_business_impact || null,
          ai_false_positive_score: vuln.ai_false_positive_score || null,
          risk_context: generateRiskContext(vuln),
          first_detected_at: now,
          last_seen_at: now,
        });
      }
    }

    // 4. Batch Insert
    if (toCreate.length > 0) {
      fastify.log.info({ scanId, count: toCreate.length }, "➕ Step 4: Inserting new unified rows");
      const { data: created, error } = await fastify.supabase
        .from("vulnerabilities_unified")
        .insert(toCreate)
        .select("id, fingerprint");

      if (error) {
        // Fallback: individual inserts
        fastify.log.warn({ error, scanId }, "⚠️ Batch insert failed, trying individual");
        for (const row of toCreate) {
          const { data: single, error: singleError } = await fastify.supabase
            .from("vulnerabilities_unified")
            .insert(row)
            .select("id, fingerprint")
            .single();
          if (single) {
            existingMap.set(single.fingerprint, { id: single.id });
            stats.created++;
          } else if (singleError) {
             // ignore - likely duplicate key race/constraint
          }
        }
      } else {
        created?.forEach((r) => existingMap.set(r.fingerprint, { id: r.id }));
        stats.created += created?.length || 0;
      }
    }

    // 5. Bump last_seen_at
    if (toUpdateFPs.length > 0) {
      // We can do one big update for all matching fingerprints
       const { error: updateError } = await fastify.supabase
          .from("vulnerabilities_unified")
          .update({ last_seen_at: now, updated_at: now })
          .in("fingerprint", toUpdateFPs);
        
       if (!updateError) stats.updated = toUpdateFPs.length;
    }

    // 6. Build instance rows
    fastify.log.info({ scanId, totalVulns: vulnsWithFP.length }, "📦 Step 6: Creating instance rows");
    const instanceKeySet = new Set<string>();
    const instancesToCreate: any[] = [];

    for (const { vuln, fingerprint } of vulnsWithFP) {
      const unified = existingMap.get(fingerprint);
      if (!unified) continue;

      const instanceKey = generateInstanceKey(scanId, vuln, unified.id);
      if (instanceKeySet.has(instanceKey)) {
        stats.instancesSkipped++;
        continue;
      }
      instanceKeySet.add(instanceKey);

      instancesToCreate.push({
        scan_id: scanId,
        vulnerability_id: unified.id,
        instance_key: instanceKey,
        source_table: `vulnerabilities_${vuln.type === "secret" ? "secrets" : vuln.type}`,
        source_id: null,
        file_path: vuln.file_path || null,
        line_start: vuln.line_start || null,
        line_end: vuln.line_end || null,
        package_name: vuln.metadata?.package_name || null,
        package_version: vuln.metadata?.package_version || null,
        scanner: vuln.scanner,
        detected_at: now,
        raw_finding: vuln,
      });
    }

    if (instancesToCreate.length > 0) {
      const { error: instanceError } = await fastify.supabase
        .from("vulnerability_instances")
        .insert(instancesToCreate);

      if (instanceError) {
         if (instanceError.code === "23505") { // Unique violation
             stats.instances += instancesToCreate.length; // Assume they exist
         } else {
             // Fallback individual
             for (const inst of instancesToCreate) {
                const { error: e } = await fastify.supabase.from("vulnerability_instances").insert(inst);
                if (!e) stats.instances++;
             }
         }
      } else {
        stats.instances += instancesToCreate.length;
      }
    }

    fastify.log.info({ ...stats, scanId }, "✅ COMPLETE: Unified vulnerability processing");
  } catch (error: any) {
    fastify.log.error({ error, scanId }, "❌ FAILED: Unified vulnerability processing");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Auto-fix missing vulnerabilities
// ---------------------------------------------------------------------------
export async function autoFixMissingVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  repositoryId: string
): Promise<{ fixed: number }> {
    const now = new Date().toISOString();

    const { data: currentScan } = await fastify.supabase
      .from("scans")
      .select("id, created_at")
      .eq("id", scanId)
      .single();

    if (!currentScan) return { fixed: 0 };

    const { data: previousScan } = await fastify.supabase
      .from("scans")
      .select("id")
      .eq("repository_id", repositoryId)
      .eq("status", "completed")
      .lt("created_at", currentScan.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!previousScan) return { fixed: 0 };

    const { data: prevInstances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("vulnerability_id")
      .eq("scan_id", previousScan.id);

    if (!prevInstances?.length) return { fixed: 0 };

    const { data: currInstances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("vulnerability_id")
      .eq("scan_id", scanId);

    const currSet = new Set(currInstances?.map((i) => i.vulnerability_id) || []);
    const fixedIds = [...new Set(prevInstances.map((i) => i.vulnerability_id))]
      .filter((id) => !currSet.has(id));

    if (!fixedIds.length) return { fixed: 0 };

    const { error } = await fastify.supabase
      .from("vulnerabilities_unified")
      .update({
        status: "fixed",
        resolved_at: now,
        updated_at: now,
      })
      .in("id", fixedIds)
      .eq("status", "open");

    if (error) {
      fastify.log.error({ error }, "Auto-fix update failed");
      return { fixed: 0 };
    }

    return { fixed: fixedIds.length };
}
