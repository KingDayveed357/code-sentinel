// =====================================================
// modules/teams/types.ts
// =====================================================
export interface Team {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: 'Team' | 'Enterprise';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
  trial_ends_at: string | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'developer';
  status: 'active' | 'pending' | 'suspended';
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  email: string;
  role: 'admin' | 'developer';
  invited_by: string;
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export type TeamRole = 'owner' | 'admin' | 'developer';

export const ROLE_HIERARCHY = {
  owner: 3,
  admin: 2,
  developer: 1,
} as const;