export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface WebhookPayload {
  [key: string]: any;
}

export interface PaymentProvider {
  /**
   * Create a checkout session for a workspace subscription
   */
  createCheckoutSession(workspaceId: string, email: string): Promise<CheckoutSession>;

  /**
   * Verify and process a webhook payload
   * Returns generic object or specific event type
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
}

export type PaymentProviderType = 'dev' | 'paddle' | 'stripe';
