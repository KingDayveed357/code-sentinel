// src/modules/scans/global-routes.ts
// API routes for workspace-level scan operations

import type { FastifyInstance } from "fastify";
import {
  getScansByWorkspace,
  getScanDetails,
  getScanStats,
} from "./global-service";

export async function scansGlobalRoutes(fastify: FastifyInstance) {
  // GET /api/workspaces/:workspaceId/scans
  // Get all scans for workspace (global view)
  fastify.get(
    "/:workspaceId/scans",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            workspaceId: { type: "string", format: "uuid" },
          },
          required: ["workspaceId"],
        },
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["pending", "running", "completed", "failed", "cancelled"],
            },
            repository_id: { type: "string", format: "uuid" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 15 },
            sort: {
              type: "string",
              enum: ["recent", "oldest", "duration"],
              default: "recent",
            },
          },
        },
        tags: ["scans-global"],
        summary: "Get all scans for workspace",
        description:
          "Retrieve scans across all projects in a workspace with pagination (15 items per page)",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      const filters = request.query as any;

      const result = await getScansByWorkspace(fastify, workspaceId, filters);

      return reply.send(result);
    }
  );

  // GET /api/workspaces/:workspaceId/scans/stats
  // Get scan statistics for workspace
  fastify.get(
    "/:workspaceId/scans/stats",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            workspaceId: { type: "string", format: "uuid" },
          },
          required: ["workspaceId"],
        },
        tags: ["scans-global"],
        summary: "Get scan statistics",
        description: "Get aggregated statistics for scans in a workspace",
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };

      const stats = await getScanStats(fastify, workspaceId);

      return reply.send(stats);
    }
  );

  // GET /api/workspaces/:workspaceId/scans/:scanId
  // Get single scan details with scanner breakdown
  fastify.get(
    "/:workspaceId/scans/:scanId",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            scanId: { type: "string", format: "uuid" },
          },
          required: ["workspaceId", "scanId"],
        },
        tags: ["scans-global"],
        summary: "Get scan details",
        description:
          "Get detailed information about a specific scan including scanner breakdown and top vulnerabilities",
      },
    },
    async (request, reply) => {
      const { workspaceId, scanId } = request.params as {
        workspaceId: string;
        scanId: string;
      };

      const scan = await getScanDetails(fastify, workspaceId, scanId);

      return reply.send(scan);
    }
  );
}
