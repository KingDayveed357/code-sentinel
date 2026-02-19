# CodeSentinel: Advanced Implementation Plan (RBAC & Team Collaboration)

**Version:** 1.0  
**Date:** 2026-02-18  
**Status:** Draft  
**Objective:** Transform CodeSentinel into a premium, workspace-centric, security-focused SaaS with robust Role-Based Access Control (RBAC) and team collaboration features.

---

## 1. System Architecture & Security Model

The security model assumes a **Workspace-First** architecture. All resources (Projects, Scans, Vulnerabilities, Integrations) belong to a Workspace. Users belong to Workspaces with specific Roles.

### 1.1 Architecture Diagram (Logical)

```mermaid
graph TD
    User((User)) -->|Auth (Supabase)| API_Gateway[Backend API / Fastify]
    
    subgraph "Authorization Layer"
        API_Gateway -->|1. Auth Check| AuthGuard[Auth Middleware]
        API_Gateway -->|2. Workspace Context| WorkspaceGuard[Workspace Resolver]
        API_Gateway -->|3. Role Check| RBAC[RBAC Middleware]
        API_Gateway -->|4. Entitlements| PlanGuard[Plan/Limit Checker]
    end
    
    subgraph "Data Layer (Supabase)"
        RBAC -->|RLS Enforcement| DB[(Database)]
        
        DB -->|Row Level Security| ScopedData[Workspace Scoped Data]
        ScopedData --> Projects
        ScopedData --> Scans
        ScopedData --> Vulnerabilities
    end

    User -->|Frontend Request| NextJS[Next.js App]
    NextJS -->|API Calls| API_Gateway
```

### 1.2 Database Schema & RLS Strategy

We leverage Supabase Row Level Security (RLS) as the **final line of defense**, mirroring the application-level RBAC.

#### Key Tables & Logic
| Table | RLS Policy Summary |
| :--- | :--- |
| `workspaces` | Users see workspaces they are members of. Owners can update/delete. |
| `workspace_members` | Members view other members. Owners/Admins manage invitations & roles. |
| `repositories` (Projects) | **Owners/Admins/Viewers**: See all.<br>**Developers**: See *Assigned* projects only. |
| `project_members` | Links `user_id` to `repository_id`. Used by RLS to filter Projects. |
| `scans` | Inherits visibility from `repositories`. |
| `vulnerabilities_unified` | Inherits visibility from `scans`. Developers can also see issues explicitly assigned to them. |
| `integrations` | **Owners/Admins**: Full access.<br>**Devs/Viewers**: Read-only (cannot see secrets). |
| `workspace_activity_log` | **Owners/Admins**: View access.<br>**System**: Insert only. |

---

## 2. Role-Based Access Control (RBAC) Matrix

We define four distinct roles to support team workflows.

| Feature / Action | Owner | Admin | Developer | Viewer |
| :--- | :---: | :---: | :---: | :---: |
| **Workspace Management** | | | | |
| Delete Workspace | ✅ | ❌ | ❌ | ❌ |
| Manage Billing & Plans | ✅ | ❌ | ❌ | ❌ |
| View Billing Info | ✅ | ✅ | ❌ | ❌ |
| Update Workspace Settings | ✅ | ✅ | ❌ | ❌ |
| **User Management** | | | | |
| Invite Members | ✅ | ✅ | ❌ | ❌ |
| Remove Members | ✅ | ✅ | ❌ | ❌ |
| Change Member Roles | ✅ | ❌ | ❌ | ❌ |
| **Project & Scan Operations** | | | | |
| Create/Delete Projects | ✅ | ✅ | ✅ (My Projects) | ❌ |
| Run Scans | ✅ | ✅ | ✅ (My Projects) | ❌ |
| Assign Projects to Users | ✅ | ✅ | ❌ | ❌ |
| **Vulnerability Management** | | | | |
| View Vulnerabilities | ✅ | ✅ | ✅ (Assigned) | ✅ |
| Change Status (Resolve/False +) | ✅ | ✅ | ✅ (Assigned) | ❌ |
| Assign Issues | ✅ | ✅ | ✅ (Self) | ❌ |
| **Integrations** | | | | |
| Connect Integration (GitHub, etc) | ✅ | ✅ | ❌ | ❌ |
| View Integration Status | ✅ | ✅ | ✅ | ✅ |

---

## 3. Implementation Stages

We will execute this transformation in 4 focused waves to ensure stability.

### Wave 1: The Foundation (Core RBAC & Project Assignment)
**Goal:** Enforce strict access control at the database and API level. Prevent "Global View" leakage for Developers.
*   **Backend**:
    *   [x] Establish RLS Policies (Already in `006_rls_policies.sql`).
    *   [ ] Verify `project_members` table usage in API endpoints.
    *   [ ] Update `RepositoryController.list` to respect assignments for Developers.
    *   [ ] Update `ScanController` & `VulnerabilityController` to filter based on Project visibility.
*   **Frontend**:
    *   [ ] Update `useWorkspaces` to properly handle role context.
    *   [ ] Create `AccessDenied` component for 403 states.
    *   [ ] Implement "My Projects" vs "All Projects" toggle on Dashboard for Admins.
    *   [ ] Hide "Settings" and "Billing" tabs for non-Owners/Admins.

### Wave 2: Team Management UI & Workflows
**Goal:** Allow Owners to build their team and assign responsibilities.
*   **Frontend**:
    *   [x] **Project Settings > Members**: UI to assign specific members to a project.
    *   [x] **Team Settings**: Enhanced member list with Role dropdown (Owner/Admin/Dev/Viewer).
    *   [x] **Invite Flow**: specific role selection during invite.
*   **Backend**:
    *   [x] API endpoints for `POST /projects/:id/members` (Assign/Unassign).
    *   [x] Validation logic ensures you can't assign a user to a project if they aren't in the workspace.

### Wave 3: Integration & Activity Security
**Goal:** Secure the "Keys to the Kingdom" and track usage.
*   **Backend**:
    *   [x] **Secrets Stripping**: Ensure `GET /integrations` never returns API keys/tokens to frontend, regardless of role.
    *   [x] **Audit Logging**: Create `ActivityLogger` service. Record: `USER_INVITED`, `ROLE_UPDATED`, `SCAN_STARTED`, `PROJECT_CREATED`.
*   **Frontend**:
    *   [x] **Integrations Page**: Disable "Add/Edit" buttons for Devs/Viewers. Show "Contact Admin" tooltip.
    *   [x] **Activity Log Page**: Create a timeline view of workspace actions (Admin/Owner only).

### Wave 4: Dashboard & Premium UX Polish
**Goal:** A "Wowed" first impression for every role.
*   **UX / UI**:
    *   **Developer Dashboard**: Focus on "My Priority Fixes" – actionable list of assigned vulnerabilities.
    *   **Admin/Owner Dashboard**: Focus on "Workspace Risk Posture" – trends, top risky projects, team activity.
    *   **Empty States**: "You haven't been assigned any projects yet" (for Devs) vs "Create your first project" (for Owners).
    *   **Navigation**: Updates side panel to hide inaccessible routes dynamically.

---

## 4. Workflows & UX Adjustments

### 4.1 Project Assignment Workflow
1.  **Admin** goes to Project > Settings > Access.
2.  See list of Workspace Members.
3.  Toggle switch next to names to grant access.
4.  **Backend** updates `project_members` table.
5.  **Developer** logs in:
    *   Dashboard only shows this project.
    *   Scan results are limited to this project.

### 4.2 Onboarding & "First Scan"
*   **New Owner**: Standard onboarding flow -> Create Project -> Scans start.
*   **New Member**:
    *   Invited via Email.
    *   Accepts Invite -> Redirected to Dashboard.
    *   **If Developer**: Checks if assigned projects exist. If 0, show "Ask an Admin for access" empty state.
    *   **If Admin**: Show full workspace overview.

---

## 5. Output Requirements Check

1.  **System Architecture**: Covered in Section 1.
2.  **Database Schema**: Leverages existing tables + strict RLS.
3.  **RBAC Matrix**: Detailed in Section 2.
4.  **Project Assignment Logic**: Defined via `project_members` table.
5.  **Integration Access Model**: Role-restricted write access.
6.  **Staged Plan**: 4 Waves defined in Section 3.
7.  **Edge Cases**:
    *   *User removed from workspace while viewing project*: Real-time RLS rejection on next fetch.
    *   *Downgrading Owner to Viewer*: Prevent if they are the *last* owner.

---

## 6. Next Steps (Immediate Actions)

1.  **Verify DB State**: Ensure `project_members` table exists and RLS enabled.
2.  **Frontend Guard Updates**: implement `RequirePermission` wrapper components.
3.  **Project Assignment API**: Build the backend endpoints for assigning members.
