import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BillingService } from './service';
import { verifyAuth } from '../../middleware/auth';

export default async function billingRoutes(fastify: FastifyInstance) {
  const billingService = new BillingService(fastify);

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
