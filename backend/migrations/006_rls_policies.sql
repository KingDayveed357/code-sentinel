-- =====================================================
-- RLS Policies for RBAC Enforcement
-- Mirrors backend RBAC permissions at database level
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vulnerabilities_unified ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- WORKSPACES
-- =====================================================

-- Users can view workspaces they are members of
CREATE POLICY "Users can view their workspaces"
ON workspaces FOR SELECT
USING (
  id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
  OR owner_id = auth.uid()
);

-- Only owners can update workspaces
CREATE POLICY "Owners can update workspaces"
ON workspaces FOR UPDATE
USING (
  id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
  )
);

-- Only owners can delete workspaces
CREATE POLICY "Owners can delete workspaces"
ON workspaces FOR DELETE
USING (
  id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
  )
);

-- =====================================================
-- WORKSPACE MEMBERS
-- =====================================================

-- Members can view other members in their workspace
CREATE POLICY "Members can view workspace members"
ON workspace_members FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Owners and admins can add members
CREATE POLICY "Owners and admins can add members"
ON workspace_members FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- Owners can update member roles
CREATE POLICY "Owners can update member roles"
ON workspace_members FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
  )
);

-- Owners and admins can remove members
CREATE POLICY "Owners and admins can remove members"
ON workspace_members FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- =====================================================
-- WORKSPACE INVITATIONS
-- =====================================================

-- Members can view invitations in their workspace
CREATE POLICY "Members can view workspace invitations"
ON workspace_invitations FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Owners and admins can create invitations
CREATE POLICY "Owners and admins can create invitations"
ON workspace_invitations FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- Owners and admins can delete invitations
CREATE POLICY "Owners and admins can delete invitations"
ON workspace_invitations FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- =====================================================
-- REPOSITORIES (PROJECTS)
-- =====================================================

-- All members can view projects
-- Developers see only assigned projects
CREATE POLICY "Members can view projects"
ON repositories FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    AND (
      -- Owner, Admin, Viewer see all
      wm.role IN ('owner', 'admin', 'viewer')
      OR
      -- Developer sees assigned projects
      (wm.role = 'developer' AND repositories.id IN (
        SELECT project_id FROM project_members
        WHERE user_id = auth.uid()
      ))
    )
  )
);

-- Owner, Admin, Developer can create projects
CREATE POLICY "Owner, Admin, Developer can create projects"
ON repositories FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin', 'developer') 
    AND status = 'active'
  )
);

-- Owner, Admin, Developer can update projects
CREATE POLICY "Owner, Admin, Developer can update projects"
ON repositories FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    AND (
      wm.role IN ('owner', 'admin', 'developer')
    )
  )
);

-- Only Owner and Admin can delete projects
CREATE POLICY "Owner and Admin can delete projects"
ON repositories FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- =====================================================
-- PROJECT MEMBERS
-- =====================================================

-- Members can view project assignments
CREATE POLICY "Members can view project assignments"
ON project_members FOR SELECT
USING (
  project_id IN (
    SELECT id FROM repositories
    WHERE workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  )
);

-- Owner and Admin can assign members to projects
CREATE POLICY "Owner and Admin can assign members"
ON project_members FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT r.id FROM repositories r
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() 
    AND wm.role IN ('owner', 'admin') 
    AND wm.status = 'active'
  )
);

-- Owner and Admin can remove project assignments
CREATE POLICY "Owner and Admin can remove assignments"
ON project_members FOR DELETE
USING (
  project_id IN (
    SELECT r.id FROM repositories r
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() 
    AND wm.role IN ('owner', 'admin') 
    AND wm.status = 'active'
  )
);

-- =====================================================
-- SCANS
-- =====================================================

-- Members can view scans for projects they can access
CREATE POLICY "Members can view scans"
ON scans FOR SELECT
USING (
  repository_id IN (
    SELECT r.id FROM repositories r
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    AND (
      wm.role IN ('owner', 'admin', 'viewer')
      OR
      (wm.role = 'developer' AND r.id IN (
        SELECT project_id FROM project_members WHERE user_id = auth.uid()
      ))
    )
  )
);

-- Owner, Admin, Developer can create scans
CREATE POLICY "Owner, Admin, Developer can create scans"
ON scans FOR INSERT
WITH CHECK (
  repository_id IN (
    SELECT r.id FROM repositories r
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() 
    AND wm.role IN ('owner', 'admin', 'developer') 
    AND wm.status = 'active'
  )
);

-- Owner and Admin can delete scans
CREATE POLICY "Owner and Admin can delete scans"
ON scans FOR DELETE
USING (
  repository_id IN (
    SELECT r.id FROM repositories r
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() 
    AND wm.role IN ('owner', 'admin') 
    AND wm.status = 'active'
  )
);

-- =====================================================
-- VULNERABILITIES
-- =====================================================

-- Members can view vulnerabilities for scans they can access
CREATE POLICY "Members can view vulnerabilities"
ON vulnerabilities_unified FOR SELECT
USING (
  scan_id IN (
    SELECT s.id FROM scans s
    INNER JOIN repositories r ON r.id = s.repository_id
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    AND (
      wm.role IN ('owner', 'admin', 'viewer')
      OR
      (wm.role = 'developer' AND (
        r.id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
        OR assigned_to = auth.uid()
      ))
    )
  )
);

-- Owner, Admin, Developer can update vulnerabilities
CREATE POLICY "Owner, Admin, Developer can update vulnerabilities"
ON vulnerabilities_unified FOR UPDATE
USING (
  scan_id IN (
    SELECT s.id FROM scans s
    INNER JOIN repositories r ON r.id = s.repository_id
    INNER JOIN workspace_members wm ON wm.workspace_id = r.workspace_id
    WHERE wm.user_id = auth.uid() 
    AND wm.role IN ('owner', 'admin', 'developer') 
    AND wm.status = 'active'
  )
);

-- =====================================================
-- INTEGRATIONS
-- =====================================================

-- All members can view integrations
CREATE POLICY "Members can view integrations"
ON integrations FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Owner and Admin can create integrations
CREATE POLICY "Owner and Admin can create integrations"
ON integrations FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- Owner and Admin can update integrations
CREATE POLICY "Owner and Admin can update integrations"
ON integrations FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- Owner and Admin can delete integrations
CREATE POLICY "Owner and Admin can delete integrations"
ON integrations FOR DELETE
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- =====================================================
-- ACTIVITY LOG
-- =====================================================

-- Owner and Admin can view activity logs
CREATE POLICY "Owner and Admin can view activity logs"
ON workspace_activity_log FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin') 
    AND status = 'active'
  )
);

-- System can insert activity logs (service role)
CREATE POLICY "System can insert activity logs"
ON workspace_activity_log FOR INSERT
WITH CHECK (true);
