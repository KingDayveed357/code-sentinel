# File Batching Strategy for Claude Context

Because Claude has context limits, paste files in this order. Each batch builds on the previous one.

---

## BATCH 1: Backend Core (MUST PASTE FIRST) ⚠️

**Why:** These files define the foundation - middleware, types, and core service patterns. Claude needs these to understand the architecture.

**Files:**
1. `backend/src/types/fastify.d.ts` - Type definitions (including workspace type)
2. `backend/src/middleware/auth.ts` - Auth middleware (understand current flow)
3. `backend/src/middleware/gatekeepers.ts` - Guards (understand authorization pattern)
4. `backend/src/middleware/workspace.ts` - **NEW FILE** - Workspace middleware (core logic)
5. `backend/src/modules/repositories/service.ts` - Example service (shows pattern)
6. `backend/src/modules/repositories/controller.ts` - Example controller (shows pattern)
7. `backend/src/modules/repositories/routes.ts` - Example routes (shows pattern)

**Estimated Size:** ~1,500 lines
**Critical:** Yes - Without these, Claude won't understand the architecture

---

## BATCH 2: Backend Services (MUST PASTE) ⚠️

**Why:** These show the pattern for updating all services. Claude will apply the same transformation to all.

**Files:**
1. `backend/src/modules/scans/service.ts`
2. `backend/src/modules/scans/controller.ts`
3. `backend/src/modules/scans/routes.ts`
4. `backend/src/modules/vulnerability/service.ts`
5. `backend/src/modules/vulnerability/controller.ts`
6. `backend/src/modules/vulnerability/routes.ts`
7. `backend/src/modules/dashboard/service.ts`
8. `backend/src/modules/dashboard/controller.ts`
9. `backend/src/modules/dashboard/routes.ts`

**Estimated Size:** ~2,000 lines
**Critical:** Yes - These are the main resources that need workspace scoping

---

## BATCH 3: Backend Supporting (OPTIONAL BUT RECOMMENDED) 📋

**Why:** These complete the backend picture. Can be done in a second pass if context is tight.

**Files:**
1. `backend/src/modules/integrations/service.ts`
2. `backend/src/modules/integrations/controller.ts`
3. `backend/src/modules/integrations/routes.ts`
4. `backend/src/modules/entitlements/service.ts`
5. `backend/src/modules/settings/scan-settings/service.ts`
6. `backend/src/modules/teams/service.ts` - **Important:** Needs createTeamWorkspace function
7. `backend/src/modules/auth/service.ts` - **Important:** Needs createPersonalWorkspace function

**Estimated Size:** ~1,500 lines
**Critical:** Medium - Some are important (teams, auth), others can wait

---

## BATCH 4: Frontend Core (MUST PASTE) ⚠️

**Why:** Frontend foundation files. Claude needs to understand the current frontend state.

**Files:**
1. `frontend/hooks/use-auth.tsx` - Understand auth context pattern
2. `frontend/hooks/use-workspace.tsx` - **NEW FILE** - Workspace context (create this)
3. `frontend/lib/api.ts` - API client base (needs header modification)
4. `frontend/app/layout.tsx` - Root layout (needs provider)
5. `frontend/components/dashboard/layout/dashboard-shell.tsx` - Dashboard shell (needs switcher)

**Estimated Size:** ~800 lines
**Critical:** Yes - Frontend foundation

---

## BATCH 5: Frontend Components (OPTIONAL) 📋

**Why:** UI components that use workspace. Can be done in a second pass.

**Files:**
1. `frontend/components/dashboard/overview/dashboard-overview.tsx`
2. `frontend/components/dashboard/project/projects-list.tsx`
3. `frontend/app/dashboard/teams/page.tsx`

**Estimated Size:** ~1,000 lines
**Critical:** Low - These are UI-only changes

---

## BATCH 6: Database Schema (MUST PASTE) ⚠️

**Why:** Critical for understanding data model. Paste as SQL files or migration scripts.

**Files:**
1. `migrations/001_create_workspaces.sql` - Create workspaces table
2. `migrations/002_add_workspace_id_columns.sql` - Add workspace_id to all tables
3. `migrations/003_migrate_data.sql` - Data migration script

**Estimated Size:** ~300 lines
**Critical:** Yes - Database changes are foundational

---

## RECOMMENDED APPROACH

### Option A: Full Context (Recommended if possible)
1. Paste Batch 1 (Backend Core)
2. Paste Batch 2 (Backend Services)
3. Paste Batch 4 (Frontend Core)
4. Paste Batch 6 (Database Schema)
5. Ask Claude to implement all changes
6. In follow-up, paste Batch 3 and Batch 5 for remaining files

### Option B: Incremental (If context is tight)
1. Paste Batch 1 + Batch 6
2. Ask Claude to implement workspace middleware and database changes
3. Paste Batch 2
4. Ask Claude to update services/controllers/routes
5. Paste Batch 4
6. Ask Claude to implement frontend
7. Paste Batch 3 + Batch 5
8. Ask Claude to complete remaining files

---

## FILES TO CREATE (Not in codebase yet)

These files don't exist and need to be created:

1. `backend/src/middleware/workspace.ts` - **CREATE**
2. `frontend/hooks/use-workspace.tsx` - **CREATE**
3. `migrations/001_create_workspaces.sql` - **CREATE**
4. `migrations/002_add_workspace_id_columns.sql` - **CREATE**
5. `migrations/003_migrate_data.sql` - **CREATE**

---

## FILES TO MODIFY (Existing files)

These files exist and need modifications:

**Backend (23 files):**
- `backend/src/types/fastify.d.ts`
- `backend/src/modules/repositories/service.ts`
- `backend/src/modules/repositories/controller.ts`
- `backend/src/modules/repositories/routes.ts`
- `backend/src/modules/scans/service.ts`
- `backend/src/modules/scans/controller.ts`
- `backend/src/modules/scans/routes.ts`
- `backend/src/modules/vulnerability/service.ts`
- `backend/src/modules/vulnerability/controller.ts`
- `backend/src/modules/vulnerability/routes.ts`
- `backend/src/modules/dashboard/service.ts`
- `backend/src/modules/dashboard/controller.ts`
- `backend/src/modules/dashboard/routes.ts`
- `backend/src/modules/integrations/service.ts`
- `backend/src/modules/integrations/controller.ts`
- `backend/src/modules/integrations/routes.ts`
- `backend/src/modules/entitlements/service.ts`
- `backend/src/modules/settings/scan-settings/service.ts`
- `backend/src/modules/teams/service.ts`
- `backend/src/modules/auth/service.ts`
- `backend/src/modules/webhook/service.ts` (if exists)
- `backend/src/modules/github-issues/service.ts` (if exists)

**Frontend (5 files):**
- `frontend/lib/api.ts`
- `frontend/app/layout.tsx`
- `frontend/components/dashboard/layout/dashboard-shell.tsx`
- `frontend/components/dashboard/overview/dashboard-overview.tsx` (optional)
- `frontend/components/dashboard/project/projects-list.tsx` (optional)

---

## CONTEXT LIMIT STRATEGY

If you hit context limits:

1. **Prioritize Batch 1 + Batch 6** - These are absolutely critical
2. **Then Batch 2** - Main resources
3. **Then Batch 4** - Frontend foundation
4. **Batch 3 and 5 can wait** - Supporting files

You can always do a second pass with the remaining files.

---

## VERIFICATION CHECKLIST

After implementation, verify:

- [ ] Workspace middleware resolves personal workspace by default
- [ ] Workspace middleware resolves team workspace from header
- [ ] All service queries use `workspace_id` instead of `user_id`
- [ ] All controllers extract `workspaceId` from `request.workspace`
- [ ] All routes have `resolveWorkspace` in preHandler
- [ ] Frontend API client adds `X-Workspace-ID` header
- [ ] Frontend has WorkspaceProvider
- [ ] Dashboard shows workspace switcher
- [ ] Personal workspace auto-created on signup
- [ ] Team workspace created when team created

