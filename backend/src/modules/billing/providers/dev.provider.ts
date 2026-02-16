import type { FastifyInstance } from 'fastify';
import { PaymentProvider, CheckoutSession } from '../types';

export class DevPaymentProvider implements PaymentProvider {
  constructor(private fastify: FastifyInstance) {}

  async createCheckoutSession(workspaceId: string, email: string): Promise<CheckoutSession> {
    this.fastify.log.info({ workspaceId }, 'Creating mock checkout session (Dev Mode)');

    // In a real provider (Paddle/Stripe), we would create a session with the provider here.
    // In Dev Mode, we just return a URL to our local mock checkout page.
    // The workspace REMAINS PENDING until the user completes the "payment" on the mock page.

    return {
      url: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/checkout/mock?workspaceId=${workspaceId}`,
      sessionId: `sess_dev_${Date.now()}`
    };
  }

  async verifyWebhook(payload: any, signature: string): Promise<any> {
    // Dev provider doesn't use real webhooks, but could simulate
    return { type: 'mock.event', data: payload };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    this.fastify.log.info({ subscriptionId }, 'Cancelling mock subscription');
    // In a real app, this would call the API. Here we just log.
    // The caller (Service) should update the local DB state.
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<string> {
    return 'active';
  }
}
