// src/modules/dashboard/routes.ts
import type { FastifyInstance } from 'fastify';
import * as controller from './controller';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import {
  requireAuth,
  requireProfile,
  requireOnboardingCompleted,
} from '../../middleware/gatekeepers';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  const preHandler = [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
    requireOnboardingCompleted,
  ];

  /**
   * GET /api/dashboard/overview
   * Get complete dashboard overview (all data in one call)
   */
  fastify.get('/overview', { preHandler }, controller.getDashboardOverviewController);

  /**
   * GET /api/dashboard/stats
   * Get dashboard statistics
   */
  fastify.get('/stats', { preHandler }, controller.getDashboardStatsController);

  /**
   * GET /api/dashboard/critical-vulnerabilities
   * Get top critical vulnerabilities
   */
  fastify.get('/critical-vulnerabilities', { preHandler }, controller.getCriticalVulnerabilitiesController);

  /**
   * GET /api/dashboard/recent-scans
   * Get recent scans (one per project)
   */
  fastify.get('/recent-scans', { preHandler }, controller.getRecentScansController);

  /**
   * GET /api/dashboard/security-score
   * Get overall security score
   */
  fastify.get('/security-score', { preHandler }, controller.getSecurityScoreController);
}