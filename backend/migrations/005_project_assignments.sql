-- Create project_members table for project assignment
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(project_id, user_id)
);

-- Add indexes
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Add vulnerability assignment columns if not exists
ALTER TABLE vulnerabilities_unified 
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for vulnerability assignments
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_assigned_to ON vulnerabilities_unified(assigned_to);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_assigned_by ON vulnerabilities_unified(assigned_by);

-- Add workspace_id to repositories if not exists (for easier querying)
ALTER TABLE repositories 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Backfill workspace_id from owner_id if needed
UPDATE repositories r
SET workspace_id = (
  SELECT id FROM workspaces w WHERE w.owner_id = r.owner_id AND w.type = 'personal' LIMIT 1
)
WHERE workspace_id IS NULL AND owner_id IS NOT NULL;

-- Add index
CREATE INDEX IF NOT EXISTS idx_repositories_workspace ON repositories(workspace_id);
