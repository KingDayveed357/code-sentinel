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
   * Check specific feature access
   */
  fastify.get<{ Querystring: { feature: string } }>(
    '/me/features',
    { preHandler },
    async (request, reply) => {
      const { plan } = request.profile!;
      const { feature } = request.query;

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
  );
}