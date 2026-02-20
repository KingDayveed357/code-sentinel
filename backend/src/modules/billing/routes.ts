import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from './service';
import { verifyAuth, loadProfile } from '../../middleware/auth';
import { resolveWorkspace } from '../../middleware/workspace';
import { requireAuth, requireProfile, requireWorkspace } from '../../middleware/gatekeepers';
import { requirePermission } from '../../middleware/rbac-guards';

export default async function billingRoutes(fastify: FastifyInstance) {
  const billingService = new BillingService(fastify);

  // Common preHandlers for workspace-scoped billing
  const commonPreHandlers = [
    verifyAuth,
    loadProfile,
    requireAuth,
    requireProfile,
    resolveWorkspace,
    requireWorkspace
  ];

  /**
   * GET /api/billing/subscription?workspaceId=...
   * Get subscription details for a workspace
   */
  fastify.get('/subscription', {
    preHandler: [...commonPreHandlers, requirePermission('workspace:view_billing')]
  }, async (request, reply) => {
    const workspaceId = (request.query as any).workspaceId || request.workspace?.id;
    if (!workspaceId) throw fastify.httpErrors.badRequest('workspaceId is required');
    
    const subscription = await billingService.getSubscriptionDetails(workspaceId);
    return reply.send({ success: true, data: subscription });
  });

  /**
   * GET /api/billing/invoices?workspaceId=...
   * Get invoice history for a workspace
   */
  fastify.get('/invoices', {
    preHandler: [...commonPreHandlers, requirePermission('workspace:view_billing')]
  }, async (request, reply) => {
    const workspaceId = (request.query as any).workspaceId || request.workspace?.id;
    if (!workspaceId) throw fastify.httpErrors.badRequest('workspaceId is required');
    
    const invoices = await billingService.getInvoices(workspaceId);
    return reply.send({ success: true, data: invoices });
  });

  /**
   * POST /api/billing/checkout
   * Create a checkout session (Owner only)
   */
  fastify.post('/checkout', {
    preHandler: [...commonPreHandlers, requirePermission('workspace:manage_billing')],
    schema: {
        body: {
            type: 'object',
            required: ['workspaceId'],
            properties: {
                workspaceId: { type: 'string', format: 'uuid' }
            }
        }
    }
  }, async (request, reply) => {
    const { workspaceId } = request.body as { workspaceId: string };
    const email = request.supabaseUser!.email!;
    
    const session = await billingService.createCheckoutSession(workspaceId, email);
    return reply.send({ success: true, data: session });
  });

  // Dev mode only: Mock success
  if (process.env.PAYMENT_PROVIDER === 'dev' || !process.env.PAYMENT_PROVIDER) {
    fastify.post('/mock-success', async (req: FastifyRequest<{ Body: { workspaceId: string } }>, reply: FastifyReply) => {
        const { workspaceId } = req.body;
        
        // In real app, we verify session ID or signature.
        // In dev, we just activate.
        
        try {
            await billingService.activateWorkspaceSubscription(workspaceId, `sub_dev_${Date.now()}`, 'dev');
            return reply.send({ success: true });
        } catch (error) {
            req.log.error(error);
            return reply.code(500).send({ error: 'Failed' });
        }
    });
  }

  // Webhook handler (placeholder)
  fastify.post('/webhook', async (req, reply) => {
      // Implement webhook verification and handling
      return reply.send({ received: true });
  });
}
