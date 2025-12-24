import type { FastifyInstance } from 'fastify';
import * as controller from './controller';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import {
  requireAuth,
  requireProfile,
  requireOnboardingCompleted,
} from '../../middleware/gatekeepers';
import { resolveWorkspace } from '../../middleware/workspace';
import { ScannerOrchestrator } from '../../scanners/orchestrator';

export default async function scansRoutes(fastify: FastifyInstance) {
  const preHandler = [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
    requireOnboardingCompleted,
    resolveWorkspace
  ];

  /**
   * POST /api/scans/:repoId/start
   * Start a new security scan
   */
  fastify.post('/:repoId/start', { preHandler }, controller.startScanController);

  /**
   * GET /api/scans/:repoId/history
   * Get scan history for a repository
   */
  fastify.get('/:repoId/history', { preHandler }, controller.getScanHistoryController);

  /**
   * GET /api/scans/run/:scanId
   * Get detailed scan status and summary
   */
  fastify.get('/run/:scanId', { preHandler }, controller.getScanStatusController);

  /**
   * GET /api/scans/run/:scanId/logs
   * Get real-time logs for a scan
   */
  fastify.get('/run/:scanId/logs', { preHandler }, controller.getScanLogsController);

  /**
   * GET /api/scans/run/:scanId/export?format=json|csv
   * Export scan results
   */
  fastify.get('/run/:scanId/export', { preHandler }, controller.exportScanController);

  
  fastify.get('/test-scanners', async (req, reply) => {
      const orchestrator = new ScannerOrchestrator(fastify);
      const availability = await orchestrator.checkAvailability();
      return reply.send({ scanners: availability });
    });

  /**
   * DELETE /api/scans/run/:scanId
   * Cancel a running scan
   */
  fastify.delete('/run/:scanId', { preHandler }, controller.cancelScanController);
}
