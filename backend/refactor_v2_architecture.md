
# Backend Architecture Refactor V2

## Conceptual Overview
The backend has been refactored to prioritize a **Workspace-First Architecture**. This ensures rigorous multi-tenancy, where every protected resource access is scoped to a specific Workspace. 

### Key Components

1.  **Workspace Entity**: The root of the hierarchy. All resources (Repositories, Scans, Vulnerabilities, Members) belong to a Workspace.
2.  **Middleware Stack**:
    -   `resolveWorkspace`: Identifies the `workspaceId` from the request (params/headers) and validates user membership.
    -   `requireWorkspace`: Enforces that a valid workspace context exists for the route.
    -   `gatekeepers`: Granular guards (e.g., `requireAuth`, `requireProfile`, `requireTeamPlan`).
3.  **Module Structure**:
    -   `workspaces/`: Core workspace management and member access.
    -   `repositories/`, `integrations/`, `scans/`: Domain-specific modules that depend on workspace context.
    -   Routes are grouped by domain but enforced by workspace middleware.

## Folder Structure
```
src/
├── middleware/
│   ├── workspace.ts       # Workspace resolution & context attachment
│   ├── auth.ts            # Authentication & Profile loading
│   └── gatekeepers.ts     # Permission guards
├── modules/
│   ├── workspaces/        # Workspace CRUD, Members, Bootstrap
│   │   ├── routes.ts      # /api/workspaces routes
│   │   ├── controller.ts
│   │   └── service.ts     # Business logic
│   ├── integrations/      # GitHub/GitLab integrations (Workspace-scoped)
│   ├── repositories/      # Repository management (Workspace-scoped)
│   └── teams/             # Team management (Administrative entity for Team Workspaces)
├── server.ts              # Server entrypoint & plugin registration
└── utils/                 # Shared utilities
```

## Workspace Middleware Design
The `resolveWorkspace` middleware is pivotal. It:
1.  Extracts `workspaceId` from URL parameters (e.g., `/:workspaceId/members`) or Headers.
2.  Verifies the authenticated user is a member of the workspace.
3.  Attaches the `workspace` object to the `request` context.
4.  Attaches `isTeamWorkspace` boolean to the `request` context.

This middleware is applied to all workspace-scoped routes (e.g., `repositoriesWorkspaceRoutes`, `workspacesRoutes`).

## Refactored API Patterns
-   **Public Routes**: `/api/auth/*`
-   **User-Scoped Routes**: `/api/me`, `/api/onboarding`
-   **Workspace-Scoped Routes**:
    -   `/api/workspaces/:id`
    -   `/api/workspaces/:id/members`
    -   `/api/repositories/:workspaceId/...` (Legacy pattern, moving towards `/api/workspaces/:id/repositories`)

## Breaking Changes & Migration Notes
1.  **Imports in `server.ts`**: Routes must be exported as `default` or correctly named imports. Fixed `repositories/routes.ts` to export default.
2.  **Frontend "Teams" -> "Members"**: The `/dashboard/teams` page now represents "Members of Current Workspace". It handles both Personal and Team workspaces gracefully.
    -   **Migration**: Ensure all frontend links to `/dashboard/teams` are context-aware.

## Justification
-   **Scalability**: Workspace-first model allows for clean data segregation and easier scaling (e.g., sharding by workspace).
-   **Security**: Centralized `resolveWorkspace` middleware reduces the risk of IDOR vulnerabilities by enforcing membership checks at the infrastructure level.
-   **UX**: "Members" page aligns with user expectations for workspace management, replacing distinct "Team" management which was confusing in a personal context.
