# Claude Handoff Prompt - Workspace Context Refactor

Copy this entire prompt into Claude when ready to implement.

---

You are refactoring CodeSentinel to add Workspace Context (personal + team workspaces) without breaking existing functionality.

## CONTEXT

**Codebase:**
- Backend: Fastify + TypeScript + Supabase (PostgreSQL)
- Frontend: Next.js 14 + React + TypeScript
- Current State: All resources (repositories, scans, vulnerabilities) are scoped by `user_id`
- Goal: Resources scoped by `workspace_id` (either personal or team workspace)

**Architecture Pattern:**
- Middleware chain: `verifyAuth` → `loadProfile` → `requireAuth`/`requireProfile`
- All protected routes extract `userId` from `request.profile!.id`
- Database queries filter by `.eq('user_id', userId)`
- Frontend uses `useAuth` hook, no workspace context exists

## CRITICAL CONSTRAINTS

1. **DO NOT change route URLs** - Keep all `/api/*` routes exactly as they are
2. **DO NOT break API contracts** - Request/response shapes stay the same, add `X-Workspace-ID` header
3. **DO NOT remove `user_id` columns** - Keep for migration period, add `workspace_id` alongside
4. **Preserve authorization logic** - All existing guards and checks must continue working
5. **Backward compatibility** - During migration, support both `user_id` and `workspace_id` queries

## DATABASE SCHEMA CHANGES

### 1. Create `workspaces` Table

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'team')),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'Free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT workspace_owner_check CHECK (
    (type = 'personal' AND owner_id IS NOT NULL AND team_id IS NULL) OR
    (type = 'team' AND team_id IS NOT NULL)
  )
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspaces_team ON workspaces(team_id);
```

### 2. Add `workspace_id` Column to Existing Tables

```sql
ALTER TABLE repositories ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE scans ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE vulnerabilities_sast ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE vulnerabilities_sca ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE vulnerabilities_secrets ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE vulnerabilities_iac ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE vulnerabilities_container ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE scan_settings ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE integrations ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE usage_tracking ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Create indexes
CREATE INDEX idx_repositories_workspace ON repositories(workspace_id);
CREATE INDEX idx_scans_workspace ON scans(workspace_id);
CREATE INDEX idx_vulnerabilities_sast_workspace ON vulnerabilities_sast(workspace_id);
CREATE INDEX idx_vulnerabilities_sca_workspace ON vulnerabilities_sca(workspace_id);
CREATE INDEX idx_vulnerabilities_secrets_workspace ON vulnerabilities_secrets(workspace_id);
CREATE INDEX idx_vulnerabilities_iac_workspace ON vulnerabilities_iac(workspace_id);
CREATE INDEX idx_vulnerabilities_container_workspace ON vulnerabilities_container(workspace_id);
CREATE INDEX idx_scan_settings_workspace ON scan_settings(workspace_id);
CREATE INDEX idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX idx_usage_tracking_workspace ON usage_tracking(workspace_id);
```

### 3. Data Migration Script

```sql
-- Create personal workspace for each existing user
INSERT INTO workspaces (name, slug, type, owner_id, plan)
SELECT 
  COALESCE(full_name || '''s Workspace', 'My Workspace'),
  'user-' || id,
  'personal',
  id,
  plan
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces WHERE owner_id = users.id AND type = 'personal'
);

-- Migrate repositories to personal workspaces
UPDATE repositories r
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = r.user_id 
  AND w.type = 'personal'
  AND r.workspace_id IS NULL;

-- Migrate scans
UPDATE scans s
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = s.user_id 
  AND w.type = 'personal'
  AND s.workspace_id IS NULL;

-- Migrate vulnerabilities (all 5 tables)
UPDATE vulnerabilities_sast v
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = v.user_id 
  AND w.type = 'personal'
  AND v.workspace_id IS NULL;

-- Repeat for: vulnerabilities_sca, vulnerabilities_secrets, vulnerabilities_iac, vulnerabilities_container

-- Migrate scan_settings
UPDATE scan_settings ss
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = ss.user_id 
  AND w.type = 'personal'
  AND ss.workspace_id IS NULL;

-- Migrate integrations
UPDATE integrations i
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = i.user_id 
  AND w.type = 'personal'
  AND i.workspace_id IS NULL;

-- Migrate usage_tracking
UPDATE usage_tracking ut
SET workspace_id = w.id
FROM workspaces w
WHERE w.owner_id = ut.user_id 
  AND w.type = 'personal'
  AND ut.workspace_id IS NULL;
```

## BACKEND IMPLEMENTATION

### File 1: `backend/src/middleware/workspace.ts` (CREATE)

Create new middleware file:

```typescript
// src/middleware/workspace.ts
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware: Resolve workspace from header, query param, or default to personal
 * Attaches workspace to request
 * Requires loadProfile to have run first
 */
export async function resolveWorkspace(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.profile) {
        request.log.debug("No profile found, skipping workspace resolution");
        return; // Will be caught by requireProfile
    }

    const userId = request.profile.id;

    // Priority: Header > Query > Default to personal
    const workspaceId =
        (request.headers['x-workspace-id'] as string) ||
        ((request.query as any)?.workspace_id as string) ||
        null;

    if (workspaceId) {
        // Verify user has access to this workspace
        const { data: workspace, error } = await request.server.supabase
            .from('workspaces')
            .select(`
                *,
                team:teams!workspaces_team_id_fkey(
                    id,
                    team_members!inner(user_id, status)
                )
            `)
            .eq('id', workspaceId)
            .single();

        if (error || !workspace) {
            request.log.warn({ workspaceId, error }, "Workspace not found");
            throw request.server.httpErrors.notFound('Workspace not found');
        }

        // Check access: personal workspace owner OR team member
        const isPersonalOwner = workspace.type === 'personal' && workspace.owner_id === userId;
        const isTeamMember = workspace.type === 'team' && 
            workspace.team?.team_members?.some((m: any) => m.user_id === userId && m.status === 'active');

        if (!isPersonalOwner && !isTeamMember) {
            request.log.warn({ workspaceId, userId }, "Access denied to workspace");
            throw request.server.httpErrors.forbidden('Access denied to workspace');
        }

        request.workspace = workspace;
        request.log.debug({ workspaceId: workspace.id, type: workspace.type }, "Workspace resolved");
    } else {
        // Default: Get or create personal workspace
        let { data: personalWorkspace, error: fetchError } = await request.server.supabase
            .from('workspaces')
            .select('*')
            .eq('owner_id', userId)
            .eq('type', 'personal')
            .single();

        if (fetchError || !personalWorkspace) {
            // Create personal workspace if it doesn't exist
            const { data: user } = await request.server.supabase
                .from('users')
                .select('full_name, plan')
                .eq('id', userId)
                .single();

            const { data: newWorkspace, error: createError } = await request.server.supabase
                .from('workspaces')
                .insert({
                    name: `${user?.full_name || 'My'}'s Workspace`,
                    slug: `user-${userId}`,
                    type: 'personal',
                    owner_id: userId,
                    plan: user?.plan || 'Free',
                })
                .select()
                .single();

            if (createError || !newWorkspace) {
                request.log.error({ createError, userId }, "Failed to create personal workspace");
                throw request.server.httpErrors.internalServerError('Failed to create personal workspace');
            }

            personalWorkspace = newWorkspace;
        }

        request.workspace = personalWorkspace;
        request.log.debug({ workspaceId: personalWorkspace.id }, "Default personal workspace resolved");
    }
}

/**
 * GATEKEEPER: Require workspace resolved
 * Blocks request if workspace not loaded by resolveWorkspace
 */
export async function requireWorkspace(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.workspace) {
        throw request.server.httpErrors.badRequest('Workspace context required');
    }
}
```

### File 2: `backend/src/types/fastify.d.ts` (MODIFY)

Add workspace type to existing file:

```typescript
// Add to existing FastifyRequest interface
declare module 'fastify' {
    interface FastifyRequest {
        workspace?: {
            id: string;
            name: string;
            slug: string;
            type: 'personal' | 'team';
            owner_id: string | null;
            team_id: string | null;
            plan: string;
            settings: any;
            created_at: string;
            updated_at: string;
        };
    }
}
```

### File 3: Update All Service Files

**Pattern for ALL service files:**

1. **Replace `userId` parameter with `workspaceId`** in function signatures
2. **Replace `.eq('user_id', userId)` with `.eq('workspace_id', workspaceId)`** in queries
3. **Keep ownership verification** - Still check `user_id` for mutations to verify user owns the resource

**Example transformation (`repositories/service.ts`):**

```typescript
// OLD:
export async function getUserRepositories(
    fastify: FastifyInstance,
    userId: string,
    options: {...}
) {
    let query = fastify.supabase
        .from("repositories")
        .select("*", { count: "exact" })
        .eq("user_id", userId)  // <-- CHANGE THIS
        .order("created_at", { ascending: false });
    // ...
}

// NEW:
export async function getWorkspaceRepositories(
    fastify: FastifyInstance,
    workspaceId: string,  // <-- CHANGE PARAMETER
    options: {...}
) {
    let query = fastify.supabase
        .from("repositories")
        .select("*", { count: "exact" })
        .eq("workspace_id", workspaceId)  // <-- CHANGE THIS
        .order("created_at", { ascending: false });
    // ...
}
```

**Files to update with this pattern:**
- `backend/src/modules/repositories/service.ts`
- `backend/src/modules/scans/service.ts`
- `backend/src/modules/vulnerability/service.ts`
- `backend/src/modules/dashboard/service.ts`
- `backend/src/modules/integrations/service.ts`
- `backend/src/modules/entitlements/service.ts`
- `backend/src/modules/settings/scan-settings/service.ts`

### File 4: Update All Controller Files

**Pattern for ALL controller files:**

1. **Add `resolveWorkspace` to preHandler** (after `loadProfile`)
2. **Extract `workspaceId` from `request.workspace!.id`**
3. **Pass `workspaceId` to service functions instead of `userId`**

**Example transformation (`repositories/controller.ts`):**

```typescript
// OLD:
export async function listRepositoriesController(
    request: FastifyRequest<{ Querystring: any }>,
    reply: FastifyReply
) {
    const userId = request.profile!.id;  // <-- REMOVE
    const params = listRepositoriesSchema.parse(request.query);
    const result = await service.listRepositories(request.server, userId, params);  // <-- CHANGE
    return reply.send(result);
}

// NEW:
export async function listRepositoriesController(
    request: FastifyRequest<{ Querystring: any }>,
    reply: FastifyReply
) {
    const workspaceId = request.workspace!.id;  // <-- NEW
    const params = listRepositoriesSchema.parse(request.query);
    const result = await service.listRepositories(request.server, workspaceId, params);  // <-- CHANGE
    return reply.send(result);
}
```

**Files to update:**
- `backend/src/modules/repositories/controller.ts`
- `backend/src/modules/scans/controller.ts`
- `backend/src/modules/vulnerability/controller.ts`
- `backend/src/modules/dashboard/controller.ts`
- `backend/src/modules/integrations/controller.ts`

### File 5: Update All Route Files

**Pattern for ALL route files:**

Add `resolveWorkspace` to preHandler array:

```typescript
// OLD:
fastify.get(
    "/",
    {
        preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
    },
    async (req, reply) => controller.listRepositoriesController(req, reply)
);

// NEW:
fastify.get(
    "/",
    {
        preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile, resolveWorkspace],
    },
    async (req, reply) => controller.listRepositoriesController(req, reply)
);
```

**Files to update:**
- `backend/src/modules/repositories/routes.ts`
- `backend/src/modules/scans/routes.ts`
- `backend/src/modules/vulnerability/routes.ts`
- `backend/src/modules/dashboard/routes.ts`
- `backend/src/modules/integrations/routes.ts`

### File 6: Update Team Service

**File: `backend/src/modules/teams/service.ts`**

Add function to create team workspace:

```typescript
/**
 * Create workspace for a team
 */
async createTeamWorkspace(teamId: string): Promise<any> {
    const { data: team, error: teamError } = await this.fastify.supabase
        .from('teams')
        .select('name, slug, plan')
        .eq('id', teamId)
        .single();

    if (teamError || !team) {
        throw this.fastify.httpErrors.notFound('Team not found');
    }

    // Check if workspace already exists
    const { data: existing } = await this.fastify.supabase
        .from('workspaces')
        .select('id')
        .eq('team_id', teamId)
        .single();

    if (existing) {
        return existing;
    }

    const { data: workspace, error } = await this.fastify.supabase
        .from('workspaces')
        .insert({
            name: `${team.name} Workspace`,
            slug: `team-${team.slug}`,
            type: 'team',
            team_id: teamId,
            plan: team.plan || 'Team',
        })
        .select()
        .single();

    if (error || !workspace) {
        this.fastify.log.error({ error, teamId }, 'Failed to create team workspace');
        throw this.fastify.httpErrors.internalServerError('Failed to create team workspace');
    }

    this.fastify.log.info({ workspaceId: workspace.id, teamId }, 'Team workspace created');
    return workspace;
}
```

Update `createTeam` to call this:

```typescript
async createTeam(userId: string, data: {...}): Promise<Team> {
    // ... existing team creation code ...
    
    // Create workspace for team
    await this.createTeamWorkspace(team.id);
    
    return team;
}
```

### File 7: Update Auth Service

**File: `backend/src/modules/auth/service.ts`**

Add function to create personal workspace:

```typescript
/**
 * Create personal workspace for user
 */
export async function createPersonalWorkspace(
    fastify: FastifyInstance,
    userId: string
): Promise<any> {
    // Check if exists
    const { data: existing } = await fastify.supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', userId)
        .eq('type', 'personal')
        .single();

    if (existing) {
        return existing;
    }

    const { data: user } = await fastify.supabase
        .from('users')
        .select('full_name, plan')
        .eq('id', userId)
        .single();

    const { data: workspace, error } = await fastify.supabase
        .from('workspaces')
        .insert({
            name: `${user?.full_name || 'My'}'s Workspace`,
            slug: `user-${userId}`,
            type: 'personal',
            owner_id: userId,
            plan: user?.plan || 'Free',
        })
        .select()
        .single();

    if (error || !workspace) {
        fastify.log.error({ error, userId }, 'Failed to create personal workspace');
        throw fastify.httpErrors.internalServerError('Failed to create personal workspace');
    }

    fastify.log.info({ workspaceId: workspace.id, userId }, 'Personal workspace created');
    return workspace;
}
```

Update `syncUser` to ensure workspace exists:

```typescript
export async function syncUser(...) {
    // ... existing sync logic ...
    
    // Ensure personal workspace exists
    await createPersonalWorkspace(fastify, id).catch((err) => {
        fastify.log.warn({ err, userId: id }, 'Failed to create personal workspace (non-fatal)');
    });
    
    return getUserById(fastify, id);
}
```

## FRONTEND IMPLEMENTATION

### File 1: `frontend/hooks/use-workspace.tsx` (CREATE)

Create new workspace provider:

```typescript
"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./use-auth";
import { apiFetch } from "@/lib/api";

interface Workspace {
  id: string;
  name: string;
  type: 'personal' | 'team';
  plan: string;
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // TODO: Replace with actual API endpoint when available
      // For now, create personal workspace client-side
      const personalWorkspace: Workspace = {
        id: `personal-${user.id}`,
        name: `${user.full_name || 'My'}'s Workspace`,
        type: 'personal',
        plan: user.plan || 'Free',
      };

      setWorkspaces([personalWorkspace]);

      // Load last active workspace from localStorage
      const lastActiveId = localStorage.getItem('active_workspace_id');
      if (lastActiveId && lastActiveId === personalWorkspace.id) {
        setWorkspace(personalWorkspace);
      } else {
        setWorkspace(personalWorkspace);
        localStorage.setItem('active_workspace_id', personalWorkspace.id);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const targetWorkspace = workspaces.find(w => w.id === workspaceId);
    if (targetWorkspace) {
      setWorkspace(targetWorkspace);
      localStorage.setItem('active_workspace_id', workspaceId);
      // Refresh page to reload data with new workspace
      window.location.reload();
    }
  }, [workspaces]);

  const refreshWorkspaces = useCallback(async () => {
    await loadWorkspaces();
  }, [loadWorkspaces]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces,
        loading,
        switchWorkspace,
        refreshWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
};
```

### File 2: `frontend/lib/api.ts` (MODIFY)

Add workspace header to requests:

```typescript
export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = false, headers = {}, body, ...restOptions } = options;

  const fetchHeaders: Record<string, string> = {};

  // Add auth token if required
  if (requireAuth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Authentication required");
    }

    fetchHeaders["Authorization"] = `Bearer ${session.access_token}`;

    // Add workspace header if available
    const activeWorkspaceId = localStorage.getItem('active_workspace_id');
    if (activeWorkspaceId) {
      fetchHeaders['X-Workspace-ID'] = activeWorkspaceId;
    }
  }

  // ... rest of existing code ...
}
```

### File 3: `frontend/app/layout.tsx` (MODIFY)

Wrap app with WorkspaceProvider:

```typescript
// Add import
import { WorkspaceProvider } from "@/hooks/use-workspace";

// Wrap children with WorkspaceProvider (after AuthProvider)
<AuthProvider>
  <WorkspaceProvider>
    {children}
  </WorkspaceProvider>
</AuthProvider>
```

### File 4: `frontend/components/dashboard/layout/dashboard-shell.tsx` (MODIFY)

Add workspace switcher to header:

```typescript
// Add import
import { useWorkspace } from "@/hooks/use-workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// In component, add workspace switcher:
const { workspace, workspaces, switchWorkspace } = useWorkspace();

// In header, add:
<Select
  value={workspace?.id || ''}
  onValueChange={switchWorkspace}
>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Select workspace" />
  </SelectTrigger>
  <SelectContent>
    {workspaces.map((w) => (
      <SelectItem key={w.id} value={w.id}>
        {w.name} {w.type === 'team' && '(Team)'}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

## IMPLEMENTATION CHECKLIST

- [ ] Run database migration (create workspaces table, add columns)
- [ ] Run data migration (create personal workspaces, migrate data)
- [ ] Create `backend/src/middleware/workspace.ts`
- [ ] Update `backend/src/types/fastify.d.ts`
- [ ] Update all service files (repositories, scans, vulnerabilities, dashboard, integrations, entitlements)
- [ ] Update all controller files
- [ ] Update all route files (add resolveWorkspace to preHandler)
- [ ] Update team service (createTeamWorkspace)
- [ ] Update auth service (createPersonalWorkspace)
- [ ] Create `frontend/hooks/use-workspace.tsx`
- [ ] Update `frontend/lib/api.ts` (add header)
- [ ] Update `frontend/app/layout.tsx` (add provider)
- [ ] Update `frontend/components/dashboard/layout/dashboard-shell.tsx` (add switcher)
- [ ] Test: Personal workspace auto-created
- [ ] Test: Team workspace created on team creation
- [ ] Test: Resources filtered by workspace
- [ ] Test: Workspace switcher works
- [ ] Test: API calls include workspace header

## TESTING NOTES

1. **Backward Compatibility:** During migration, queries should support both `user_id` and `workspace_id` filters
2. **Default Behavior:** If no `X-Workspace-ID` header, default to user's personal workspace
3. **Authorization:** Verify user has access to workspace before allowing operations
4. **Data Integrity:** Ensure all existing data is migrated to personal workspaces

---

**END OF PROMPT**

