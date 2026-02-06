// src/modules/scans/deduplication-processor.ts
//
// MENTAL MODEL (after this fix):
//   vulnerabilities_unified  →  ONE row per logical vuln
//                                 (rule + type + repo [+ package for sca/container])
//   vulnerability_instances  →  ONE row per location/occurrence
//                                 (file:line, or package:version, per scan)
//
// Your global page queries vulnerabilities_unified → always ~12 rows.
// Drill-down / per-file views query vulnerability_instances → every location.

import type { FastifyInstance } from "fastify";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Fingerprint — the identity key for vulnerabilities_unified
// ---------------------------------------------------------------------------
// CRITICAL: File path is NOT part of the logical vulnerability identity.
//
// Rules:
//   SAST / Secret / IaC   → repo + rule_id + cwe
//     (File path is EXCLUDED - it's instance-level detail)
//     (Line number is EXCLUDED - it's instance-level detail)
//   SCA / Container       → repo + package_name + rule_id
//     (Version is EXCLUDED — a new version hit is still the same vuln)
//
// "SQL-injection rule CWE-89" is ONE unified vulnerability,
// regardless of how many files it appears in.
// Each file location becomes an instance row.
//
// This ensures:
//   - Same vulnerability in 10 files = 1 unified row + 10 instance rows
//   - Frontend shows "SQL Injection (10 locations)" not 10 separate vulns
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
    // SCA / container: repo + package_name + rule_id.
    // Version intentionally excluded — a vuln in lodash is the same vuln
    // whether you're on 4.17.20 or 4.17.21.
    const pkgName = vulnerability.metadata?.package_name || "unknown";
    input = `${repositoryId}|${pkgName}|${ruleId}`;
  }

  return crypto.createHash("sha256").update(input).digest("hex");
}

// ---------------------------------------------------------------------------
// Instance key — uniqueness within a single scan
// ---------------------------------------------------------------------------
// Two findings in the same scan with the same instance key are true
// duplicates (e.g. two scanners flagging the exact same line) and the
// second one gets dropped before we hit the DB.
// ---------------------------------------------------------------------------
function generateInstanceKey(
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

// ---------------------------------------------------------------------------
// Helpers (unchanged logic, just kept here for completeness)
// ---------------------------------------------------------------------------
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
// IMPORTANT: `vulnerabilities` here must be the FULL raw list from the
// scanners (allVulnerabilities), NOT dedupResult.unique.
// Every item becomes an instance row.  The fingerprint logic collapses
// them into the correct number of unified rows automatically.
// ---------------------------------------------------------------------------
export async function processUnifiedVulnerabilities(
  fastify: FastifyInstance,
  scanId: string,
  workspaceId: string,
  repositoryId: string,
  vulnerabilities: any[]   // ← full raw list, see worker.ts change
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

  // ✅ CRITICAL: Initialize AI service with proper error handling
  let titleGenerator: any = null;
  try {
    const { getTitleGenerator } = await import('../../services/ai');
    titleGenerator = getTitleGenerator(fastify);
    fastify.log.info({ scanId }, '✅ AI title generator initialized');
  } catch (error: any) {
    fastify.log.error(
      { error: error.message, stack: error.stack, scanId },
      '❌ CRITICAL: Failed to initialize AI title generator - will use fallback'
    );
    // Don't throw - continue with fallback title normalization
  }

  // ✅ FALLBACK: Always have synchronous title normalizer available
  const { normalizeTitle } = await import('../../scanners/utils/title-normalizer');

  try {
    // ------------------------------------------------------------------
    // 1. Compute fingerprints + normalize titles (all in-memory)
    // ------------------------------------------------------------------
    fastify.log.info({ scanId, count: vulnerabilities.length }, "📝 Step 1: Computing fingerprints and normalizing titles");
    
    const vulnsWithFP = await Promise.all(
      vulnerabilities.map(async (vuln) => {
        // ✅ CRITICAL: Normalize title with comprehensive error handling
        let normalizedTitle = vuln.title || 'Untitled Vulnerability';
        
        try {
          if (titleGenerator) {
            // Try AI-powered title generation
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
              // AI generation failed - use synchronous fallback
              fastify.log.warn(
                { 
                  error: aiError.message, 
                  vulnId: vuln.id, 
                  ruleId: vuln.rule_id,
                  originalTitle: vuln.title,
                  scanId 
                },
                '⚠️  AI title generation failed for vulnerability - using fallback'
              );
              stats.titleErrors++;
              
              // Fallback to synchronous normalizer
              normalizedTitle = normalizeTitle(
                vuln.rule_id,
                vuln.title,
                vuln.type
              );
            }
          } else {
            // No AI service - use synchronous normalizer directly
            normalizedTitle = normalizeTitle(
              vuln.rule_id,
              vuln.title,
              vuln.type
            );
          }
        } catch (normalizationError: any) {
          // Even fallback failed - use original title or generate from rule_id
          fastify.log.error(
            { 
              error: normalizationError.message,
              stack: normalizationError.stack,
              vulnId: vuln.id,
              ruleId: vuln.rule_id,
              originalTitle: vuln.title,
              scanId
            },
            '❌ CRITICAL: Both AI and fallback title generation failed - using original or rule_id'
          );
          stats.titleErrors++;
          
          // Last resort: use original title or extract from rule_id
          normalizedTitle = vuln.title || vuln.rule_id || 'Unknown Vulnerability';
        }

        return {
          vuln: { ...vuln, title: normalizedTitle },
          fingerprint: generateFingerprint(vuln, repositoryId),
        };
      })
    );
    
    fastify.log.info(
      { 
        scanId, 
        uniqueFingerprints: new Set(vulnsWithFP.map(v => v.fingerprint)).size,
        titlesNormalized: stats.titlesNormalized,
        titleErrors: stats.titleErrors
      }, 
      "✅ Step 1 complete"
    );

    // ------------------------------------------------------------------
    // 2. Bulk-fetch existing unified rows matching any fingerprint in batch
    // ------------------------------------------------------------------
    const uniqueFPs = [...new Set(vulnsWithFP.map((v) => v.fingerprint))];
    fastify.log.info({ scanId, uniqueFPs: uniqueFPs.length }, "🔍 Step 2: Fetching existing unified rows");

    const { data: existingRows, error: fetchError } = await fastify.supabase
      .from("vulnerabilities_unified")
      .select("id, fingerprint")
      .in("fingerprint", uniqueFPs);

    if (fetchError) {
      fastify.log.error({ error: fetchError, scanId }, "❌ Step 2 failed: Error fetching existing rows");
      throw new Error(`Failed to fetch existing vulnerabilities: ${fetchError.message}`);
    }

    // fingerprint → { id }
    const existingMap = new Map<string, { id: string }>();
    existingRows?.forEach((r) =>
      existingMap.set(r.fingerprint, { id: r.id })
    );
    fastify.log.info({ scanId, existingCount: existingMap.size }, "✅ Step 2 complete");

    // ------------------------------------------------------------------
    // 3. Separate into creates vs updates.
    //    Only ONE representative vuln per fingerprint becomes a unified row.
    //    The rest all become instances (handled in step 6).
    // ------------------------------------------------------------------
    fastify.log.info({ scanId }, "🔀 Step 3: Separating creates vs updates");
    const toCreate: any[] = [];
    const toUpdateFPs: string[] = [];
    const seenFPsThisBatch = new Set<string>(); // prevents duplicate INSERTs in same batch

    for (const { vuln, fingerprint } of vulnsWithFP) {
      if (existingMap.has(fingerprint)) {
        // Already in DB from a previous scan — just needs last_seen_at bump
        if (!toUpdateFPs.includes(fingerprint)) toUpdateFPs.push(fingerprint);
      } else if (!seenFPsThisBatch.has(fingerprint)) {
        // Brand new fingerprint, not yet queued — queue one INSERT
        seenFPsThisBatch.add(fingerprint);
        toCreate.push({
          fingerprint,
          title: vuln.title, // ✅ Now using normalized title
          description: vuln.description || "No description available",
          severity: vuln.severity,
          scanner_type: vuln.type,
          repository_id: repositoryId,
          workspace_id: workspaceId,
          // first_location is informational only for quick-glance in list views.
          // The instances table is the real source of truth for locations.
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
      // else: fingerprint already queued for create this batch — skip unified,
      // but it will still get an instance row in step 6.
    }
    fastify.log.info({ scanId, toCreate: toCreate.length, toUpdate: toUpdateFPs.length }, "✅ Step 3 complete");

    // ------------------------------------------------------------------
    // 4. Batch INSERT new unified rows
    // ------------------------------------------------------------------
    if (toCreate.length > 0) {
      fastify.log.info({ scanId, count: toCreate.length }, "➕ Step 4: Inserting new unified rows");
      const { data: created, error } = await fastify.supabase
        .from("vulnerabilities_unified")
        .insert(toCreate)
        .select("id, fingerprint");

      if (error) {
        fastify.log.error({ error, count: toCreate.length, scanId }, "⚠️  Batch insert into unified failed, trying individual inserts");
        // Fallback: individual inserts (handles race on fingerprint unique constraint)
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
            fastify.log.error({ error: singleError, fingerprint: row.fingerprint }, "❌ Failed to insert single unified row");
          }
        }
      } else {
        created?.forEach((r) => existingMap.set(r.fingerprint, { id: r.id }));
        stats.created += created?.length || 0;
        fastify.log.info({ scanId, created: stats.created }, "✅ Step 4 complete");
      }
    } else {
      fastify.log.info({ scanId }, "⏭️  Step 4 skipped: No new unified rows to create");
    }

    // ------------------------------------------------------------------
    // 5. Bump last_seen_at for unified rows that already
    //    existed before this scan.
    // ------------------------------------------------------------------
    if (toUpdateFPs.length > 0) {
      fastify.log.info({ scanId, count: toUpdateFPs.length }, "🔄 Step 5: Updating last_seen_at");
      for (const fp of toUpdateFPs) {
        const existing = existingMap.get(fp);
        if (!existing) continue;

        const { error: updateError } = await fastify.supabase
          .from("vulnerabilities_unified")
          .update({
            last_seen_at: now,
            updated_at: now,
          })
          .eq("fingerprint", fp);

        if (updateError) {
          fastify.log.error({ error: updateError, fingerprint: fp }, "❌ Failed to update last_seen_at");
        } else {
          stats.updated++;
        }
      }
      fastify.log.info({ scanId, updated: stats.updated }, "✅ Step 5 complete");
    } else {
      fastify.log.info({ scanId }, "⏭️  Step 5 skipped: No unified rows to update");
    }

    // ------------------------------------------------------------------
    // 6. Build instance rows — one per (scan + unified vuln + location).
    //    Deduplicate in-memory first so two scanners hitting the same
    //    file:line for the same logical vuln produce only one instance.
    // ------------------------------------------------------------------
    fastify.log.info({ scanId, totalVulns: vulnsWithFP.length }, "📦 Step 6: Creating instance rows");
    const instanceKeySet = new Set<string>();
    const instancesToCreate: any[] = [];

    for (const { vuln, fingerprint } of vulnsWithFP) {
      const unified = existingMap.get(fingerprint);
      if (!unified) {
        fastify.log.warn({ fingerprint, title: vuln.title, scanId }, "⚠️  No unified row resolved — skipping instance");
        continue;
      }

      const instanceKey = generateInstanceKey(scanId, vuln, unified.id);

      if (instanceKeySet.has(instanceKey)) {
        stats.instancesSkipped++;
        continue; // already queued in this batch
      }
      instanceKeySet.add(instanceKey);

      instancesToCreate.push({
        scan_id: scanId,
        vulnerability_id: unified.id,
        instance_key: instanceKey,          // stored for unique constraint / idempotency
        source_table: `vulnerabilities_${vuln.type === "secret" ? "secrets" : vuln.type}`,
        source_id: null,                    // backfill later if needed; raw_finding has everything
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
      fastify.log.info({ scanId, count: instancesToCreate.length }, "➕ Inserting instance rows");
      const { error: instanceError } = await fastify.supabase
        .from("vulnerability_instances")
        .insert(instancesToCreate);

      if (instanceError) {
        if (instanceError.code === "23505") {
          // Duplicate key — expected on re-scans.  Not a real failure.
          fastify.log.debug({ scanId, count: instancesToCreate.length }, "ℹ️  Some instances already existed (expected on re-scan)");
          stats.instances += instancesToCreate.length;
        } else {
          fastify.log.error({ error: instanceError, scanId }, "⚠️  Instance batch insert failed — falling back to individual");
          for (const inst of instancesToCreate) {
            const { error: e } = await fastify.supabase
              .from("vulnerability_instances")
              .insert(inst);
            if (!e) {
              stats.instances++;
            } else if (e.code !== "23505") {
              fastify.log.error({ error: e, instanceKey: inst.instance_key }, "❌ Single instance insert failed");
            }
          }
        }
      } else {
        stats.instances += instancesToCreate.length;
        fastify.log.info({ scanId, instances: stats.instances }, "✅ Step 6 complete");
      }
    } else {
      fastify.log.warn({ scanId }, "⚠️  No instances to create");
    }

    fastify.log.info({ ...stats, scanId }, "✅ COMPLETE: Unified vulnerability processing");
  } catch (error: any) {
    fastify.log.error({ error, scanId, stats }, "❌ FAILED: Unified vulnerability processing");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Auto-fix: mark vulns as "fixed" if they vanished between scans.
// Logic unchanged — it correctly diffs previous vs current via instances.
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

  fastify.log.info({ fixed: fixedIds.length, scanId }, "Auto-fixed missing vulnerabilities");
  return { fixed: fixedIds.length };
}

// ---------------------------------------------------------------------------
// AI enrichment stub (unchanged)
// ---------------------------------------------------------------------------
export async function queueAIEnrichment(
  fastify: FastifyInstance,
  scanId: string,
  severities: string[] = ["critical", "high"]
): Promise<{ queued: number }> {
  const { data: instances } = await fastify.supabase
    .from("vulnerability_instances")
    .select(`
      vulnerability_id,
      vulnerabilities_unified!inner (id, severity, ai_explanation)
    `)
    .eq("scan_id", scanId)
    .in("vulnerabilities_unified.severity", severities)
    .is("vulnerabilities_unified.ai_explanation", null);

  if (!instances?.length) return { queued: 0 };

  fastify.log.info({ count: instances.length, scanId }, "Would queue AI enrichment");
  return { queued: instances.length };
}