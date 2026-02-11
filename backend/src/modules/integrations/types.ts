
export type IntegrationType = 'oauth' | 'github_app';
export type IntegrationProvider = 'github' | 'gitlab' | 'bitbucket' | 'slack';

export interface WorkspaceIntegration {
  id: string;
  workspace_id: string;
  provider: IntegrationProvider;
  type: IntegrationType;
  
  // OAuth fields
  oauth_user_id: number | null;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_expires_at: string | null;
  
  // GitHub App fields
  github_app_installation_id: number | null;
  github_app_account_id: number | null;
  github_app_account_login: string | null;
  github_app_account_type: 'User' | 'Organization' | null;
  
  // Common fields
  account_login: string;
  account_avatar_url: string | null;
  account_email: string | null;
  connected: boolean;
  metadata: Record<string, any>;
  
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeIntegration {
  id: string;
  provider: IntegrationProvider;
  type: IntegrationType;
  account_login: string;
  account_avatar_url: string | null;
  account_email: string | null;
  connected: boolean;
  connected_at: string | null;
  metadata?: Record<string, any>;
}
