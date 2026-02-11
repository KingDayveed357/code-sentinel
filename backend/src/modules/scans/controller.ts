
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
  
  const result = await services.getScans(workspaceId, filters);
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
  // Use workspace plan if available, otherwise fallback to user plan or Free
  const plan = request.workspace?.plan || request.profile?.plan || 'Free';

  if (!userId) {
    throw fastify.httpErrors.unauthorized("User context missing");
  }

  const services = new ScansService(new ScansRepository(fastify), fastify);
  const result = await services.startScan(
    workspaceId,
    userId,
    plan,
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
  const result = await services.getScanStats(workspaceId);
  return reply.send(result);
}

export async function getScanDetailsController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId, scanId } = request.params as { workspaceId: string; scanId: string };
  const services = new ScansService(new ScansRepository(fastify), fastify);
  const result = await services.getScanDetails(workspaceId, scanId);
  return reply.send(result);
}

export async function cancelScanController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { workspaceId, scanId } = request.params as { workspaceId: string; scanId: string };
  const services = new ScansService(new ScansRepository(fastify), fastify);
  const result = await services.cancelScan(workspaceId, scanId);
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

  const result = await services.exportScanResults(workspaceId, scanId, format);
  
  if (format === "csv") {
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", `attachment; filename="scan-${scanId}.csv"`);
    return reply.send(result);
  }

  return reply.send(result);
}
