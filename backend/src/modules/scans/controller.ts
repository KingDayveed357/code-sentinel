// src/modules/scans/controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './service';
import {
  startScanSchema,
  scanHistorySchema,
  scanIdSchema,
  repoIdSchema,
} from './schemas';

export async function startScanController(
  request: FastifyRequest<{ Params: any; Body: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const userPlan = request.profile!.plan;
  const { repoId } = repoIdSchema.parse(request.params);
  const { branch, scan_type } = startScanSchema.parse(request.body);

  const result = await service.startScan(
    request.server,
    userId,
    userPlan,
    repoId,
    branch,
    scan_type
  );

  return reply.status(201).send(result);
}

export async function getScanHistoryController(
  request: FastifyRequest<{ Params: any; Querystring: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { repoId } = repoIdSchema.parse(request.params);
  const { page, limit } = scanHistorySchema.parse(request.query);

  const result = await service.getScanHistory(
    request.server,
    userId,
    repoId,
    page,
    limit
  );

  return reply.send(result);
}

export async function getScanStatusController(
  request: FastifyRequest<{ Params: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { scanId } = scanIdSchema.parse(request.params);

  const result = await service.getScanStatus(request.server, userId, scanId);

  return reply.send(result);
}


export async function getScanLogsController(
  request: FastifyRequest<{ Params: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { scanId } = scanIdSchema.parse(request.params);

  const result = await service.getScanLogs(request.server, userId, scanId);

  return reply.send(result);
}

export async function exportScanController(
  request: FastifyRequest<{ Params: any; Querystring: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { scanId } = scanIdSchema.parse(request.params);
  const format = (request.query as any).format || 'json';

  if (!['json', 'csv'].includes(format)) {
    throw request.server.httpErrors.badRequest('Invalid format. Use json or csv');
  }

  const result = await service.exportScanResults(
    request.server,
    userId,
    scanId,
    format
  );

  if (format === 'json') {
    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="scan-${scanId}.json"`)
      .send(result);
  } else {
    return reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="scan-${scanId}.csv"`)
      .send(result);
  }
}

export async function cancelScanController(
  request: FastifyRequest<{ Params: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { scanId } = scanIdSchema.parse(request.params);

  const result = await service.cancelScan(request.server, userId, scanId);

  return reply.send(result);
}


