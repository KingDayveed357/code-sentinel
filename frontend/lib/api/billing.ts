import { apiFetch } from "../api";

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

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export const billingApi = {
  getSubscription: async (workspaceId: string): Promise<SubscriptionDetails> => {
    const response = await apiFetch(`/billing/subscription?workspaceId=${workspaceId}`, {
      requireAuth: true,
    });
    return response.data;
  },

  getInvoices: async (workspaceId: string): Promise<Invoice[]> => {
    const response = await apiFetch(`/billing/invoices?workspaceId=${workspaceId}`, {
      requireAuth: true,
    });
    return response.data;
  },

  createCheckoutSession: async (workspaceId: string): Promise<CheckoutSession> => {
    const response = await apiFetch(`/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ workspaceId }),
      requireAuth: true,
    });
    return response.data;
  },
};
