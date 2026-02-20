-- Ensure workspace_id column exists in project_members
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'project_members' 
        AND column_name = 'workspace_id'
    ) THEN
        ALTER TABLE project_members ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
    END IF;
    
    -- Ensure indexes exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_members_workspace_id'
    ) THEN
        CREATE INDEX idx_project_members_workspace_id ON project_members(workspace_id);
    END IF;
END $$;

-- Update RLS policies to ensure they are correct (re-apply them just in case)
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view project assignments in their workspace" ON project_members;
CREATE POLICY "Members can view project assignments in their workspace"
    ON project_members FOR SELECT
    USING (
      workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    );

DROP POLICY IF EXISTS "Owners and admins can manage project assignments" ON project_members;
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
