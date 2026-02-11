// src/modules/workspaces/routes.ts
import type { FastifyInstance } from "fastify";
import { WorkspaceController } from "./controller";
import { WorkspaceService } from "./service";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { 
  requireAuth, 
  requireProfile, 
  requireOnboardingCompleted, 
  requireWorkspace 
} from "../../middleware/gatekeepers";
import { resolveWorkspace } from "../../middleware/workspace";

// Sub-module routes
import repositoriesWorkspaceRoutes from "../repositories/routes";
import { scansRoutes } from "../scans";
import { vulnerabilitiesUnifiedRoutes } from "../vulnerabilities-unified/routes";
import { integrationsWorkspaceRoutes } from "../integrations/routes";
import entitlementsRoutes from "../entitlements/routes";

export default async function workspacesRoutes(fastify: FastifyInstance) {
  // Initialize controller
  const service = new WorkspaceService(fastify);
  const controller = new WorkspaceController(service);


  // =====================================================
  // Pre-handlers
  // =====================================================
  
  const basePreHandler = [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
  ];

  const workspacePreHandler = [
    ...basePreHandler,
    resolveWorkspace,
    requireWorkspace,
  ];

  // =====================================================
  // Workspace CRUD
  // =====================================================

  /**
   * GET /api/workspaces
   * List all workspaces accessible to the current user
   */
  fastify.get("/", { preHandler: basePreHandler }, (req, reply) =>
    controller.listWorkspaces(req, reply)
  );

  /**
   * POST /api/workspaces/bootstrap
   * Bootstrap workspace - creates personal workspace if needed
   */
  fastify.post("/bootstrap", { preHandler: basePreHandler }, async (req, reply) => {
    const userId = req.user!.id;
    const workspace = await service.bootstrapWorkspace(userId);
    return reply.send({ workspace });
  });

  /**
   * POST /api/workspaces
   * Create a new workspace
   */
  fastify.post("/", { preHandler: basePreHandler }, (req, reply) =>
    controller.createWorkspace(req as any, reply)
  );

  /**
   * GET /api/workspaces/:workspaceId
   * Get workspace details
   */
  fastify.get("/:workspaceId", { preHandler: workspacePreHandler }, (req, reply) =>
    controller.getWorkspace(req as any, reply)
  );

  /**
   * PATCH /api/workspaces/:workspaceId
   * Update workspace
   */
  fastify.patch("/:workspaceId", { preHandler: workspacePreHandler }, (req, reply) =>
    controller.updateWorkspace(req as any, reply)
  );

  /**
   * DELETE /api/workspaces/:workspaceId
   * Delete workspace
   */
  fastify.delete("/:workspaceId", { preHandler: workspacePreHandler }, (req, reply) =>
    controller.deleteWorkspace(req as any, reply)
  );

  // =====================================================
  // Members Management
  // =====================================================

  /**
   * GET /api/workspaces/:workspaceId/members
   * List members of a workspace
   */
  fastify.get(
    "/:workspaceId/members",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.getMembers(req as any, reply)
  );

  /**
   * DELETE /api/workspaces/:workspaceId/members/:memberId
   * Remove member from workspace
   */
  fastify.delete(
    "/:workspaceId/members/:memberId",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.removeMember(req as any, reply)
  );

  /**
   * PATCH /api/workspaces/:workspaceId/members/:memberId/role
   * Update member role
   */
  fastify.patch(
    "/:workspaceId/members/:memberId/role",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.updateMemberRole(req as any, reply)
  );

  // =====================================================
  // Invitations
  // =====================================================

  /**
   * GET /api/workspaces/:workspaceId/invitations
   * Get pending invitations for workspace
   */
  fastify.get(
    "/:workspaceId/invitations",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.getInvitations(req as any, reply)
  );

  /**
   * POST /api/workspaces/:workspaceId/invitations
   * Invite member to workspace
   */
  fastify.post(
    "/:workspaceId/invitations",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.inviteMember(req as any, reply)
  );

  /**
   * POST /api/workspaces/invitations/:token/accept
   * Accept workspace invitation (no workspace context required)
   */
  fastify.post(
    "/invitations/:token/accept",
    { preHandler: basePreHandler },
    (req, reply) => controller.acceptInvitation(req as any, reply)
  );

  /**
   * DELETE /api/workspaces/:workspaceId/invitations/:invitationId
   * Cancel invitation
   */
  fastify.delete(
    "/:workspaceId/invitations/:invitationId",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.cancelInvitation(req as any, reply)
  );

  // =====================================================
  // Activity Log
  // =====================================================

  /**
   * GET /api/workspaces/:workspaceId/activity
   * Get workspace activity log
   */
  fastify.get(
    "/:workspaceId/activity",
    { preHandler: workspacePreHandler },
    (req, reply) => controller.getActivity(req as any, reply)
  );

  // =====================================================
  // Nested Module Routes
  // =====================================================

  /**
   * Register workspace-scoped routes for sub-modules
   * These provide endpoints like:
   * - /api/workspaces/:workspaceId/repositories/*
   * - /api/workspaces/:workspaceId/scans/*
   * - /api/workspaces/:workspaceId/vulnerabilities/*
   * - /api/workspaces/:workspaceId/integrations/*
   * - /api/workspaces/:workspaceId/entitlements/*
   */
  fastify.register(repositoriesWorkspaceRoutes);
  fastify.register(scansRoutes);
  fastify.register(vulnerabilitiesUnifiedRoutes);
  fastify.register(integrationsWorkspaceRoutes);
  fastify.register(entitlementsRoutes);
}