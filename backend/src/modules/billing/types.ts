export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface WebhookPayload {
  [key: string]: any;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  created_at: string;
  pdf_url?: string;
}

export interface SubscriptionDetails {
  id: string;
  workspace_id: string;
  plan: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  payment_method?: {
    brand: string;
    last4: string;
  };
}

export interface PaymentProvider {
  /**
   * Create a checkout session for a workspace subscription
   */
  createCheckoutSession(workspaceId: string, email: string): Promise<CheckoutSession>;

  /**
   * Verify and process a webhook payload
   */
  verifyWebhook(payload: any, signature: string): Promise<any>;

  /**
   * Cancel a subscription
   */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /**
   * Get subscription status
   */
  getSubscriptionStatus(subscriptionId: string): Promise<string>;

  /**
   * Get subscription details
   */
  getSubscriptionDetails(workspaceId: string): Promise<SubscriptionDetails | null>;

  /**
   * Get invoices for a workspace
   */
  getInvoices(workspaceId: string): Promise<Invoice[]>;
}

export type PaymentProviderType = 'dev' | 'paddle' | 'stripe';
