// =====================================================
// src/modules/webhooks/routes.ts
// =====================================================
import type { FastifyInstance } from 'fastify';
import { handleGitHubWebhook } from './controller';

export default async function webhooksRoutes(fastify: FastifyInstance) {
  /**
   * POST /webhooks/github
   * Receive GitHub webhook events
   */
  fastify.post('/github', {
    config: {
      // Disable auth for webhooks
      rawBody: true,
    },
    handler: handleGitHubWebhook,
  });
}