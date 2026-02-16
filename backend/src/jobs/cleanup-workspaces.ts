import { FastifyInstance } from 'fastify';
import { WorkspaceService } from '../modules/workspaces/service';

export function scheduleWorkspaceCleanup(fastify: FastifyInstance) {
  const service = new WorkspaceService(fastify);

  // Run immediately on boot
  service.cleanupPendingWorkspaces()
    .then(count => {
      if (count > 0) fastify.log.info({ count }, 'Deleted expired pending workspaces on startup');
    })
    .catch(err => fastify.log.error({ err }, 'Failed to cleanup pending workspaces on startup'));

  // Run every hour
  setInterval(async () => {
    try {
      const count = await service.cleanupPendingWorkspaces();
      if (count > 0) {
        fastify.log.info({ count }, 'Deleted expired pending workspaces');
      }
    } catch (error) {
      fastify.log.error({ error }, 'Failed to cleanup pending workspaces');
    }
  }, 60 * 60 * 1000); // 1 hour
}
