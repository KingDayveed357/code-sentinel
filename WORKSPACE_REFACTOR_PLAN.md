# CodeSentinel Workspace Context Refactor Plan

## STEP 1: Current-State Analysis

### User Identity Resolution

**Backend:**

- **Middleware Chain:** `verifyAuth` → `loadProfile` → `requireAuth`/`requireProfile`
- **Location:** `backend/src/middleware/auth.ts`
- **Flow:**
  1. `verifyAuth`: Extracts JWT from Authorization header, verifies via Supabase Auth, attaches `request.supabaseUser`
  2. `loadProfile`: Loads user profile from `public.users` table, attaches `request.profile`
- **User Profile Type:** `UserProfile` (id, email, full_name, avatar_url, plan, onboarding_completed, role)
- **Attached to Request:** `request.supabaseUser` (Supabase auth user) and `request.profile` (public.users record)

**Frontend:**

- **Provider:** `frontend/hooks/use-auth.tsx` - `AuthProvider`
- **State:** Stores user profile fetched from `/api/auth/me`
- **Persistence:** Session stored in Supabase client, profile fetched on mount and auth state changes
- **No workspace context exists**

### Authorization Decisions

**Guards (Gatekeepers):**

- **File:** `backend/src/middleware/gatekeepers.ts`
- **Functions:**
  - `requireAuth`: Blocks if no `supabaseUser`
  - `requireProfile`: Blocks if no `profile`
  - `requireOnboardingCompleted`: Blocks if onboarding incomplete
  - `requireTeamPlan`: Blocks Free plan users
  - `requireEnterprisePlan`: Blocks non-Enterprise users
  - `requirePlan(allowedPlans)`: Flexible plan checker
  - `requireRole(allowedRoles)`: Role-based access (currently unused)

**Authorization Pattern:**

- All protected routes use: `[verifyAuth, loadProfile, requireAuth, requireProfile]`
- Authorization checks happen in controllers/services using `request.profile!.id`
- **No workspace-level authorization exists**

### Ownership Model

**Current Ownership Pattern:**

- **User-scoped resources:**

  - `repositories`: `user_id` (nullable `team_id` exists but unused)
  - `scans`: `user_id`
  - `vulnerabilities_*`: `user_id` (all 5 tables: sast, sca, secrets, iac, container)
  - `integrations`: `user_id`
  - `scan_settings`: `user_id`
  - `usage_tracking`: `user_id`

- **Team-scoped resources (partially implemented):**
  - `teams`: `owner_id` (creator)
  - `team_members`: `team_id`, `user_id`
  - `team_invitations`: `team_id`
  - `vulnerability_assignments`: `team_id` (in `vulnerabilities-team` module)

**Key Finding:**

- `repositories` table has `team_id` column (nullable) but it's always set to `null` in `importRepositories`
- Teams exist but are separate from core resources (repos, scans, vulnerabilities)
- No unified workspace concept

### API Route Scope Inference

**Pattern:**

- All routes extract `userId` from `request.profile!.id`
- Database queries filter by `.eq('user_id', userId)`
- No URL parameters for workspace/team context
- Team routes use `/api/teams/:teamId` but don't affect other resources

**Examples:**

- `GET /api/repositories` → filters by `user_id`
- `GET /api/scans/:scanId` → verifies `user_id` matches
- `GET /api/dashboard/overview` → aggregates by `user_id`
- `POST /api/repositories/import` → creates with `user_id`, `team_id: null`

### Frontend State Assumptions

**Current Assumptions:**

1. **Single user context:** `useAuth` provides one user profile
2. **No workspace selector:** Dashboard shows user's personal data only
3. **Team pages are separate:** `/dashboard/teams` is isolated, doesn't affect other pages
4. **API calls don't include workspace:** All API calls implicitly use user's personal scope
5. **No workspace persistence:** No localStorage/cookie for active workspace

**Components Affected:**

- `DashboardShell`: No workspace switcher
- `DashboardOverview`: Fetches user-scoped stats
- `ProjectsList`: Lists user's repositories
- All API clients: No workspace header/parameter

---

## STEP 2: Workspace Model for CodeSentinel

### What is a Workspace?

A **Workspace** is a container for resources (repositories, scans, vulnerabilities) that can be either:

1. **Personal Workspace:** Automatically created per user, owned by that user
2. **Team Workspace:** Created from an existing Team, owned by the team

### Workspace-Scoped Resources

**Become workspace-scoped:**

- ✅ **repositories** → `workspace_id` (replaces `user_id` + `team_id`)
- ✅ **scans** → `workspace_id` (replaces `user_id`)
- ✅ **vulnerabilities\_\*** → `workspace_id` (replaces `user_id`)
- ✅ **scan_settings** → `workspace_id` (replaces `user_id`)
- ✅ **integrations** → `workspace_id` (replaces `user_id`)
- ✅ **usage_tracking** → `workspace_id` (replaces `user_id`)

**Remain user-scoped:**

- ✅ **users** (profile data)
- ✅ **teams** (team metadata)
- ✅ **team_members** (membership)
- ✅ **team_invitations** (invitations)
- ✅ **integrations** (GitHub tokens) - **WAIT:** These should be workspace-scoped for team workspaces

**Special Cases:**

- **integrations:** Should be workspace-scoped (team workspaces need shared GitHub tokens)
- **billing:** User-scoped (billing is per user account, not workspace)
- **feature entitlements:** Workspace-scoped (plan limits apply per workspace)

### What Replaces `user_id` Checks?

**Authorization Pattern:**

1. **Workspace membership check:** User must be member of workspace
   - Personal workspace: User is owner
   - Team workspace: User is in `team_members` for that team
2. **Resource access:** Filter by `workspace_id` instead of `user_id`
3. **Ownership checks:** For mutations, verify user has permission in workspace

**New Middleware:**

- `resolveWorkspace`: Extracts workspace from header/query/param, verifies membership
- `requireWorkspaceAccess`: Ensures user can access the workspace

### Personal vs Team Workspaces

**Personal Workspace:**

- Auto-created on user signup
- `type: 'personal'`
- `owner_id: user_id`
- `team_id: null`
- User is always owner

**Team Workspace:**

- Created when team is created (or on-demand)
- `type: 'team'`
- `owner_id: null` (or team owner)
- `team_id: <team_uuid>`
- Access via `team_members` table

**Logic Differences:**

- Personal: Direct ownership check
- Team: Membership check via `team_members` join
- Both: Resources filtered by `workspace_id`

---

## STEP 3: Backend Refactor Plan

### Database Schema Changes

**New Table: `workspaces`**

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

**Migration: Add `workspace_id` to existing tables**

```sql
-- Add workspace_id column (nullable initially)
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
-- ... (similar for all tables)

-- Data migration: Create personal workspaces and migrate data
-- (See migration script section)
```

### New Middleware

**File: `backend/src/middleware/workspace.ts` (NEW)**

```typescript
// Resolve workspace from header, query param, or default to personal
export async function resolveWorkspace(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.profile) return; // Will be caught by requireProfile

  const userId = request.profile.id;

  // Priority: Header > Query > Default
  const workspaceId =
    (request.headers["x-workspace-id"] as string) ||
    (request.query as any)?.workspace_id ||
    null;

  if (workspaceId) {
    // Verify user has access to this workspace
    const { data: workspace } = await request.server.supabase
      .from("workspaces")
      .select("*, team:teams(id, team_members!inner(user_id))")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      throw request.server.httpErrors.notFound("Workspace not found");
    }

    // Check access: personal workspace owner OR team member
    const hasAccess =
      (workspace.type === "personal" && workspace.owner_id === userId) ||
      (workspace.type === "team" &&
        workspace.team?.team_members?.some((m: any) => m.user_id === userId));

    if (!hasAccess) {
      throw request.server.httpErrors.forbidden("Access denied to workspace");
    }

    request.workspace = workspace;
  } else {
    // Default: Get or create personal workspace
    let { data: personalWorkspace } = await request.server.supabase
      .from("workspaces")
      .select("*")
      .eq("owner_id", userId)
      .eq("type", "personal")
      .single();

    if (!personalWorkspace) {
      // Create personal workspace
      const { data: newWorkspace } = await request.server.supabase
        .from("workspaces")
        .insert({
          name: `${request.profile.full_name || "My"}'s Workspace`,
          slug: `user-${userId}`,
          type: "personal",
          owner_id: userId,
          plan: request.profile.plan,
        })
        .select()
        .single();

      personalWorkspace = newWorkspace;
    }

    request.workspace = personalWorkspace;
  }
}

// Gatekeeper: Require workspace resolved
export async function requireWorkspace(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.workspace) {
    throw request.server.httpErrors.badRequest("Workspace context required");
  }
}
```

**File: `backend/src/types/fastify.d.ts` (MODIFY)**

Add to existing types:

```typescript
declare module "fastify" {
  interface FastifyRequest {
    workspace?: {
      id: string;
      name: string;
      type: "personal" | "team";
      owner_id: string | null;
      team_id: string | null;
      plan: string;
    };
  }
}
```

### Backend File Modifications

#### **1. `backend/src/middleware/auth.ts`**

**Why:** No changes needed - auth flow remains the same

#### **2. `backend/src/middleware/gatekeepers.ts`**

**Why:** No changes needed - existing guards still work

#### **3. `backend/src/modules/repositories/service.ts`**

**Changes:**

- Replace `user_id` filters with `workspace_id`
- Update `importRepositories`: Set `workspace_id` instead of `user_id` + `team_id: null`
- Update `getUserRepositories`: Rename to `getWorkspaceRepositories`, filter by `workspace_id`
- Update `getRepositoryById`: Add workspace membership check
- Update `deleteRepository`: Add workspace membership check
- Update `updateRepository`: Add workspace membership check

**Logic:**

```typescript
// OLD:
.eq('user_id', userId)

// NEW:
.eq('workspace_id', request.workspace.id)
// + verify user has access to workspace (handled by middleware)
```

#### **4. `backend/src/modules/repositories/controller.ts`**

**Changes:**

- Add `resolveWorkspace` to preHandler
- Remove `userId` extraction (use `request.workspace.id` for queries)
- Pass `workspaceId` to service functions instead of `userId`

**Example:**

```typescript
// OLD:
const userId = request.profile!.id;
const result = await service.listRepositories(request.server, userId, params);

// NEW:
const workspaceId = request.workspace!.id;
const result = await service.listRepositories(
  request.server,
  workspaceId,
  params
);
```

#### **5. `backend/src/modules/repositories/routes.ts`**

**Changes:**

- Add `resolveWorkspace` to all route preHandlers (after `loadProfile`)

#### **6. `backend/src/modules/scans/service.ts`**

**Changes:**

- Replace all `user_id` filters with `workspace_id`
- Update `startScan`: Use `workspace_id` instead of `user_id`
- Update `getScanHistory`: Filter by `workspace_id`
- Update `getScanStatus`: Verify scan belongs to workspace
- Update `getScanLogs`: Verify scan belongs to workspace
- Update `cancelScan`: Verify scan belongs to workspace
- Update limit checks: Use `workspace_id` for usage tracking

**Key Change:**

```typescript
// OLD:
.eq('user_id', userId)

// NEW:
.eq('workspace_id', workspaceId)
```

#### **7. `backend/src/modules/scans/controller.ts`**

**Changes:**

- Add `resolveWorkspace` to preHandler
- Pass `workspaceId` to service functions

#### **8. `backend/src/modules/scans/routes.ts`**

**Changes:**

- Add `resolveWorkspace` to all route preHandlers

#### **9. `backend/src/modules/vulnerability/service.ts`**

**Changes:**

- Replace `user_id` filters with `workspace_id` in all vulnerability table queries
- Update `getVulnerabilitiesByScan`: Filter by `workspace_id`

#### **10. `backend/src/modules/vulnerability/controller.ts`**

**Changes:**

- Add `resolveWorkspace` to preHandler

#### **11. `backend/src/modules/vulnerability/routes.ts`**

**Changes:**

- Add `resolveWorkspace` to all route preHandlers

#### **12. `backend/src/modules/dashboard/service.ts`**

**Changes:**

- Replace all `user_id` filters with `workspace_id`
- Update `getDashboardStats`: Aggregate by `workspace_id`
- Update `getCriticalVulnerabilities`: Filter by `workspace_id`
- Update `getRecentScans`: Filter by `workspace_id`
- Update `getSecurityScore`: Filter by `workspace_id`

#### **13. `backend/src/modules/dashboard/controller.ts`**

**Changes:**

- Add `resolveWorkspace` to preHandler

#### **14. `backend/src/modules/dashboard/routes.ts`**

**Changes:**

- Add `resolveWorkspace` to all route preHandlers

#### **15. `backend/src/modules/integrations/service.ts`**

**Changes:**

- Replace `user_id` filters with `workspace_id`
- Update integration creation: Set `workspace_id`

#### **16. `backend/src/modules/integrations/controller.ts`**

**Changes:**

- Add `resolveWorkspace` to preHandler

#### **17. `backend/src/modules/integrations/routes.ts`**

**Changes:**

- Add `resolveWorkspace` to all route preHandlers

#### **18. `backend/src/modules/entitlements/service.ts`**

**Changes:**

- Update `checkRepositoryLimit`: Use `workspace_id` instead of `user_id`
- Update `checkScanLimit`: Use `workspace_id` for usage tracking
- Update `getOrCreateUsageRecord`: Use `workspace_id`

#### **19. `backend/src/modules/settings/scan-settings/service.ts`**

**Changes:**

- Replace `user_id` with `workspace_id`

#### **20. `backend/src/modules/teams/service.ts`**

**Changes:**

- **NEW:** `createTeamWorkspace`: Create workspace when team is created
- Update `createTeam`: Call `createTeamWorkspace` after team creation

**New Function:**

```typescript
async createTeamWorkspace(teamId: string): Promise<Workspace> {
  const { data: team } = await this.fastify.supabase
    .from('teams')
    .select('name, slug')
    .eq('id', teamId)
    .single();

  const { data: workspace } = await this.fastify.supabase
    .from('workspaces')
    .insert({
      name: `${team.name} Workspace`,
      slug: `team-${team.slug}`,
      type: 'team',
      team_id: teamId,
      plan: 'Team', // or from team.plan
    })
    .select()
    .single();

  return workspace;
}
```

#### **21. `backend/src/modules/auth/service.ts`**

**Changes:**

- **NEW:** `createPersonalWorkspace`: Create workspace on user signup
- Update `syncUser`: Call `createPersonalWorkspace` if workspace doesn't exist

**New Function:**

```typescript
export async function createPersonalWorkspace(
  fastify: FastifyInstance,
  userId: string,
  userPlan: string
): Promise<Workspace> {
  const { data: user } = await fastify.supabase
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();

  const { data: workspace } = await fastify.supabase
    .from("workspaces")
    .insert({
      name: `${user?.full_name || "My"}'s Workspace`,
      slug: `user-${userId}`,
      type: "personal",
      owner_id: userId,
      plan: userPlan,
    })
    .select()
    .single();

  return workspace;
}
```

#### **22. `backend/src/modules/webhook/service.ts`**

**Changes:**

- Verify repository belongs to workspace (via workspace_id)

#### **23. `backend/src/modules/github-issues/service.ts`**

**Changes:**

- Verify scan/repository belongs to workspace

---

## STEP 4: Frontend Refactor Plan

### New Workspace Provider

**File: `frontend/hooks/use-workspace.tsx` (NEW)**

```typescript
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./use-auth";

interface Workspace {
  id: string;
  name: string;
  type: "personal" | "team";
  plan: string;
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined
);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user's workspaces
  const loadWorkspaces = useCallback(async () => {
    if (!user) {
      // TODO: Call API to get workspaces
      // For now, create personal workspace if needed
      const personalWorkspace: Workspace = {
        id: `personal-${user.id}`,
        name: `${user.full_name || "My"}'s Workspace`,
        type: "personal",
        plan: user.plan || "Free",
      };
      setWorkspaces([personalWorkspace]);

      // Load last active workspace from localStorage
      const lastActiveId = localStorage.getItem("active_workspace_id");
      if (lastActiveId && workspaces.find((w) => w.id === lastActiveId)) {
        setWorkspace(workspaces.find((w) => w.id === lastActiveId)!);
      } else {
        setWorkspace(personalWorkspace);
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const targetWorkspace = workspaces.find((w) => w.id === workspaceId);
      if (targetWorkspace) {
        setWorkspace(targetWorkspace);
        localStorage.setItem("active_workspace_id", workspaceId);
        // Refresh page data
        window.location.reload(); // Or use router.refresh()
      }
    },
    [workspaces]
  );

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
  if (!ctx)
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
};
```

### API Client Modifications

**File: `frontend/lib/api.ts` (MODIFY)**

Add workspace header to all requests:

```typescript
export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  // ... existing code ...

  // Add workspace header if available
  const activeWorkspaceId = localStorage.getItem("active_workspace_id");
  if (activeWorkspaceId && requireAuth) {
    fetchHeaders["X-Workspace-ID"] = activeWorkspaceId;
  }

  // ... rest of function ...
}
```

### Frontend File Modifications

#### **1. `frontend/app/layout.tsx`**

**Changes:**

- Wrap app with `WorkspaceProvider` (after `AuthProvider`)

#### **2. `frontend/components/dashboard/layout/dashboard-shell.tsx`**

**Changes:**

- Add workspace switcher dropdown in header
- Display current workspace name
- Show workspace type badge (Personal/Team)

**New Component:**

```typescript
<WorkspaceSwitcher /> // In header, next to theme toggle
```

#### **3. `frontend/lib/api/repositories.ts`**

**Changes:**

- No API changes needed (workspace inferred from header)

#### **4. `frontend/lib/api/scans.ts`**

**Changes:**

- No API changes needed

#### **5. `frontend/lib/api/vulnerabilities.ts`**

**Changes:**

- No API changes needed

#### **6. `frontend/lib/api/dashboard.ts`**

**Changes:**

- No API changes needed

#### **7. `frontend/components/dashboard/overview/dashboard-overview.tsx`**

**Changes:**

- Use `useWorkspace` to get current workspace
- Display workspace name in header
- No API call changes (workspace inferred from header)

#### **8. `frontend/components/dashboard/project/projects-list.tsx`**

**Changes:**

- Use `useWorkspace` hook
- Display workspace context in UI

#### **9. `frontend/app/dashboard/teams/page.tsx`**

**Changes:**

- After team creation, create workspace and switch to it
- Show team workspaces in list

#### **10. `frontend/app/dashboard/teams/[teamId]/page.tsx`**

**Changes:**

- Add "Switch to Workspace" button
- Show workspace info if team has workspace

---

## STEP 5: Claude Handoff Prompt

```
You are refactoring CodeSentinel to add Workspace Context (personal + team workspaces).

CONTEXT:
- Backend: Fastify + Supabase
- Frontend: Next.js + React
- Current: All resources scoped by user_id
- Goal: Resources scoped by workspace_id (personal or team)

CRITICAL CONSTRAINTS:
1. DO NOT change route URLs
2. DO NOT break API contracts (add headers, don't change request/response shapes)
3. DO NOT remove user_id columns (keep for migration period)
4. Preserve all existing authorization logic
5. Maintain backward compatibility during migration

DATABASE CHANGES REQUIRED:

1. Create `workspaces` table (see schema in plan)
2. Add `workspace_id` column to these tables:
   - repositories
   - scans
   - vulnerabilities_sast, vulnerabilities_sca, vulnerabilities_secrets, vulnerabilities_iac, vulnerabilities_container
   - scan_settings
   - integrations
   - usage_tracking

3. Create migration script that:
   - Creates personal workspace for each existing user
   - Migrates all user's resources to their personal workspace
   - Sets workspace_id = (personal workspace id) where user_id = (user id)

BACKEND FILES TO MODIFY:

1. backend/src/middleware/workspace.ts (CREATE)
   - Implement resolveWorkspace() middleware
   - Implement requireWorkspace() gatekeeper
   - Resolve from X-Workspace-ID header or default to personal

2. backend/src/types/fastify.d.ts (MODIFY)
   - Add request.workspace type

3. backend/src/modules/repositories/service.ts (MODIFY)
   - Replace .eq('user_id', userId) with .eq('workspace_id', workspaceId)
   - Update all functions to accept workspaceId instead of userId
   - Keep user_id checks for ownership verification

4. backend/src/modules/repositories/controller.ts (MODIFY)
   - Add resolveWorkspace to preHandler
   - Pass request.workspace.id to service functions

5. backend/src/modules/repositories/routes.ts (MODIFY)
   - Add resolveWorkspace to all route preHandlers

6. backend/src/modules/scans/service.ts (MODIFY)
   - Replace user_id filters with workspace_id
   - Update all functions to use workspaceId

7. backend/src/modules/scans/controller.ts (MODIFY)
   - Add resolveWorkspace to preHandler

8. backend/src/modules/scans/routes.ts (MODIFY)
   - Add resolveWorkspace to preHandlers

9. backend/src/modules/vulnerability/service.ts (MODIFY)
   - Replace user_id with workspace_id in all queries

10. backend/src/modules/vulnerability/controller.ts (MODIFY)
    - Add resolveWorkspace

11. backend/src/modules/vulnerability/routes.ts (MODIFY)
    - Add resolveWorkspace

12. backend/src/modules/dashboard/service.ts (MODIFY)
    - Replace all user_id filters with workspace_id

13. backend/src/modules/dashboard/controller.ts (MODIFY)
    - Add resolveWorkspace

14. backend/src/modules/dashboard/routes.ts (MODIFY)
    - Add resolveWorkspace

15. backend/src/modules/integrations/service.ts (MODIFY)
    - Replace user_id with workspace_id

16. backend/src/modules/integrations/controller.ts (MODIFY)
    - Add resolveWorkspace

17. backend/src/modules/integrations/routes.ts (MODIFY)
    - Add resolveWorkspace

18. backend/src/modules/entitlements/service.ts (MODIFY)
    - Update to use workspace_id for limits

19. backend/src/modules/settings/scan-settings/service.ts (MODIFY)
    - Replace user_id with workspace_id

20. backend/src/modules/teams/service.ts (MODIFY)
    - Add createTeamWorkspace() function
    - Call it in createTeam()

21. backend/src/modules/auth/service.ts (MODIFY)
    - Add createPersonalWorkspace() function
    - Call it in syncUser() if workspace doesn't exist

FRONTEND FILES TO MODIFY:

1. frontend/hooks/use-workspace.tsx (CREATE)
   - WorkspaceProvider component
   - useWorkspace hook
   - Load workspaces, persist active workspace

2. frontend/lib/api.ts (MODIFY)
   - Add X-Workspace-ID header to requests if active_workspace_id in localStorage

3. frontend/app/layout.tsx (MODIFY)
   - Wrap with WorkspaceProvider

4. frontend/components/dashboard/layout/dashboard-shell.tsx (MODIFY)
   - Add workspace switcher UI
   - Display current workspace

5. frontend/components/dashboard/overview/dashboard-overview.tsx (MODIFY)
   - Use useWorkspace hook

6. frontend/components/dashboard/project/projects-list.tsx (MODIFY)
   - Use useWorkspace hook

7. frontend/app/dashboard/teams/page.tsx (MODIFY)
   - Create workspace when team created
   - Switch to team workspace

IMPLEMENTATION ORDER:

1. Database migration (create workspaces table, add columns)
2. Backend middleware (resolveWorkspace)
3. Backend services (update queries)
4. Backend controllers/routes (add middleware)
5. Frontend provider (WorkspaceProvider)
6. Frontend API client (add header)
7. Frontend UI (workspace switcher)

TESTING CHECKLIST:

- [ ] Personal workspace auto-created on signup
- [ ] Team workspace created when team created
- [ ] Resources filtered by workspace
- [ ] Workspace switcher works
- [ ] API calls include workspace header
- [ ] Backward compatibility (old user_id queries still work during migration)
```

---

## STEP 6: File Batching Strategy for Claude

### Batch 1: Backend Core (MUST PASTE FIRST)

**Why:** These files define the foundation - middleware, types, and core services.

1. `backend/src/types/fastify.d.ts` - Type definitions
2. `backend/src/middleware/auth.ts` - Understand auth flow
3. `backend/src/middleware/gatekeepers.ts` - Understand guards
4. `backend/src/middleware/workspace.ts` - **NEW FILE** - Core workspace logic
5. `backend/src/modules/repositories/service.ts` - Example service pattern
6. `backend/src/modules/repositories/controller.ts` - Example controller pattern
7. `backend/src/modules/repositories/routes.ts` - Example route pattern

**Total:** ~7 files, ~1500 lines

### Batch 2: Backend Services (MUST PASTE)

**Why:** These show the pattern for updating all services.

1. `backend/src/modules/scans/service.ts`
2. `backend/src/modules/scans/controller.ts`
3. `backend/src/modules/scans/routes.ts`
4. `backend/src/modules/vulnerability/service.ts`
5. `backend/src/modules/vulnerability/controller.ts`
6. `backend/src/modules/vulnerability/routes.ts`
7. `backend/src/modules/dashboard/service.ts`
8. `backend/src/modules/dashboard/controller.ts`
9. `backend/src/modules/dashboard/routes.ts`

**Total:** ~9 files, ~2000 lines

### Batch 3: Backend Supporting (OPTIONAL BUT RECOMMENDED)

**Why:** These complete the backend picture.

1. `backend/src/modules/integrations/service.ts`
2. `backend/src/modules/integrations/controller.ts`
3. `backend/src/modules/integrations/routes.ts`
4. `backend/src/modules/entitlements/service.ts`
5. `backend/src/modules/settings/scan-settings/service.ts`
6. `backend/src/modules/teams/service.ts`
7. `backend/src/modules/auth/service.ts`

**Total:** ~7 files, ~1500 lines

### Batch 4: Frontend Core (MUST PASTE)

**Why:** Frontend foundation files.

1. `frontend/hooks/use-auth.tsx` - Understand auth context
2. `frontend/hooks/use-workspace.tsx` - **NEW FILE** - Workspace context
3. `frontend/lib/api.ts` - API client base
4. `frontend/app/layout.tsx` - Root layout
5. `frontend/components/dashboard/layout/dashboard-shell.tsx` - Dashboard shell

**Total:** ~5 files, ~800 lines

### Batch 5: Frontend Components (OPTIONAL)

**Why:** UI components that use workspace.

1. `frontend/components/dashboard/overview/dashboard-overview.tsx`
2. `frontend/components/dashboard/project/projects-list.tsx`
3. `frontend/app/dashboard/teams/page.tsx`

**Total:** ~3 files, ~1000 lines

### Batch 6: Database Schema (MUST PASTE)

**Why:** Critical for understanding data model.

1. Migration SQL script (create workspaces table, add columns)
2. Data migration script (create personal workspaces, migrate data)

**Total:** ~2 files, ~300 lines

---

## Summary

**Total Files to Modify:** ~35 backend files, ~10 frontend files
**New Files:** 2 (workspace middleware, workspace provider)
**Database Changes:** 1 new table, 10 tables modified
**Breaking Changes:** None (backward compatible)
**Migration Strategy:** Gradual - add workspace_id, migrate data, then switch queries

**Estimated Complexity:** High
**Risk Level:** Medium (backward compatible, but touches many files)
**Testing Required:** Extensive (all API endpoints, all UI pages)
