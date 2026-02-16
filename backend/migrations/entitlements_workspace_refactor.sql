-- backend/migrations/entitlements_workspace_refactor.sql

-- 1. Updates to Subscriptions Table
-- Ensure subscriptions uses workspace_id instead of user_id
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- If migrating data (optional - assumes 1:1 map for personal workspaces for now or null)
-- UPDATE public.subscriptions SET workspace_id = (SELECT id FROM public.workspaces WHERE owner_id = subscriptions.user_id AND type='personal' LIMIT 1) WHERE workspace_id IS NULL;

-- Remove user_id from subscriptions
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS user_id;

-- 2. Rename and Update Usage History
ALTER TABLE public.usage_history RENAME TO workspace_usage_history;

ALTER TABLE public.workspace_usage_history 
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- Populate workspace_id based on user_id (best effort migration logic would be needed here, for now we leave null or defaut)
-- In a real migration we'd need to map old user usage to their personal workspace

ALTER TABLE public.workspace_usage_history DROP COLUMN IF EXISTS user_id;
-- Ensure metadata column exists
ALTER TABLE public.workspace_usage_history ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;


-- 3. Rename and Update Usage Tracking
ALTER TABLE public.usage_tracking RENAME TO workspace_usage_tracking;

ALTER TABLE public.workspace_usage_tracking 
ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- Unique constraint update
ALTER TABLE public.workspace_usage_tracking DROP CONSTRAINT IF EXISTS usage_tracking_user_id_period_year_period_month_key;

ALTER TABLE public.workspace_usage_tracking DROP COLUMN IF EXISTS user_id;

-- Add new unique constraint
ALTER TABLE public.workspace_usage_tracking ADD CONSTRAINT workspace_usage_tracking_workspace_period_unique UNIQUE (workspace_id, period_year, period_month);


-- 4. Updates to Users Table
ALTER TABLE public.users DROP COLUMN IF EXISTS plan;
ALTER TABLE public.users DROP COLUMN IF EXISTS plan_expires_at;
ALTER TABLE public.users DROP COLUMN IF EXISTS plan_status;
ALTER TABLE public.users DROP COLUMN IF EXISTS team_id;

-- 5. Create Indices (optional but good practice)
CREATE INDEX IF NOT EXISTS idx_workspace_usage_history_workspace ON public.workspace_usage_history(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_usage_tracking_workspace_period ON public.workspace_usage_tracking(workspace_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_id ON public.subscriptions(workspace_id);
