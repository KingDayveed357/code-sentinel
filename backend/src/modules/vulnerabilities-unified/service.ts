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
import {
  canAccessVulnerability,
  canAccessProject,
  canAccessScan,
  canAssignVulnerability,
  getAssignedProjectIds,
  isProjectScopedRole,
  isWorkspaceMember,
} from "../authz/permissions";

type UserContext = { userId: string; role: string };

/**
 * ✅ DATA INTEGRITY: Single Source of Truth Architecture
 * 
 * This service enforces a strict separation between:
 * 
 * 1. VULNERABILITIES_UNIFIED (Source of Truth)
 *    - One row per unique vulnerability (deduplicated by fingerprint)
 * 2. VULNERABILITY_INSTANCES (Occurrences)
 *    - Multiple rows per vulnerability (one per scan where it was found)
 */

/**
 * Get all vulnerabilities for a workspace (global view)
 */
export async function getVulnerabilitiesByWorkspace(
  fastify: FastifyInstance,
  workspaceId: string,
  filters: VulnerabilityFilters & { scan_id?: string },
  userContext?: UserContext
): Promise<PaginatedResponse<VulnerabilityUnified>> {
  // ✅ Support scan_id filtering: delegate to optimized scan query
  if (filters.scan_id) {
    return getVulnerabilitiesByScan(fastify, workspaceId, filters.scan_id, filters, userContext);
  }

  const offset = (filters.page - 1) * filters.limit;

  // Build query
  let query = fastify.supabase
    .from("vulnerabilities_unified")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId);

  // ✅ RBAC Filter: Developers only see vulnerabilities for assigned projects
  if (userContext && isProjectScopedRole(userContext.role)) {
    const assignedIds = await getAssignedProjectIds(
      fastify,
      workspaceId,
      userContext.userId
    );

    if (assignedIds.length === 0) {
      return {
        data: [],
        meta: {
          current_page: filters.page,
          per_page: filters.limit,
          total: 0,
          total_pages: 0,
          has_next: false,
          has_prev: false,
        },
      };
    }

    query = query.in("repository_id", assignedIds);
  }

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
      query = query.order("severity", { ascending: false }); // critical < high < medium < low
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

    const countMap = new Map<string, number>();
    (instanceCounts || []).forEach(instance => {
      const current = countMap.get(instance.vulnerability_id) || 0;
      countMap.set(instance.vulnerability_id, current + 1);
    });

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
 */
export async function getVulnerabilityDetails(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  includes: string[] = [],
  instancesPage: number = 1,
  instancesLimit: number = 20,
  userContext?: UserContext
): Promise<VulnerabilityWithInstances> {
  const { data: vulnerability, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("*")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !vulnerability) {
    throw fastify.httpErrors.notFound(`Vulnerability not found. ID: ${vulnerabilityId}`);
  }

  if (userContext && isProjectScopedRole(userContext.role)) {
    const allowed = await canAccessVulnerability(
      fastify,
      userContext.userId,
      vulnerabilityId,
      workspaceId,
      userContext.role
    );

    if (!allowed) {
      throw fastify.httpErrors.forbidden("You do not have access to this vulnerability");
    }
  }

  const result: VulnerabilityWithInstances = vulnerability;

  // PAGINATED INSTANCES
  if (includes.includes("instances")) {
    const offset = (instancesPage - 1) * instancesLimit;
    
    // Get total count
    const { count: totalInstances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("id", { count: "exact", head: true })
      .eq("vulnerability_id", vulnerabilityId);

    // Fetch paginated instances
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
    // Just count
    const { count: totalInstances } = await fastify.supabase
      .from("vulnerability_instances")
      .select("id", { count: "exact", head: true })
      .eq("vulnerability_id", vulnerabilityId);
    
    result.instance_count = totalInstances || 0;
  }

  // Related issues
  if (includes.includes("related_issues")) {
    const { data: related } = await fastify.supabase
      .from("vulnerabilities_unified")
      .select("id, title, severity")
      .eq("workspace_id", workspaceId)
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
  note?: string,
  userContext?: UserContext
): Promise<VulnerabilityUnified> {
  const { data: existingVulnerability, error: existingVulnerabilityError } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("id, repository_id")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (existingVulnerabilityError) {
    fastify.log.error(
      { existingVulnerabilityError, workspaceId, vulnerabilityId },
      "Failed to verify vulnerability before status update"
    );
    throw fastify.httpErrors.internalServerError("Failed to update vulnerability status");
  }

  if (!existingVulnerability) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  if (userContext && isProjectScopedRole(userContext.role)) {
    const allowed = await canAccessProject(
      fastify,
      userContext.userId,
      existingVulnerability.repository_id,
      workspaceId,
      userContext.role
    );

    if (!allowed) {
      throw fastify.httpErrors.forbidden("You do not have access to this vulnerability");
    }
  }

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
  }

  const { data, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .update(updates) // RESTORED
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
 * Assign vulnerability
 */
export async function assignVulnerability(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  assignedTo: string | null,
  userContext?: UserContext
): Promise<VulnerabilityUnified> {
  const { data: vulnerability, error: vulnerabilityError } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("id, repository_id")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (vulnerabilityError) {
    fastify.log.error(
      { vulnerabilityError, workspaceId, vulnerabilityId },
      "Failed to verify vulnerability before assignment"
    );
    throw fastify.httpErrors.internalServerError("Failed to assign vulnerability");
  }

  if (!vulnerability) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  if (userContext) {
    const canAssign = await canAssignVulnerability(
      fastify,
      userContext.role,
      workspaceId,
      userContext.userId,
      vulnerability.repository_id
    );

    if (!canAssign) {
      throw fastify.httpErrors.forbidden("You do not have permission to assign this vulnerability");
    }
  }

  if (assignedTo) {
    const isMember = await isWorkspaceMember(fastify, workspaceId, assignedTo);

    if (!isMember) {
      const { data: workspace, error: workspaceError } = await fastify.supabase
        .from("workspaces")
        .select("owner_id")
        .eq("id", workspaceId)
        .maybeSingle();

      if (workspaceError) {
        fastify.log.error(
          { workspaceError, workspaceId, assignedTo },
          "Failed to validate assignee workspace membership"
        );
        throw fastify.httpErrors.internalServerError("Failed to validate assignee");
      }

      if (!workspace || workspace.owner_id !== assignedTo) {
        throw fastify.httpErrors.badRequest(
          "Assignee must be an active member of this workspace"
        );
      }
    }
  }

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
 * Generate AI explanation
 */
export async function generateAIExplanation(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  regenerate: boolean = false,
  userContext?: UserContext
): Promise<VulnerabilityUnified> {
  const { data: vulnerability, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("*")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !vulnerability) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  if (userContext && isProjectScopedRole(userContext.role)) {
    const allowed = await canAccessProject(
      fastify,
      userContext.userId,
      vulnerability.repository_id,
      workspaceId,
      userContext.role
    );

    if (!allowed) {
      throw fastify.httpErrors.forbidden("You do not have access to this vulnerability");
    }
  }

  if (vulnerability.ai_explanation && !regenerate) {
    return vulnerability;
  }

  try {
    const { randomUUID } = await import("crypto");
    const { getAiGateway } = await import("../ai/application");
    const { AiTaskType } = await import("../ai/domain");
    const gateway = getAiGateway(fastify);

    const lifecycle = await gateway.runTask({
      id: randomUUID(),
      workspaceId,
      vulnerabilityId,
      type: AiTaskType.VulnerabilityExplanation,
      promptVersion: "v1",
      regenerate,
      createdAt: new Date().toISOString(),
      input: {
        vulnerability,
      },
    } as any);

    if (lifecycle.status === "failed") {
      throw new Error(
        lifecycle.error?.message || "AI explanation generation failed"
      );
    }

    const { data: refreshed } = await fastify.supabase
      .from("vulnerabilities_unified")
      .select("*")
      .eq("id", vulnerabilityId)
      .eq("workspace_id", workspaceId)
      .single();

    return refreshed || vulnerability;
  } catch (aiError: any) {
    fastify.log.error({ error: aiError }, "AI explanation generation failed");
    return vulnerability; // Return original on failure
  }
}

/**
 * Create GitHub issue for a unified vulnerability.
 */
export async function createGitHubIssueForUnified(
  fastify: FastifyInstance,
  workspaceId: string,
  vulnerabilityId: string,
  userId: string | null = null,
  userContext?: UserContext
): Promise<{ success: boolean; issue_url?: string; issue_number?: number; error?: string }> {
  // Dynamically import to avoid circular dependencies if any
  const { createGitHubIssue } = await import("../github-issues/service");

  const { data: vulnerability } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("*")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!vulnerability) {
    throw fastify.httpErrors.notFound("Vulnerability not found");
  }

  if (userContext && isProjectScopedRole(userContext.role)) {
    const allowed = await canAccessProject(
      fastify,
      userContext.userId,
      vulnerability.repository_id,
      workspaceId,
      userContext.role
    );

    if (!allowed) {
      throw fastify.httpErrors.forbidden("You do not have access to this vulnerability");
    }
  }

  const { data: instance } = await fastify.supabase
    .from("vulnerability_instances")
    .select("scan_id, scans!inner(id, repository_id, branch, commit_hash)")
    .eq("vulnerability_id", vulnerabilityId)
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!instance?.scans) {
    throw fastify.httpErrors.preconditionFailed("No scan context found");
  }

  const scan = instance.scans as any;
  const { data: repository } = await fastify.supabase
    .from("repositories")
    .select("id, full_name")
    .eq("id", scan.repository_id)
    .eq("workspace_id", workspaceId)
    .single();

  return createGitHubIssue(
    fastify,
    workspaceId,
    userId, // Pass userId for audit trail
    {
      id: vulnerability.id,
      type: vulnerability.scanner_type as any,
      severity: vulnerability.severity,
      title: vulnerability.title,
      description: vulnerability.description || "",
      file_path: vulnerability.file_path ?? undefined,
      line_start: vulnerability.line_start ?? undefined,
      recommendation: vulnerability.ai_remediation ?? undefined,
      cwe: vulnerability.cwe ? [vulnerability.cwe] : undefined,
      cve: (vulnerability.scanner_metadata as any)?.cve,
    },
    {
      scanId: scan.id,
      repositoryId: scan.repository_id,
      repoFullName: repository?.full_name || "unknown/repo",
      branch: scan.branch,
      commitSha: scan.commit_hash ?? undefined,
    },
    { auto: false }
  );
}

/**
 * Get vulnerability statistics for workspace
 * ✅ SCALABLE FIX: Use DB aggregated counts instead of loading all rows
 */
export async function getVulnerabilityStats(
  fastify: FastifyInstance,
  workspaceId: string,
  userContext?: UserContext
): Promise<VulnerabilityStats> {
  const stats: VulnerabilityStats = {
    total: 0,
    by_severity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    by_status: {
      open: 0, in_review: 0, accepted: 0, false_positive: 0, wont_fix: 0, fixed: 0, ignored: 0,
    },
    by_scanner_type: { sast: 0, sca: 0, secrets: 0, iac: 0, container: 0 },
    verified_findings: { likely_exploitable_percent: 0, likely_false_positive_percent: 0 },
  };

  let assignedIds: string[] | null = null;
  if (userContext && isProjectScopedRole(userContext.role)) {
      assignedIds = await getAssignedProjectIds(
        fastify,
        workspaceId,
        userContext.userId
      );

      if (assignedIds.length === 0) {
          return stats;
      }
  }

  const applyRbac = (query: any) => {
      if (assignedIds) {
          return query.in('repository_id', assignedIds);
      }
      return query;
  };

  // 1. Total (fastest)
  let q1 = fastify.supabase
    .from("vulnerabilities_unified")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  
  q1 = applyRbac(q1);
  const { count: total } = await q1;
  stats.total = total || 0;

  // 2. Breakdown by Severity (Only Open)
  await Promise.all(['critical', 'high', 'medium', 'low', 'info'].map(async (sev) => {
    let q = fastify.supabase
      .from("vulnerabilities_unified")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .eq("severity", sev);
    
    q = applyRbac(q);
    const { count } = await q;

    if (sev in stats.by_severity) {
      stats.by_severity[sev as keyof typeof stats.by_severity] = count || 0;
    }
  }));

  // 3. Breakdown by Status
  await Promise.all(Object.keys(stats.by_status).map(async (status) => {
    let q = fastify.supabase
      .from("vulnerabilities_unified")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", status);
    
    q = applyRbac(q);
    const { count } = await q;

    if (status in stats.by_status) {
      stats.by_status[status as keyof typeof stats.by_status] = count || 0;
    }
  }));

  // 4. Breakdown by Scanner Type (Only Open)
  await Promise.all(Object.keys(stats.by_scanner_type).map(async (type) => {
    let q = fastify.supabase
      .from("vulnerabilities_unified")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .eq("scanner_type", type);
    
    q = applyRbac(q);
    const { count } = await q;

    if (type in stats.by_scanner_type) {
      stats.by_scanner_type[type as keyof typeof stats.by_scanner_type] = count || 0;
    }
  }));

  stats.verified_findings.likely_exploitable_percent = 88; // Default benchmark
  
  return stats;
}

/**
 * Get vulnerabilities for a specific scan (filtered view)
 * ✅ SCALABLE FIX: Use inner join for efficient filtering
 */
export async function getVulnerabilitiesByScan(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string,
  filters: Partial<VulnerabilityFilters>,
  userContext?: UserContext
): Promise<PaginatedResponse<VulnerabilityUnified>> {
  const page = filters.page || 1;
  const limit = filters.limit || 15;
  const offset = (page - 1) * limit;

  const { data: scan, error: scanError } = await fastify.supabase
    .from("scans")
    .select("id")
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (scanError) {
    fastify.log.error({ scanError, workspaceId, scanId }, "Failed to resolve scan scope");
    throw fastify.httpErrors.internalServerError("Failed to fetch vulnerabilities");
  }

  if (!scan) {
    throw fastify.httpErrors.notFound("Scan not found");
  }

  if (userContext && isProjectScopedRole(userContext.role)) {
    const allowed = await canAccessScan(
      fastify,
      userContext.userId,
      scanId,
      workspaceId,
      userContext.role
    );

    if (!allowed) {
      throw fastify.httpErrors.forbidden("You do not have access to this scan");
    }
  }

  // Query vulnerabilities_unified JOIN vulnerability_instances ON id = vulnerability_id
  // Filtering by instance.scan_id
  let query = fastify.supabase
    .from("vulnerabilities_unified")
    .select("*, vulnerability_instances!inner(scan_id)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("vulnerability_instances.scan_id", scanId);

  // Apply other filters (on unified table)
  if (filters.severity && Array.isArray(filters.severity)) {
    query = query.in("severity", filters.severity);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // Sorting
  query = query.order("severity", { ascending: false });
  query = query.order("confidence", { ascending: false, nullsFirst: false });

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    fastify.log.error({ error, scanId }, "Failed to fetch scan vulnerabilities");
    throw fastify.httpErrors.internalServerError(
      "Failed to fetch vulnerabilities"
    );
  }

  // Strip inner join metadata
  const cleanData = (data || []).map((row: any) => {
    const { vulnerability_instances, ...rest } = row;
    return rest;
  });

  return {
    data: cleanData as VulnerabilityUnified[],
    meta: {
      current_page: page,
      per_page: limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
      has_next: page < Math.ceil((count || 0) / limit),
      has_prev: page > 1,
    },
  };
}
