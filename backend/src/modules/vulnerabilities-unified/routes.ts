// src/modules/vulnerabilities-unified/routes.ts
// API routes for unified vulnerabilities

import type { FastifyInstance } from "fastify";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { resolveWorkspace } from "../../middleware/workspace";
import {
  requireAuth,
  requireProfile,
  requireWorkspace,
} from "../../middleware/gatekeepers";
import {
  getVulnerabilitiesByWorkspace,
  getVulnerabilityDetails,
  updateVulnerabilityStatus,
  assignVulnerability,
  generateAIExplanation,
  getVulnerabilityStats,
  createGitHubIssueForUnified,
} from "./service";
import {
  listVulnerabilitiesSchema,
  getVulnerabilityStatsSchema,
  getVulnerabilityDetailsSchema,
  updateVulnerabilityStatusSchema,
  assignVulnerabilitySchema,
  generateAIExplanationSchema,
  createGitHubIssueSchema
} from "./schemas";

export async function vulnerabilitiesUnifiedRoutes(fastify: FastifyInstance) {
  // Apply workspace security middleware stack
  fastify.addHook("preHandler", verifyAuth);
  fastify.addHook("preHandler", loadProfile);
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireProfile);
  fastify.addHook("preHandler", resolveWorkspace);
  fastify.addHook("preHandler", requireWorkspace);

  // GET /api/workspaces/:workspaceId/vulnerabilities
  fastify.get(
    "/:workspaceId/vulnerabilities",
    { schema: listVulnerabilitiesSchema },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const filters = request.query as any;

      const result = await getVulnerabilitiesByWorkspace(
        fastify,
        workspaceId,
        filters
      );

      return reply.send(result);
    }
  );

  // GET /api/workspaces/:workspaceId/vulnerabilities/stats
  fastify.get(
    "/:workspaceId/vulnerabilities/stats",
    { schema: getVulnerabilityStatsSchema },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      const stats = await getVulnerabilityStats(fastify, workspaceId);

      return reply.send(stats);
    }
  );

  // GET /api/workspaces/:workspaceId/vulnerabilities/:vulnId
  fastify.get(
    "/:workspaceId/vulnerabilities/:vulnId",
    { schema: getVulnerabilityDetailsSchema },
    async (request, reply) => {
      const { workspaceId, vulnId } = request.params as {
        workspaceId: string;
        vulnId: string;
      };
      const { include, instances_page, instances_limit } = request.query as { 
        include?: string | string[]; 
        instances_page?: string;
        instances_limit?: string;
      };

      // Normalize include to array
      const includeArray = Array.isArray(include) ? include : include ? [include] : [];

      // Parse pagination parameters with defaults
      const page = instances_page ? parseInt(instances_page, 10) : 1;
      const limit = instances_limit ? parseInt(instances_limit, 10) : 20;

      const vulnerability = await getVulnerabilityDetails(
        fastify,
        workspaceId,
        vulnId,
        includeArray,
        page,
        limit
      );

      return reply.send(vulnerability);
    }
  );

  // PATCH /api/workspaces/:workspaceId/vulnerabilities/:vulnId/status
  fastify.patch(
    "/:workspaceId/vulnerabilities/:vulnId/status",
    { schema: updateVulnerabilityStatusSchema },
    async (request, reply) => {
      const { workspaceId, vulnId } = request.params as {
        workspaceId: string;
        vulnId: string;
      };
      const { status, note } = request.body as { status: string; note?: string };

      const updated = await updateVulnerabilityStatus(
        fastify,
        workspaceId,
        vulnId,
        status,
        note
      );

      return reply.send(updated);
    }
  );

  // PATCH /api/workspaces/:workspaceId/vulnerabilities/:vulnId/assign
  fastify.patch(
    "/:workspaceId/vulnerabilities/:vulnId/assign",
    { schema: assignVulnerabilitySchema },
    async (request, reply) => {
      const { workspaceId, vulnId } = request.params as {
        workspaceId: string;
        vulnId: string;
      };
      const { assigned_to } = request.body as { assigned_to: string | null };

      const updated = await assignVulnerability(
        fastify,
        workspaceId,
        vulnId,
        assigned_to
      );

      return reply.send(updated);
    }
  );

  // POST /api/workspaces/:workspaceId/vulnerabilities/:vulnId/ai-explain
  fastify.post(
    "/:workspaceId/vulnerabilities/:vulnId/ai-explain",
    { schema: generateAIExplanationSchema },
    async (request, reply) => {
      const { workspaceId, vulnId } = request.params as {
        workspaceId: string;
        vulnId: string;
      };
      const { regenerate } = request.body as { regenerate?: boolean };

      const updated = await generateAIExplanation(
        fastify,
        workspaceId,
        vulnId,
        regenerate || false
      );

      return reply.send(updated);
    }
  );

  // POST /api/workspaces/:workspaceId/vulnerabilities/:vulnId/create-issue
  fastify.post(
    "/:workspaceId/vulnerabilities/:vulnId/create-issue",
    { schema: createGitHubIssueSchema },
    async (request, reply) => {
      const { workspaceId, vulnId } = request.params as {
        workspaceId: string;
        vulnId: string;
      };

      // Get user ID from authenticated request for audit trail
      const user = request.supabaseUser;

      const result = await createGitHubIssueForUnified(
        fastify,
        workspaceId,
        vulnId,
        user?.id || null
      );

      return reply.send(result);
    }
  );
}
