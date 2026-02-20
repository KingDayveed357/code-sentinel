import type { FastifyInstance } from 'fastify';
import { PaymentProvider, CheckoutSession, Invoice, SubscriptionDetails } from './types';
import { DevPaymentProvider } from './providers/dev.provider';
// import { env } from '../../env'; // Env is accessed via process.env directly in constructor for now or import if exists


export class BillingService {
  private provider: PaymentProvider;

  constructor(private fastify: FastifyInstance) {
    // Dynamically resolve provider
    const providerType = process.env.PAYMENT_PROVIDER || 'dev';
    
    switch (providerType) {
      case 'dev':
        this.provider = new DevPaymentProvider(fastify);
        break;
      case 'paddle':
        // this.provider = new PaddlePaymentProvider(fastify); // Future implementation
        throw new Error('Paddle provider not implemented yet');
      case 'stripe':
        // this.provider = new StripePaymentProvider(fastify); // Future implementation
        throw new Error('Stripe provider not implemented yet');
      default:
        this.fastify.log.warn(`Unknown payment provider: ${providerType}, defaulting to dev`);
        this.provider = new DevPaymentProvider(fastify);
    }
  }

  /**
   * Create a checkout session for a specific workspace
   */
  async createCheckoutSession(workspaceId: string, email: string): Promise<CheckoutSession> {
    return this.provider.createCheckoutSession(workspaceId, email);
  }

  /**
   * Handle webhook events (e.g. successful payment)
   */
  async handleWebhook(payload: any, signature: string): Promise<any> {
    return this.provider.verifyWebhook(payload, signature);
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    return this.provider.cancelSubscription(subscriptionId);
  }

  /**
   * Manually activate a workspace subscription (Internal/Dev usage)
   */
  async activateWorkspaceSubscription(workspaceId: string, subscriptionId: string, provider: string): Promise<void> {
    const { error } = await this.fastify.supabase
      .from('workspaces')
      .update({
        billing_status: 'active',
        subscription_provider: provider,
        subscription_id: subscriptionId,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId);

    if (error) {
       this.fastify.log.error({ error, workspaceId }, 'Failed to activate workspace subscription');
       throw new Error('Failed to activate workspace subscription');
    }
    
    this.fastify.log.info({ workspaceId, subscriptionId }, 'Workspace subscription activated');
  }

  /**
   * Get subscription details for a workspace
   */
  async getSubscriptionDetails(workspaceId: string): Promise<SubscriptionDetails | null> {
    return this.provider.getSubscriptionDetails(workspaceId);
  }

  /**
   * Get invoices for a workspace
   */
  async getInvoices(workspaceId: string): Promise<Invoice[]> {
    return this.provider.getInvoices(workspaceId);
  }
}
