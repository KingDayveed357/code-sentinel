-- =====================================================
-- Project Assignments Table
-- =====================================================

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- A user can only be assigned once to a project
  UNIQUE(project_id, user_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_workspace_id ON project_members(workspace_id);

-- Enable RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'project_members' AND policyname = 'Members can view project assignments in their workspace'
    ) THEN
        CREATE POLICY "Members can view project assignments in their workspace"
        ON project_members FOR SELECT
        USING (
          workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND status = 'active'
          )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'project_members' AND policyname = 'Owners and admins can manage project assignments'
    ) THEN
        CREATE POLICY "Owners and admins can manage project assignments"
        ON project_members FOR ALL
        USING (
          workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() 
            AND role IN ('owner', 'admin') 
            AND status = 'active'
          )
        );
    END IF;
END $$;
