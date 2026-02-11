
import type { FastifyInstance } from "fastify";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import {
  requireAuth,
  requireProfile,
  requireWorkspace,
} from "../../middleware/gatekeepers";
import { resolveWorkspace } from "../../middleware/workspace";
import {
  listScansSchema,
  startScanSchema,
  getScanStatsSchema,
  getScanDetailsSchema,
  cancelScanSchema,
  exportScanResultsSchema,
} from "./schemas";
import {
  listScansController,
  startScanController,
  getScanStatsController,
  getScanDetailsController,
  cancelScanController,
  exportScanResultsController,
} from "./controller";

export async function scansRoutes(fastify: FastifyInstance) {
  // Apply workspace context middleware to all routes in this context
  // Note: These hooks run SEQUENTIALLY
  fastify.addHook("preHandler", verifyAuth);
  fastify.addHook("preHandler", loadProfile);
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireProfile);
  fastify.addHook("preHandler", resolveWorkspace);
  fastify.addHook("preHandler", requireWorkspace);

  // GET /api/workspaces/:workspaceId/scans
  fastify.get(
    "/:workspaceId/scans",
    { schema: listScansSchema },
    (req, reply) => listScansController(fastify, req as any, reply)
  );

  // POST /api/workspaces/:workspaceId/scans
  fastify.post(
    "/:workspaceId/scans",
    { schema: startScanSchema },
    (req, reply) => startScanController(fastify, req as any, reply)
  );

  // GET /api/workspaces/:workspaceId/scans/stats
  fastify.get(
    "/:workspaceId/scans/stats",
    { schema: getScanStatsSchema },
    (req, reply) => getScanStatsController(fastify, req as any, reply)
  );

  // GET /api/workspaces/:workspaceId/scans/:scanId
  fastify.get(
    "/:workspaceId/scans/:scanId",
    { schema: getScanDetailsSchema },
    (req, reply) => getScanDetailsController(fastify, req as any, reply)
  );

  // POST /api/workspaces/:workspaceId/scans/:scanId/cancel
  fastify.post(
    "/:workspaceId/scans/:scanId/cancel",
    { schema: cancelScanSchema },
    (req, reply) => cancelScanController(fastify, req as any, reply)
  );

  // GET /api/workspaces/:workspaceId/scans/:scanId/export
  fastify.get(
    "/:workspaceId/scans/:scanId/export",
    { schema: exportScanResultsSchema },
    (req, reply) => exportScanResultsController(fastify, req as any, reply)
  );
}
