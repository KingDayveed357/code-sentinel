// src/modules/webhooks/types.ts
// =====================================================
// Type Definitions for Auto-Scanning System
// =====================================================

export interface RepositorySettings {
  id: string;
  repository_id: string;
  auto_scan_enabled: boolean;
  scan_on_push: boolean;
  scan_on_pr: boolean;
  schedule_enabled: boolean;
  schedule_cron: string | null;
  branch_filter: string[] | null;
  excluded_branches: string[] | null;
  default_scan_type: 'quick' | 'full'; // ✅ FIX: Removed 'custom'
  enabled_scanners: {
    sast: boolean;
    sca: boolean;
    secrets: boolean;
    iac: boolean;
    container: boolean;
  };
  auto_create_issues: boolean;
  issue_severity_threshold: 'critical' | 'high' | 'medium' | 'low' | 'info';
  issue_labels: string[];
  issue_assignees: string[];
  created_at: string;
  updated_at: string;
}

export interface RepositoryWebhook {
  id: string;
  repository_id: string;
  user_id: string;
  github_webhook_id: number;
  webhook_url: string;
  webhook_secret: string;
  status: 'active' | 'inactive' | 'failed' | 'deleted';
  events: string[];
  last_delivery_status: string | null;
  last_delivery_at: string | null;
  failure_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEvent {
  id: string;
  repository_id: string | null;
  webhook_id: string | null;
  event_type: string;
  delivery_id: string;
  payload: any;
  headers: any;
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'ignored';
  processed_at: string | null;
  error_message: string | null;
  scan_id: string | null;
  created_at: string;
}

export interface AutoScanHistory {
  id: string;
  scan_id: string;
  repository_id: string;
  trigger_type: 'push' | 'pull_request' | 'schedule' | 'manual';
  trigger_source: string | null;
  webhook_event_id: string | null;
  branch: string;
  commit_sha: string | null;
  commit_message: string | null;
  committer: string | null;
  is_duplicate: boolean;
  cancelled_by: string | null;
  created_at: string;
}

export interface GitHubIssue {
  id: string;
  vulnerability_id: string;
  vulnerability_type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
  repository_id: string;
  scan_id: string;
  user_id: string;
  github_issue_id: number;
  github_issue_number: number;
  github_issue_url: string;
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  issue_status: 'open' | 'closed';
  closed_at: string | null;
  creation_type: 'manual' | 'automatic';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// GitHub Webhook Payload Types
// =====================================================

export interface GitHubPushPayload {
  ref: string; // "refs/heads/main"
  before: string; // commit SHA
  after: string; // commit SHA
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      name: string;
      login: string;
    };
    html_url: string;
    default_branch: string;
  };
  pusher: {
    name: string;
    email: string;
  };
  sender: {
    login: string;
    id: number;
  };
  commits: Array<{
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
    committer: {
      name: string;
      email: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  head_commit: {
    id: string;
    message: string;
    timestamp: string;
    author: {
      name: string;
      email: string;
    };
  };
}

export interface GitHubPullRequestPayload {
  action: string; // "opened", "synchronize", etc.
  number: number;
  pull_request: {
    id: number;
    number: number;
    state: string;
    title: string;
    body: string;
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
  };
  repository: GitHubPushPayload['repository'];
  sender: GitHubPushPayload['sender'];
}

// =====================================================
// GitHub API Types
// =====================================================

export interface GitHubWebhookConfig {
  name: 'web';
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type: 'json';
    secret: string;
    insecure_ssl: '0' | '1';
  };
}

export interface GitHubIssueCreatePayload {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface GitHubIssueResponse {
  id: number;
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string;
  html_url: string;
  labels: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  assignees: Array<{
    login: string;
    id: number;
  }>;
  created_at: string;
  updated_at: string;
}

// =====================================================
// Service Types
// =====================================================

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export interface ScanTriggerResult {
  should_scan: boolean;
  reason?: string;
  settings?: RepositorySettings;
}

export interface WebhookRegistrationResult {
  success: boolean;
  webhook_id?: number;
  webhook_url?: string;
  error?: string;
}

export interface IssueCreationResult {
  success: boolean;
  issue_url?: string;
  issue_number?: number;
  error?: string;
}