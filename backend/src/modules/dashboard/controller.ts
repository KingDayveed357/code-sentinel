// src/modules/dashboard/controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as service from './service';

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
export async function getDashboardStatsController(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const stats = await service.getDashboardStats(request.server, userId);
  return reply.send(stats);
}

/**
 * GET /api/dashboard/critical-vulnerabilities
 * Get top critical vulnerabilities
 */
export async function getCriticalVulnerabilitiesController(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const vulnerabilities = await service.getCriticalVulnerabilities(request.server, userId);
  return reply.send({ vulnerabilities });
}

/**
 * GET /api/dashboard/recent-scans
 * Get recent scans
 */
export async function getRecentScansController(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const scans = await service.getRecentScans(request.server, userId);
  return reply.send({ scans });
}

/**
 * GET /api/dashboard/security-score
 * Get overall security score
 */
export async function getSecurityScoreController(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const score = await service.getSecurityScore(request.server, userId);
  return reply.send(score);
}

/**
 * GET /api/dashboard/overview
 * Get all dashboard data in one call
 */
export async function getDashboardOverviewController(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.profile!.id;

  const [stats, vulnerabilities, scans, score] = await Promise.all([
    service.getDashboardStats(request.server, userId),
    service.getCriticalVulnerabilities(request.server, userId),
    service.getRecentScans(request.server, userId),
    service.getSecurityScore(request.server, userId),
  ]);

  return reply.send({
    stats,
    critical_vulnerabilities: vulnerabilities,
    recent_scans: scans,
    security_score: score,
  });
}