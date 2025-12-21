// src/modules/github-issues/routes.ts
import type { FastifyInstance } from 'fastify';
import * as controller from './controller';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import {
  requireAuth,
  requireProfile,
  requireOnboardingCompleted,
} from '../../middleware/gatekeepers';

export default async function githubIssuesRoutes(fastify: FastifyInstance) {
  const preHandler = [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
    requireOnboardingCompleted,
  ];

  /**
   * GET /api/github-issues/scan/:scanId
   * Get all GitHub issues for a specific scan
   */
  fastify.get('/scan/:scanId', { preHandler }, controller.getIssuesForScanController);

  /**
   * POST /api/github-issues/:issueId/close
   * Close a GitHub issue
   */
  fastify.post('/:issueId/close', { preHandler }, controller.closeIssueController);
}