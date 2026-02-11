import type { FastifyInstance } from 'fastify';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import { resolveWorkspace } from '../../middleware/workspace';
import { requireAuth, requireProfile, requireWorkspace } from '../../middleware/gatekeepers';
import { EntitlementsService } from './service';

export default async function entitlementsRoutes(fastify: FastifyInstance) {
  const service = new EntitlementsService(fastify);
  const preHandler = [
    verifyAuth, 
    loadProfile, 
    requireAuth, 
    requireProfile,
    resolveWorkspace,
    requireWorkspace
  ];

  /**
   * GET /api/workspaces/:workspaceId/entitlements
   * Get workspace's plan limits and current usage
   */
  fastify.get('/:workspaceId/entitlements', { preHandler }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { plan } = request.workspace!;

    const usage = await service.getUserUsage(workspaceId, plan);

    return reply.send({
      success: true,
      data: usage,
    });
  });

  /**
   * GET /api/workspaces/:workspaceId/entitlements/features
   * Check specific feature access or get all features for plan
   */
  fastify.get<{ Querystring: { feature?: string } }>(
    '/:workspaceId/entitlements/features',
    { preHandler },
    async (request, reply) => {
      const { plan } = request.workspace!;
      const { feature } = request.query;

      // If feature is specified, check single feature
      if (feature) {
        const hasAccess = await service.hasFeature(plan, feature);

        return reply.send({
          success: true,
          data: {
            feature,
            enabled: hasAccess,
            plan,
          },
        });
      }

      // Otherwise, return all features for the plan
      const features = await service.getPlanFeatures(plan);

      return reply.send({
        success: true,
        data: {
          plan,
          features,
        },
      });
    }
  );
}