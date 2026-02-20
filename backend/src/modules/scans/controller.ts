
import { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import { ScansService } from "./service";
import { ScansRepository } from "./repository";
import type { ScanFilters } from "./types";

// Helper to get service instance
const getService = (fastify: FastifyInstance) => {
  return new ScansService(new ScansRepository(fastify), fastify);
};

export async function listScansController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId } = request.params as { workspaceId: string };
  const filters = request.query as ScanFilters;
  const services = new ScansService(new ScansRepository(fastify), fastify);
  
  const userId = request.supabaseUser!.id;
  const userRole = request.workspaceRole!;
  
  const result = await services.getScans(workspaceId, filters, { userId, role: userRole });
  return reply.send(result);
}

export async function startScanController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId } = request.params as { workspaceId: string };
  const { repositoryId, branch, scanType } = request.body as { repositoryId: string; branch: string; scanType?: "quick" | "full" };

  const userId = request.supabaseUser?.id;

  if (!userId) {
    throw fastify.httpErrors.unauthorized("User context missing");
  }

  const services = new ScansService(new ScansRepository(fastify), fastify);
  const userRole = request.workspaceRole!;
  const result = await services.startScan(
    workspaceId,
    userId,
    userRole,
    repositoryId,
    branch,
    scanType || "quick"
  );
  return reply.send(result);
}

export async function getScanStatsController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId } = request.params as { workspaceId: string };
  const services = new ScansService(new ScansRepository(fastify), fastify);
  const userId = request.supabaseUser!.id;
  const userRole = request.workspaceRole!;
  const result = await services.getScanStats(workspaceId, { userId, role: userRole });
  return reply.send(result);
}

export async function getScanDetailsController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId, scanId } = request.params as { workspaceId: string; scanId: string };
  const services = new ScansService(new ScansRepository(fastify), fastify);
  const userId = request.supabaseUser!.id;
  const userRole = request.workspaceRole!;
  
  const result = await services.getScanDetails(workspaceId, scanId, { userId, role: userRole });
  return reply.send(result);
}

export async function cancelScanController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId, scanId } = request.params as { workspaceId: string; scanId: string };
  const services = new ScansService(new ScansRepository(fastify), fastify);
  const userId = request.supabaseUser!.id;
  const userRole = request.workspaceRole!;
  const result = await services.cancelScan(workspaceId, scanId, { userId, role: userRole });
  return reply.send(result);
}

export async function exportScanResultsController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId, scanId } = request.params as { workspaceId: string; scanId: string };
  const { format } = request.query as { format: "json" | "csv" };
  const services = new ScansService(new ScansRepository(fastify), fastify);
  const userId = request.supabaseUser!.id;
  const userRole = request.workspaceRole!;

  const result = await services.exportScanResults(workspaceId, scanId, format, {
    userId,
    role: userRole,
  });
  
  if (format === "csv") {
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename="scan-${scanId}.csv"`);
    return reply.send(result);
  }

  return reply.send(result);
}
