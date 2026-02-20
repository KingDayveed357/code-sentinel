import type { FastifyInstance } from "fastify";

export type WorkspaceRole = "owner" | "admin" | "developer" | "viewer";

const ADMIN_ROLES = new Set<WorkspaceRole>(["owner", "admin"]);
const PROJECT_SCOPED_ROLES = new Set<WorkspaceRole>(["developer", "viewer"]);

export function normalizeWorkspaceRole(role?: string | null): WorkspaceRole {
  if (role === "owner" || role === "admin" || role === "developer" || role === "viewer") {
    return role;
  }
  return "viewer";
}

export function canImportRepos(role?: string | null): boolean {
  return ADMIN_ROLES.has(normalizeWorkspaceRole(role));
}

export function canManageWorkspace(role?: string | null): boolean {
  return ADMIN_ROLES.has(normalizeWorkspaceRole(role));
}

export function isProjectScopedRole(role?: string | null): boolean {
  return PROJECT_SCOPED_ROLES.has(normalizeWorkspaceRole(role));
}

export async function getAssignedProjectIds(
  fastify: FastifyInstance,
  workspaceId: string,
  userId: string
): Promise<string[]> {
  const { data, error } = await fastify.supabase
    .from("project_members")
    .select("project_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
    fastify.log.error({ error, workspaceId, userId }, "Failed to resolve project assignments");
    throw fastify.httpErrors.internalServerError("Failed to resolve project assignments");
  }

  return (data || []).map((row) => row.project_id);
}

export async function canAccessProject(
  fastify: FastifyInstance,
  userId: string,
  projectId: string,
  workspaceId: string,
  role?: string | null
): Promise<boolean> {
  if (!isProjectScopedRole(role)) {
    return true;
  }

  const { data, error } = await fastify.supabase
    .from("project_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    fastify.log.error(
      { error, workspaceId, userId, projectId },
      "Failed to verify project access"
    );
    throw fastify.httpErrors.internalServerError("Failed to verify project access");
  }

  return Boolean(data);
}

export async function canAccessScan(
  fastify: FastifyInstance,
  userId: string,
  scanId: string,
  workspaceId: string,
  role?: string | null
): Promise<boolean> {
  const { data: scan, error } = await fastify.supabase
    .from("scans")
    .select("id, repository_id")
    .eq("id", scanId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    fastify.log.error({ error, workspaceId, userId, scanId }, "Failed to verify scan access");
    throw fastify.httpErrors.internalServerError("Failed to verify scan access");
  }

  if (!scan) {
    return false;
  }

  return canAccessProject(fastify, userId, scan.repository_id, workspaceId, role);
}

export async function canAccessVulnerability(
  fastify: FastifyInstance,
  userId: string,
  vulnerabilityId: string,
  workspaceId: string,
  role?: string | null
): Promise<boolean> {
  const { data: vulnerability, error } = await fastify.supabase
    .from("vulnerabilities_unified")
    .select("id, repository_id")
    .eq("id", vulnerabilityId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    fastify.log.error(
      { error, workspaceId, userId, vulnerabilityId },
      "Failed to verify vulnerability access"
    );
    throw fastify.httpErrors.internalServerError("Failed to verify vulnerability access");
  }

  if (!vulnerability) {
    return false;
  }

  return canAccessProject(
    fastify,
    userId,
    vulnerability.repository_id,
    workspaceId,
    role
  );
}

export async function canAssignVulnerability(
  fastify: FastifyInstance,
  role: string | null | undefined,
  workspaceId: string,
  userId: string,
  projectId: string
): Promise<boolean> {
  const normalizedRole = normalizeWorkspaceRole(role);

  if (normalizedRole === "viewer") {
    return false;
  }

  if (ADMIN_ROLES.has(normalizedRole)) {
    return true;
  }

  return canAccessProject(fastify, userId, projectId, workspaceId, normalizedRole);
}

export async function isWorkspaceMember(
  fastify: FastifyInstance,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await fastify.supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    fastify.log.error({ error, workspaceId, userId }, "Failed to verify workspace member");
    throw fastify.httpErrors.internalServerError("Failed to verify workspace member");
  }

  return Boolean(data);
}
