import type { FastifyInstance } from 'fastify';
import { PaymentProvider, CheckoutSession, Invoice, SubscriptionDetails } from '../types';

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

  async getSubscriptionDetails(workspaceId: string): Promise<SubscriptionDetails | null> {
    this.fastify.log.info({ workspaceId }, 'Fetching mock subscription details');
    
    // In dev mode, we return a mock subscription
    return {
      id: `sub_dev_${workspaceId.slice(0, 8)}`,
      workspace_id: workspaceId,
      plan: 'Team',
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancel_at_period_end: false,
      payment_method: {
        brand: 'Visa',
        last4: '4242'
      }
    };
  }

  async getInvoices(workspaceId: string): Promise<Invoice[]> {
    this.fastify.log.info({ workspaceId }, 'Fetching mock invoices');
    
    // Return mock payment history
    return [
      {
        id: `inv_dev_1`,
        workspace_id: workspaceId,
        amount: 4900,
        currency: 'usd',
        status: 'paid',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        pdf_url: '#'
      },
      {
        id: `inv_dev_2`,
        workspace_id: workspaceId,
        amount: 4900,
        currency: 'usd',
        status: 'paid',
        created_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
        pdf_url: '#'
      }
    ];
  }
}
