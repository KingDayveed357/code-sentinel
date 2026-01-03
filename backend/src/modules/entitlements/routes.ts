import type { FastifyInstance } from 'fastify';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import { requireAuth, requireProfile } from '../../middleware/gatekeepers';
import { EntitlementsService } from './service';

export default async function entitlementsRoutes(fastify: FastifyInstance) {
  const service = new EntitlementsService(fastify);
  const preHandler = [verifyAuth, loadProfile, requireAuth, requireProfile];

  /**p
   * GET /me/entitlements
   * Get user's plan limits and current usage
   */
  fastify.get('/entitlements', { preHandler }, async (request, reply) => {
    const { id: userId, plan } = request.profile!;

    const usage = await service.getUserUsage(userId, plan);

    return reply.send({
      success: true,
      data: usage,
    });
  });

  /**
   * GET /me/features
   * Check specific feature access or get all features for plan
   */
  fastify.get<{ Querystring: { feature?: string } }>(
    '/me/features',
    { preHandler },
    async (request, reply) => {
      const { plan } = request.profile!;
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