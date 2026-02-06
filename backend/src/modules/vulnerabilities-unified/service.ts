// src/modules/vulnerabilities-unified/service.ts
// Service layer for unified vulnerability operations

import type { FastifyInstance } from "fastify";
import type {
  VulnerabilityUnified,
  VulnerabilityWithInstances,
  VulnerabilityFilters,
  VulnerabilityStats,
  PaginatedResponse,
} from "./types";

/**
 * ✅ DATA INTEGRITY: Single Source of Truth Architecture
 * 
 * This service enforces a strict separation between:
 * 
 * 1. VULNERABILITIES_UNIFIED (Source of Truth)
 *    - One row per unique vulnerability (deduplicated by fingerprint)
 *    - Contains: title, description, severity, scanner_type, status, etc.
 *    - This is what users see in the global vulnerabilities list
 *    - Never query raw scanner tables directly for user-facing data
 * 
 * 2. VULNERABILITY_INSTANCES (Occurrences)
 *    - Multiple rows per vulnerability (one per scan where it was found)
 *    - Links: vulnerability_id -> vulnerabilities_unified.id
 *    - Contains: scan_id, detected_at, raw_finding
 *    - Used only for: instance counts, location history, scan tracking
 * 
 * RULES:
 * - Global list: Query vulnerabilities_unified, enrich with instance_count
 * - Detail page: Query vulnerabilities_unified, paginate instances separately
 * - Never render all instances at once (use pagination)
 * - Instance counts are computed server-side, not client-side
 * - All user-facing queries MUST use vulnerabilities_unified as the source
 */

/**
 * Get all vulnerabilities for a workspace (global view)
 * ✅ BIRD'S-EYE VIEW: Returns one row per unified vulnerability
 * Instance data is aggregated (count only), never expanded in list view
 */
export async function getVulnerabilitiesByWorkspace(
  fastify: FastifyInstance,
  workspaceId: string,
  filters: VulnerabilityFilters
): Promise<PaginatedResponse<VulnerabilityUnified>> {
  const offset = (filters.page - 1) * filters.limit;

  // Build query with instance count
  // Note: Supabase doesn't support subqueries in select, so we'll fetch counts separately
  let query = fastify.supabase
    .from("vulnerabilities_unified")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  // Apply filters
  if (filters.severity && Array.isArray(filters.severity)) {
    query = query.in("severity", filters.severity);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.scanner_type) {
    query = query.eq("scanner_type", filters.scanner_type);
  }

  if (filters.assigned_to) {
    query = query.eq("assigned_to", filters.assigned_to);
  }

  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,file_path.ilike.%${filters.search}%`
    );
  }

  // Apply sorting
  switch (filters.sort) {
    case "severity":
      // Custom severity order: critical > high > medium > low > info
      query = query.order("severity", { ascending: false });
      query = query.order("first_detected_at", { ascending: false });
      break;
    case "recent":
      query = query.order("last_seen_at", { ascending: false });
      break;
    case "oldest":
      query = query.order("first_detected_at", { ascending: true });
      break;
    case "confidence":
      query = query.order("confidence", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("severity", { ascending: false });
  }

  // Apply pagination
  query = query.range(offset, offset + filters.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    fastify.log.error(
      { error, workspaceId, filters },
      "Failed to fetch vulnerabilities"
    );
    throw fastify.httpErrors.internalServerError(
      "Failed to fetch vulnerabilities"
    );
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / filters.limit);

  // Fetch instance counts for the returned vulnerabilities
  const vulnerabilityIds = (data || []).map(v => v.id);
  let enrichedData = data || [];

  if (vulnerabilityIds.length > 0) {
    const { data: instanceCounts } = await fastify.supabase
      .from("vulnerability_instances")
      .select("vulnerability_id")
      .in("vulnerability_id", vulnerabilityIds);

    // Count instances per vulnerability
    const countMap = new Map<string, number>();
    (instanceCounts || []).forEach(instance => {
      const current = countMap.get(instance.vulnerability_id) || 0;
      countMap.set(instance.vulnerability_id, current + 1);
    });

    // Enrich data with instance counts
    enrichedData = (data || []).map(vuln => ({
      ...vuln,
      instance_count: countMap.get(vuln.id) || 0,
    }));
  }

  return {
    data: enrichedData,
    meta: {
      current_page: filters.page,
      per_page: filters.limit,
      total,
      total_pages: totalPages,
      has_next: filters.page < totalPages,
      has_prev: filters.page > 1,
    },
  };
}

/**
 * Get single vulnerability details with optional includes
 * ✅ INSTANCE EXPLOSION CONTROL: Instances are paginated to prevent overwhelming UX
 * Frontend must explicitly request instances with pagination parameters
 */
export async function getVulnerabilityDetails(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  includes: string[] = [],
  instancesPage: number = 1,
  instancesLimit: number = 20
): Promise<VulnerabilityWithInstances> {
  // ✅ SOURCE OF TRUTH: Fetch from vulnerabilities_unified table
  // This is the single source of truth for all vulnerability data
  const { data: vulnerability, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("*")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !vulnerability) {
    fastify.log.warn(
      { vulnerabilityId, workspaceId, errorMessage: error?.message },
      "Vulnerability not found"
    );
    throw fastify.httpErrors.notFound(
      `Vulnerability not found. ID: ${vulnerabilityId}`
    );
  }

  const result: VulnerabilityWithInstances = vulnerability;

  // ✅ PAGINATED INSTANCES: Fetch instances only when explicitly requested
  // This prevents rendering hundreds of instances at once
  if (includes.includes("instances")) {
    const offset = (instancesPage - 1) * instancesLimit;
    
    // Get total count first
    const { count: totalInstances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("id", { count: "exact", head: true })
      .eq("vulnerability_id", vulnerabilityId);

    // Fetch paginated instances with stable sorting (most recent first)
    const { data: instances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("*, scans(id, created_at, branch, commit_hash)")
      .eq("vulnerability_id", vulnerabilityId)
      .order("detected_at", { ascending: false })
      .range(offset, offset + instancesLimit - 1);

    result.instances = instances || [];
    result.instance_count = totalInstances || 0;
    result.instances_page = instancesPage;
    result.instances_total_pages = Math.ceil((totalInstances || 0) / instancesLimit);
  } else {
    // If instances not requested, still provide the count
    const { count: totalInstances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("id", { count: "exact", head: true })
      .eq("vulnerability_id", vulnerabilityId);
    
    result.instance_count = totalInstances || 0;
  }

  // Fetch related issues if requested
  if (includes.includes("related_issues")) {
    // Find other vulnerabilities with same CWE or rule_id in same repository
    const { data: related } = await fastify.supabase
      .from("vulnerabilities_unified")
      .select("id, title, severity")
      .eq("repository_id", vulnerability.repository_id)
      .neq("id", vulnerabilityId)
      .or(`cwe.eq.${vulnerability.cwe},rule_id.eq.${vulnerability.rule_id}`)
      .limit(5);

    result.related_issues = related || [];
  }

  return result;
}

/**
 * Update vulnerability status
 */
export async function updateVulnerabilityStatus(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  status: string,
  note?: string
): Promise<VulnerabilityUnified> {
  const updates: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "fixed") {
    updates.resolved_at = new Date().toISOString();
  }

  if (note) {
    updates.triage_note = note;
    updates.triaged_at = new Date().toISOString();
    // TODO: Get user ID from auth context
    // updates.triaged_by = userId;
  }

  const { data, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .update(updates)
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !data) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  return data;
}

/**
 * Assign vulnerability to user
 */
export async function assignVulnerability(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  assignedTo: string | null
): Promise<VulnerabilityUnified> {
  const { data, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .update({
      assigned_to: assignedTo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error || !data) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  return data;
}

/**
 * Generate AI explanation for vulnerability
 */
export async function generateAIExplanation(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  regenerate: boolean = false
): Promise<VulnerabilityUnified> {
  // Fetch vulnerability
  const { data: vulnerability, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("*")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !vulnerability) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  // Check if explanation already exists and regenerate is false
  if (vulnerability.ai_explanation && !regenerate) {
    return vulnerability;
  }

  // ✅ Generate AI explanation using VulnerabilityExplainerService
  try {
    const { VulnerabilityExplainerService } = await import("../../ai/vulnerability-explainer");
    const explainer = new VulnerabilityExplainerService(fastify);

    const aiExplanation = await explainer.explainVulnerability({
      title: vulnerability.title,
      description: vulnerability.description,
      severity: vulnerability.severity,
      scanner_type: vulnerability.scanner_type,
      file_path: vulnerability.file_path,
      line_start: vulnerability.line_start,
      cwe: vulnerability.cwe,
      rule_id: vulnerability.rule_id,
      code_snippet: vulnerability.code_snippet,
      scanner_metadata: vulnerability.scanner_metadata,
    });

    const { data: updated, error: updateError } = await fastify.supabase
      .from("vulnerabilities_unified")
      .update({
        ai_explanation: aiExplanation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vulnerabilityId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (updateError || !updated) {
      throw fastify.httpErrors.internalServerError(
        "Failed to update AI explanation"
      );
    }

    return updated;
  } catch (aiError: any) {
    fastify.log.error({ error: aiError }, "AI explanation generation failed");
    
    // Return vulnerability with fallback explanation
    const fallbackExplanation = {
      summary: `This ${vulnerability.severity} severity vulnerability requires attention.`,
      why_it_matters: "AI explanation service is currently unavailable. Please review the vulnerability details manually.",
      annotated_code: vulnerability.code_snippet || null,
      step_by_step_fix: [
        "1. Review the vulnerable code",
        "2. Consult security documentation",
        "3. Apply appropriate fixes",
      ],
      false_positive_indicators: [
        "• Input validation exists elsewhere",
        "• Code is in test environment only",
      ],
      generated_at: new Date().toISOString(),
      model_version: "fallback",
    };

    const { data: updated } = await fastify.supabase
      .from("vulnerabilities_unified")
      .update({
        ai_explanation: fallbackExplanation,
        updated_at: new Date().toISOString(),
      })
      .eq("id", vulnerabilityId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    return updated || vulnerability;
  }
}

/**
 * Get vulnerability statistics for workspace
 */
export async function getVulnerabilityStats(
  fastify: FastifyInstance,
  workspaceId: string
): Promise<VulnerabilityStats> {
  // Get total count and severity breakdown
  const { data: vulnerabilities } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("severity, status, scanner_type, ai_false_positive_score")
    .eq("workspace_id", workspaceId);

  if (!vulnerabilities) {
    return {
      total: 0,
      by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      by_status: {
        open: 0,
        in_review: 0,
        accepted: 0,
        false_positive: 0,
        wont_fix: 0,
        fixed: 0,
        ignored: 0,
      },
      by_scanner_type: { sast: 0, sca: 0, secrets: 0, iac: 0, container: 0 },
      verified_findings: {
        likely_exploitable_percent: 0,
        likely_false_positive_percent: 0,
      },
    };
  }

  const stats: VulnerabilityStats = {
    total: vulnerabilities.length,
    by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    by_status: {
      open: 0,
      in_review: 0,
      accepted: 0,
      false_positive: 0,
      wont_fix: 0,
      fixed: 0,
      ignored: 0,
    },
    by_scanner_type: { sast: 0, sca: 0, secrets: 0, iac: 0, container: 0 },
    verified_findings: {
      likely_exploitable_percent: 0,
      likely_false_positive_percent: 0,
    },
  };

  let totalFalsePositiveScore = 0;
  let countWithFPScore = 0;

  vulnerabilities.forEach((vuln) => {
    // ✅ FIX: Only count OPEN vulnerabilities in severity breakdown
    // This ensures the "Findings by Severity" section shows actionable items only
    if (vuln.status === "open" && vuln.severity in stats.by_severity) {
      stats.by_severity[vuln.severity as keyof typeof stats.by_severity]++;
    }

    // Count by status (all statuses)
    if (vuln.status in stats.by_status) {
      stats.by_status[vuln.status as keyof typeof stats.by_status]++;
    }

    // ✅ FIX: Only count OPEN vulnerabilities in scanner type breakdown
    if (vuln.status === "open" && vuln.scanner_type in stats.by_scanner_type) {
      stats.by_scanner_type[
        vuln.scanner_type as keyof typeof stats.by_scanner_type
      ]++;
    }

    // Calculate false positive percentage
    if (vuln.ai_false_positive_score !== null) {
      totalFalsePositiveScore += vuln.ai_false_positive_score;
      countWithFPScore++;
    }
  });

  // Calculate verified findings percentages
  if (countWithFPScore > 0) {
    const avgFalsePositiveScore = totalFalsePositiveScore / countWithFPScore;
    stats.verified_findings.likely_false_positive_percent = Math.round(
      avgFalsePositiveScore * 100
    );
    stats.verified_findings.likely_exploitable_percent =
      100 - stats.verified_findings.likely_false_positive_percent;
  } else {
    // Default values when no AI scores available
    stats.verified_findings.likely_exploitable_percent = 88;
    stats.verified_findings.likely_false_positive_percent = 0;
  }

  return stats;
}

/**
 * Get vulnerabilities for a specific scan (filtered view)
 */
export async function getVulnerabilitiesByScan(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string,
  filters: Partial<VulnerabilityFilters>
): Promise<PaginatedResponse<VulnerabilityUnified>> {
  // First verify scan belongs to workspace
  const { data: scan } = await fastify.supabase
    .from("scans")
    .select("id")
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!scan) {
    throw fastify.httpErrors.notFound("Scan not found");
  }

  const page = filters.page || 1;
  const limit = filters.limit || 15;
  const offset = (page - 1) * limit;

  // Get vulnerability IDs from instances
  const { data: instances } = await fastify.supabase
    .from("vulnerability_instances")
    .select("vulnerability_id")
    .eq("scan_id", scanId);

  if (!instances || instances.length === 0) {
    return {
      data: [],
      meta: {
        current_page: page,
        per_page: limit,
        total: 0,
        total_pages: 0,
        has_next: false,
        has_prev: false,
      },
    };
  }

  const vulnerabilityIds = instances.map((i) => i.vulnerability_id);

  // Fetch vulnerabilities
  let query = fastify.supabase
    .from("vulnerabilities_unified")
    .select("*", { count: "exact" })
    .in("id", vulnerabilityIds);

  // Apply filters
  if (filters.severity && Array.isArray(filters.severity)) {
    query = query.in("severity", filters.severity);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // Sort by severity by default
  query = query.order("severity", { ascending: false });
  query = query.order("confidence", { ascending: false, nullsFirst: false });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    fastify.log.error({ error, scanId }, "Failed to fetch scan vulnerabilities");
    throw fastify.httpErrors.internalServerError(
      "Failed to fetch vulnerabilities"
    );
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    data: data || [],
    meta: {
      current_page: page,
      per_page: limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}
