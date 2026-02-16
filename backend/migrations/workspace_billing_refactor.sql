-- Migration: workspace_billing_refactor
-- Description: Updates workspaces table to support new billing lifecycle and fields

-- 1. Add new columns
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS subscription_provider text,
ADD COLUMN IF NOT EXISTS subscription_id text,
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

-- 2. Migrate existing data (Case insensitive migration)
UPDATE workspaces SET plan = 'free' WHERE plan ILIKE 'free';
UPDATE workspaces SET plan = 'team' WHERE plan ILIKE 'team';
UPDATE workspaces SET plan = 'team' WHERE plan ILIKE 'dev'; -- Map old Dev to Team
UPDATE workspaces SET plan = 'team' WHERE plan ILIKE 'enterprise'; -- Map old Enterprise to Team

-- Set billing status for existing workspaces
-- Free workspaces are active by definition (or don't need billing status, but 'active' is safe)
UPDATE workspaces SET billing_status = 'active' WHERE plan = 'free';
-- Existing team workspaces are assumed active (grandfathered)
UPDATE workspaces SET billing_status = 'active' WHERE plan = 'team';

-- 3. Update constraints
-- Drop old constraints if they exist (names might vary, using the ones seen in schema)
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_plan_check;

-- Add new constraints
ALTER TABLE workspaces
ADD CONSTRAINT workspaces_plan_check CHECK (plan IN ('free', 'team'));

ALTER TABLE workspaces
ADD CONSTRAINT workspaces_billing_status_check CHECK (billing_status IN ('none', 'pending', 'active', 'expired'));
