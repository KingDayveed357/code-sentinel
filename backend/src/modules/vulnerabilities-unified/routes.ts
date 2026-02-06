// src/modules/vulnerabilities-unified/routes.ts
// API routes for unified vulnerabilities

import type { FastifyInstance } from "fastify";
import {
  getVulnerabilitiesByWorkspace,
  getVulnerabilityDetails,
  updateVulnerabilityStatus,
  assignVulnerability,
  generateAIExplanation,
  getVulnerabilityStats,
} from "./service";

export async function vulnerabilitiesUnifiedRoutes(fastify: FastifyInstance) {
  // GET /api/workspaces/:workspaceId/vulnerabilities
  // Get all vulnerabilities for workspace (global view)
  fastify.get(
    "/:workspaceId/vulnerabilities",
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
  // Get vulnerability statistics for workspace
  fastify.get(
    "/:workspaceId/vulnerabilities/stats",
    // {
    //   schema: {
    //     // params: workspaceIdSchema,
    //     tags: ["vulnerabilities-unified"],
    //     summary: "Get vulnerability statistics",
    //     description:
    //       "Get aggregated statistics for vulnerabilities in a workspace",
    //   },
    // },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      const stats = await getVulnerabilityStats(fastify, workspaceId);

      return reply.send(stats);
    }
  );

  // GET /api/workspaces/:workspaceId/vulnerabilities/:vulnId
  // Get single vulnerability details
  fastify.get(
    "/:workspaceId/vulnerabilities/:vulnId",
    // {
    //   schema: {
    //     params: workspaceIdSchema.merge(vulnerabilityIdSchema),
    //     querystring: vulnerabilityDetailQuerySchema,
    //     tags: ["vulnerabilities-unified"],
    //     summary: "Get vulnerability details",
    //     description:
    //       "Get detailed information about a specific vulnerability with optional includes (instances, ai_explanation, risk_context, related_issues)",
    //   },
    // },
    async (request, reply) => {
      const { workspaceId, vulnId } = request.params as {
        workspaceId: string;
        vulnId: string;
      };
      const { include, instances_page, instances_limit } = request.query as { 
        include?: string[]; 
        instances_page?: string;
        instances_limit?: string;
      };

      // Parse pagination parameters with defaults
      const page = instances_page ? parseInt(instances_page, 10) : 1;
      const limit = instances_limit ? parseInt(instances_limit, 10) : 20;

      const vulnerability = await getVulnerabilityDetails(
        fastify,
        workspaceId,
        vulnId,
        include || [],
        page,
        limit
      );

      return reply.send(vulnerability);
    }
  );

  // PATCH /api/workspaces/:workspaceId/vulnerabilities/:vulnId/status
  // Update vulnerability status
  fastify.patch(
    "/workspaces/:workspaceId/vulnerabilities/:vulnId/status",
    {
      // schema: {
      //   params: workspaceIdSchema.merge(vulnerabilityIdSchema),
      //   body: updateVulnerabilityStatusSchema,
      //   tags: ["vulnerabilities-unified"],
      //   summary: "Update vulnerability status",
      //   description:
      //     "Update the status of a vulnerability (open, in_review, fixed, false_positive, etc.)",
      // },
    },
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
  // Assign vulnerability to user
  fastify.patch(
    "/workspaces/:workspaceId/vulnerabilities/:vulnId/assign",
    // {
    //   schema: {
    //     params: workspaceIdSchema.merge(vulnerabilityIdSchema),
    //     body: assignVulnerabilitySchema,
    //     tags: ["vulnerabilities-unified"],
    //     summary: "Assign vulnerability",
    //     description: "Assign a vulnerability to a team member",
    //   },
    // },
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
  // Generate AI explanation
  fastify.post(
    "/workspaces/:workspaceId/vulnerabilities/:vulnId/ai-explain",
    // {
    //   schema: {
    //     params: workspaceIdSchema.merge(vulnerabilityIdSchema),
    //     body: generateAIExplanationSchema,
    //     tags: ["vulnerabilities-unified"],
    //     summary: "Generate AI explanation",
    //     description:
    //       "Generate or regenerate AI explanation for a vulnerability",
    //   },
    // },
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
}
