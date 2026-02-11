# CodeSentinel Engineering Audit & Refactor Guide

**Purpose:** A clear, actionable engineering guide to move the codebase from “works but fragile” to enterprise-grade, audit-ready quality—without a full rewrite.

**Scope:** Backend (Fastify/Node), Frontend (Next.js), AI integration, scan pipeline, vulnerability data model.

---

## PHASE 1: GLOBAL CODEBASE DIAGNOSIS

### 1.1 Architectural Issues

#### Two parallel vulnerability systems (critical)

- **Legacy:** `modules/vulnerability/` — scan-based routes (`/api/vulnerabilities/scan/:scanId`, `/details/:type/:id`, `/:type/:id/create-issue`). Reads/writes type-specific tables: `vulnerabilities_sast`, `vulnerabilities_sca`, `vulnerabilities_secrets`, `vulnerabilities_iac`, `vulnerabilities_container`.
- **Unified:** `modules/vulnerabilities-unified/` — workspace-based routes under `/api/workspaces/:workspaceId/vulnerabilities`. Reads/writes `vulnerabilities_unified` + `vulnerability_instances`.
- **Worker:** Only writes to the unified pipeline (`processUnifiedVulnerabilities` in `deduplication-processor.ts`). The legacy tables are **no longer populated** for new scans.
- **Impact:** Legacy API still registered and used for “Create GitHub issue”. Create-issue looks up by `type` + `id` in legacy tables; unified vulns have a single `id` (unified UUID). **Create GitHub issue is broken** for all vulnerabilities surfaced from the unified list (404 / “Vulnerability not found”).
- **Other:** Duplicate concepts (e.g. “get vulnerability details”, “update status”) exist in both modules with different shapes and IDs. Frontend mostly uses unified; create-issue and legacy `getVulnerabilitiesByScan` use legacy. Confusing for maintainers and auditors.

#### God file: scan worker

- **File:** `backend/src/modules/scans/worker.ts` (~650 lines).
- **Responsibilities mixed in one place:** Job dequeue, repo fetch, commit resolution, cache check, workspace creation, file write, scanner orchestration, dedup processing, scan record update, severity aggregation, security score, scan_metrics insert, GitHub auto-issues, entitlements tracking, cleanup, **plus** a large amount of dead code.
- **Dead code:** `storeVulnerabilities` (~280 lines) and `calculateSeverityCounts` are never called. The worker uses `processUnifiedVulnerabilities` and computes severity from the unified/instances model; the old type-specific insert logic is obsolete and misleading.
- **Tight coupling:** Worker directly imports and uses: integrations (GitHub), scanners (orchestrator), progress, entitlements, github-issues, cache-check, deduplication-processor, security-score, Supabase tables by name. Any change to dedup or schema touches the worker.

#### Route registration and path bugs

- **server.ts:** Missing semicolon after `webhooksRoutes` (line 139–140); minor but indicates ad-hoc edits.
- **Unified routes path bug:** `vulnerabilities-unified/routes.ts` registers PATCH/POST with paths like `"/workspaces/:workspaceId/vulnerabilities/:vulnId/status"`. These are mounted under `workspacesRoutes`, which is already prefixed with `/api/workspaces`. So the effective path is `/api/workspaces/workspaces/:workspaceId/...` and **status, assign, and ai-explain will 404** when the frontend calls `/api/workspaces/:workspaceId/vulnerabilities/:vulnId/status`. GET list/detail use correct relative paths (`/:workspaceId/vulnerabilities`).

#### Business logic in wrong layers

- **Worker:** Contains in-place severity aggregation (double-query on `vulnerability_instances` + `vulnerabilities_unified`), security score calculation, and scan-metrics field mapping. This belongs in a small “scan completion” or “metrics” service.
- **Deduplication-processor:** Runs AI title generation in the middle of the pipeline (per-finding). AI is correctly behind a fallback but the processor still knows about “title generator” and “normalizeTitle”; the boundary between “fingerprint + instance” logic and “enrichment” is blurred.
- **Legacy vulnerability service:** Queries 5 tables in parallel and merges/sorts in memory; pagination is applied after the merge. This does not scale (O(tables × limit) and merge complexity).

#### Unclear / duplicated ownership

- **Security score:** Calculated in worker from **raw** scanner findings (`allVulnerabilities`) before dedup. Scan record then stores `vulnerabilities_found` = **unique** count from unified/instances. So “score” is based on raw counts, “vulnerabilities found” on unique—subtle inconsistency.
- **Workspace middleware:** `ensureGitHubIntegration` is called on every request that resolves workspace. That’s an integration invariant; doing it in middleware is a design choice but couples “resolve workspace” to “ensure GitHub integration” and can cause confusion if other integrations are added.

### 1.2 Scalability Risks

- **Scan worker:** Single process, single queue, concurrency 3. No horizontal scaling story; no idempotency key on job payload (same repo+branch enqueued twice = two full scans). Stalled-scan detector uses `setInterval` in-process; if the process restarts, no cron elsewhere.
- **Unified list:** `getVulnerabilitiesByWorkspace` fetches instance counts with a second query and no limit on `vulnerabilityIds` length; for large workspaces this can be heavy. No evidence of `scan_id` filter support in the list endpoint despite frontend sending `scan_id` for “getByScan”.
- **Legacy getVulnerabilitiesByScan:** Runs 5 table queries, merges, then slices for pagination. Total count is sum of 5 counts; ordering and pagination across 5 tables are ambiguous and expensive at scale.
- **Deduplication-processor:** Per-finding async title generation (with coalescing and fallback) is good, but the step runs in the worker process; a scan with thousands of findings will hold the job for a long time. No batching of AI calls or out-of-band enrichment.
- **getVulnerabilityStats (unified):** Loads all vulnerability rows for the workspace into memory and aggregates in JS. Will not scale with thousands of vulns.
- **Hidden shared state:** AI service uses module-level singletons (`aiClientInstance`, `titleGeneratorInstance`) and in-memory caches/rate limits. In a multi-instance deployment, each process has its own limits and cache; rate limits and cache hits are not shared.

### 1.3 Maintainability Problems

- **Naming inconsistency:** “vulnerability” vs “vulnerabilities-unified”, “user_id” vs “workspace_id” in legacy tables (comments say “migration period”), “commit_sha” vs “commit_hash” in different places.
- **Repeated patterns:** Same preHandler array (verifyAuth, loadProfile, requireAuth, requireProfile, requireOnboardingCompleted, resolveWorkspace) copied across route modules. Workspace resolution and auth are repeated in many controllers.
- **Magic behavior:** Scan status flow (pending → running → normalizing → completed) is implicit. Progress stages and percentages are hardcoded in the worker (e.g. 75 for “normalizing”). Cache key for scan reuse is commit_hash + enabledScanners; behavior is documented in comments but not in a single “scan lifecycle” doc.
- **Large, multi-purpose files:** Worker (as above). `vulnerability/controller.ts` and `vulnerability/service.ts` each handle many concerns (by-scan, by-type, details, update, repo stats, create-issue). Unified service is also large (500+ lines) with list, detail, status, assign, AI explain, stats, by-scan.
- **Inconsistent error handling:** Some paths throw `fastify.httpErrors.*`, others throw `new Error(...)`. Global error handler in server maps to statusCode and message but not to a stable error code for clients.

### 1.4 Review-Readiness (What Would Fail an Audit)

- **No automated tests:** `package.json` scripts: `"test": "echo \"Error: no test specified\" && exit 1"`. No unit or integration tests. Refactors and “no production features” changes are high-risk.
- **Dual vulnerability model:** An auditor will ask “which table is source of truth?” and “why are there two APIs?”. Create-issue broken for current data model is a functional bug that would be caught in QA or security review.
- **Dead code:** Large `storeVulnerabilities` and `calculateSeverityCounts` in worker suggest incomplete migration and confusion about where data is written.
- **Route path bug:** PATCH/POST for status, assign, ai-explain 404 in production for unified API; suggests missing E2E or smoke tests.
- **Schema/API not codified:** No OpenAPI/Swagger; commented-out schema blocks in unified routes. Hard to generate clients or validate contracts.
- **Secrets and env:** `env.ts` validates required vars; API keys (Gemini, Anthropic) are optional. No evidence of secrets scanning or rotation story in codebase.

---

## PHASE 2: STRUCTURAL RECOMMENDATIONS (NO CODE YET)

### 2.1 Target Folder / Module Structure

- **Single vulnerability domain:** One module “vulnerabilities” (or “vulnerability” with a clear name). Inside: one “unified” data model and API; one set of routes (workspace-scoped); one service layer. Legacy “by type + by scan” and “create-issue” should be expressed on top of unified (e.g. create-issue accepts unified `vulnId`, backend resolves to context from `vulnerability_instances` + scan/repo).
- **Scan pipeline as a pipeline:** Split worker into clear stages and move each stage behind a small function or service:
  - **Enqueue / job payload** (already in `scans/service.ts`)
  - **Fetch repo + commit** (repo + commit resolution)
  - **Cache check** (cache-check)
  - **Run scanners** (orchestrator only)
  - **Process findings** (deduplication-processor only: fingerprint, instances, titles)
  - **Compute metrics & complete scan** (new: “scan completion” or “metrics” service: severity counts from DB, security score, update scan row, scan_metrics, optional auto-issues)
- **AI behind a clear boundary:** One “enrichment” layer that the deduplication-processor (or a post-dedup step) calls. Input: list of findings (or unified rows). Output: titles (and optionally other fields). No AI in routes or in “core” dedup logic; only in an enrichment step that can be disabled or moved to a job later.

Suggested high-level layout:

```
backend/src/
  domain/
    vulnerabilities/     # unified only; create-issue, status, etc. here
    scans/               # start scan, get history, get run; pipeline orchestration
    scan-pipeline/       # worker steps: fetch, cache, run scanners, dedup, complete
  scanners/             # orchestrator + per-scanner impls (unchanged)
  services/
    ai/                  # client, title generator, explainer; no domain logic
  shared/
    middleware, env, queue, supabase plugin
```

You can keep “modules” naming but enforce: one vulnerability API, one scan “run” API, pipeline steps as separate files or a small pipeline runner that composes them.

### 2.2 Responsibility Boundaries

- **Routes:** Only: parse request, validate (schema), call one service function, send response. No Supabase or business rules in route handlers.
- **Controllers (if kept):** Thin: extract workspace/auth, call service, return. Prefer “route → service” without a controller layer where it doesn’t add value.
- **Services:** All business and persistence. “Vulnerability service” for unified: list, get, update status, assign, create-issue (using unified id), AI explain. “Scan service”: start, history, get run. “Scan completion service”: given scanId and (optional) raw metrics from orchestrator, compute and persist final scan row + metrics.
- **Scan pipeline (worker):** Orchestrates steps only: fetch → cache? → run scanners → processUnifiedVulnerabilities → completeScan(scanId) → optional auto-issues. No in-worker severity aggregation or security score formula; that lives in “scan completion”.
- **AI:** Used only in: (1) dedup/enrichment (titles), (2) on-demand explain (unified service). Never in: auth, entitlements, scan enqueue, scanner execution, core dedup fingerprint/instance logic.

### 2.3 Data Flow (Scan → Store → Present)

- **Scan:** User starts scan → scan record created, job enqueued → worker runs pipeline: fetch repo → resolve commit → check cache (if hit, clone results and complete) → write files → orchestrator.scanAll() → raw findings → processUnifiedVulnerabilities(scanId, workspaceId, repositoryId, rawFindings) → completeScan(scanId) [reads instances + unified for this scan, computes severity counts and score, updates scan row and scan_metrics] → optional auto-issues → cleanup.
- **Present:** Frontend uses only workspace-scoped unified API: list (with optional scan_id filter), get by id, status, assign, ai-explain. Create-issue must be implemented against unified (lookup vuln by unified id, get scan/repo from instances).
- **Single source of truth:** `vulnerabilities_unified` + `vulnerability_instances`. No second set of tables for “current” findings. Legacy tables can be deprecated and dropped after migration and create-issue fix.

### 2.4 Why This Matters

- **One vulnerability model:** Eliminates “which API/table?” and fixes create-issue without guesswork.
- **Pipeline stages:** Makes the worker testable (each step can be unit or integration tested), and allows future moves (e.g. “complete” or “enrich” in a separate job).
- **AI boundary:** Keeps cost, rate limits, and failures out of core correctness; enrichment can be optional or async later.

---

## PHASE 3: LOGIC & PATTERN REFACTORING STRATEGY

### 3.1 Patterns to Extract

- **Auth + workspace preHandler:** Single exported array (e.g. `withWorkspace`) used by all route modules that need it. Ensures one place to add new middleware.
- **Pagination:** Shared type and helper (e.g. `page`, `limit` → `offset`, and `range(offset, offset+limit-1)` for Supabase) so list endpoints don’t repeat the same math.
- **Severity ordering:** Used in multiple places (legacy merge sort, unified list). One shared “severity order” (critical=0, high=1, …) and a small `sortBySeverity` utility.
- **Scan status / progress:** Centralize “status → label”, “stage → percentage” in one module so the worker and any progress API stay in sync.

### 3.2 Replace Dangerous or Inconsistent Patterns

- **Legacy getVulnerabilitiesByScan:** Replace with: “get vulnerability IDs for this scan from vulnerability_instances”, then “get unified rows by those IDs” with pagination and filters. Same pattern as unified `getVulnerabilitiesByScan`. Then deprecate legacy endpoint or make it proxy to unified.
- **create-issue:** Accept unified `vulnId`. Load vuln from `vulnerabilities_unified`, get one instance (e.g. latest scan) from `vulnerability_instances`, join scan + repository for context, call existing GitHub issue creation logic with that context. Remove dependency on legacy type-specific tables.
- **Security score:** Compute in “scan completion” from the same data that fills the scan row (unique vulns from instances + unified for this scan). Use one severity breakdown for both “vulnerabilities_found” and “security_score” so they’re consistent.
- **getVulnerabilityStats:** Use aggregation in the DB (count by severity/status/scanner_type) or a materialized view / cached stats table instead of loading all rows.

### 3.3 Consistency (Naming, Errors, Logging, Validation)

- **Naming:** Standardize on `workspace_id` everywhere; phase out `user_id` in vulnerability context. Use `commit_hash` consistently (DB and code). Prefer “unified” or “vulnerability” (singular) for the domain, not “vulnerabilities-unified” in URLs if you can avoid it.
- **Errors:** Use `fastify.httpErrors.*` everywhere in route/service boundaries; map to stable client error codes (e.g. `code: 'VULNERABILITY_NOT_FOUND'`) in the response body where useful.
- **Logging:** Structured (requestId, workspaceId, scanId) in key operations; avoid ad-hoc strings. Worker already uses `addLog`; keep that pattern and align field names.
- **Validation:** Zod (or similar) for all route inputs; document in OpenAPI so frontend and backend stay aligned. Uncomment and fix schema blocks in unified routes; use shared schemas for vulnerability id, status, etc.

### 3.4 Abstractions: Where They’re Missing vs Overdone

- **Missing:** Scan completion (metrics + final scan update), shared pagination/severity helpers, single “vulnerability API” facade so create-issue and status live in one place.
- **Overdone:** Two full vulnerability modules. Optional: TitleGeneratorService might be a thin wrapper over AIClient + normalizer; keep it for now but don’t add another layer. Avoid abstracting “every Supabase call” behind a generic repository; use services that own their tables.

---

## PHASE 4: AI INTEGRATION AUDIT

### 4.1 Current State

- **Title generation:** Used inside `deduplication-processor` during scan. Flow: get title generator (lazy init), for each finding try AI then fallback to `normalizeTitle`. Coalescing and rate limiting are in AIClientService. Fail-fast to rule-based is correct.
- **Explanation:** On-demand in unified service (`generateAIExplanation`). Uses `VulnerabilityExplainerService`, which currently returns only fallback (no real LLM call). Fallback shape differs from `aiClient`’s `AIExplanation` (e.g. impact vs why_it_matters, step_by_step_fix vs step_by_step_fix). Type mismatch risk when wiring real AI later.
- **Coupling:** Dedup processor imports `getTitleGenerator` and knows about “AI vs rule-based”. That’s acceptable if the only call site is “enrich title”; avoid adding more AI calls in the same file.
- **Failure impact:** If AI is down or rate-limited, scans still complete with rule-based titles. Explain endpoint returns fallback. So AI does not break critical path; good.
- **Determinism:** Title cache is in-memory and per process; same rule_id+severity can get different titles across restarts or instances. For audit, consider “title source” (ai vs rule-based) stored on the row so behavior is traceable.
- **Cost/rate:** AIClient has daily cap and spacing; good. No per-workspace or per-scan limit; one heavy workspace can exhaust shared quota.

### 4.2 Recommended AI Boundary

- **Inputs:** For titles: list of { rule_id, description, scanner_type, severity, … }. For explain: one vulnerability context (title, description, severity, …).
- **Outputs:** Title string + source (ai | rule-based). Explanation: structured object (summary, why_it_matters, steps, etc.); validate and sanitize before storing.
- **Validation:** Max length and blocklist for title; schema for explanation so malformed model output doesn’t break the app.
- **Error isolation:** All AI calls in try/catch; never throw out of the AI layer to fail the scan or the HTTP request. Log and return fallback.
- **Rate and cost:** Keep existing in-process limits. For multi-instance, add a small “AI gateway” or use a queue for title batch (later) so limits are centralized. Optionally: per-workspace or per-scan cap to avoid one tenant burning quota.
- **Where AI must not live:** Auth, entitlements, scan enqueue, scanner execution, fingerprint/instance computation, DB schema migrations.

---

## PHASE 5: STEP-BY-STEP REFACTOR PLAN

### 5.1 Order of Work (Non-Destructive First)

1. **Fix route path bug (unified)**  
   In `vulnerabilities-unified/routes.ts`, change PATCH and POST paths from `"/workspaces/:workspaceId/..."` to `"/:workspaceId/vulnerabilities/:vulnId/status"`, `"/:workspaceId/vulnerabilities/:vulnId/assign"`, `"/:workspaceId/vulnerabilities/:vulnId/ai-explain"`. Verify with a manual or E2E check that status/assign/ai-explain work. **No behavior change elsewhere.**

2. **Fix create-issue for unified**  
   Add a new route (or overload existing) so that “create issue” accepts unified vulnerability id (and optionally workspace from context). In backend: load from `vulnerabilities_unified`, get scan/repo from `vulnerability_instances` + scan + repository, call existing `createGitHubIssue`. Frontend: call this with `vulnId` (unified id) and `scanner_type` if needed for labels. Deprecate legacy create-issue by type+legacy id once frontend is switched.

3. **Add minimal tests**  
   At least: one integration test that starts a scan (or mocks the job), runs dedup, and checks that unified rows and instances exist; one API test for GET list and PATCH status for unified. Protects the next refactors.

4. **Extract “scan completion”**  
   New module or file: `completeScan(fastify, scanId)`: query instances + unified for this scan, compute severity counts and unique count, call existing `calculateSecurityScore` with the same set (or a consistent source), update scan row and scan_metrics. Worker then: after `processUnifiedVulnerabilities`, calls `completeScan(scanId)` and removes in-worker severity aggregation and duplicate score logic. Worker still updates progress/status before and after.

5. **Remove dead code from worker**  
   Delete `storeVulnerabilities` and `calculateSeverityCounts`; keep only the code path that uses unified pipeline and `completeScan`. Clarify in comments that “vulnerabilities are written only via processUnifiedVulnerabilities”.

6. **Unify vulnerability API surface**  
   Decide on “one module”: e.g. all vulnerability routes under workspace-scoped unified, with create-issue and status there. Migrate any remaining frontend calls from legacy `/api/vulnerabilities/...` to unified. Then deprecate legacy routes and, in a later phase, legacy tables.

7. **Pipeline stages (optional but recommended)**  
   Split worker into: `runFetchAndCache`, `runScanners`, `runDedup`, `runComplete`, `runAutoIssues`. Worker becomes a linear sequence of steps. Enables testing each step and, later, moving steps to separate jobs.

8. **Stats and list scaling**  
   Replace in-memory aggregation in `getVulnerabilityStats` with DB aggregation or a cached stats table. Ensure unified list supports `scan_id` filter if the frontend relies on it; add it if missing.

### 5.2 What Must Not Be Refactored Without Tests

- Deduplication-processor (fingerprint, instance key, batch insert/update).
- Scan worker job payload and queue name (BullMQ).
- Auth and workspace middleware (behavior and order).
- Supabase table names and critical columns (vulnerabilities_unified, vulnerability_instances, scans).

Add at least smoke or integration tests before touching these.

### 5.3 Incremental Safety

- One PR per item above where possible. Feature flags or route duplication (e.g. new create-issue path alongside old) allow rollout without big-bang.
- Keep legacy routes read-only or deprecated for a release cycle before removing; ensure no remaining callers (frontend, scripts, docs).

---

## PHASE 6: ENGINEERING RULES FOR FUTURE CODE

### 6.1 Internal “Engineering Standards” (Short)

- **One source of truth per concept.** No duplicate “vulnerability” APIs or tables for the same notion. New features use the unified model.
- **Routes are thin.** Parse, validate, call one service, return. No business logic or direct Supabase in route handlers.
- **Pipeline steps are isolated.** Scan pipeline is a sequence of steps; each step has one responsibility and is testable.
- **AI is an enrichment only.** No AI in auth, entitlements, or core scan/dedup correctness. All AI behind try/catch and fallbacks.
- **Naming and env are consistent.** `workspace_id`, `commit_hash`; required vs optional env validated at startup.
- **Errors and validation.** Use shared HTTP errors and, where useful, stable error codes. Validate all inputs with a schema (Zod + OpenAPI).

### 6.2 What to Reject in Code Reviews

- New code that writes to legacy vulnerability tables for “current” findings.
- New route handlers that contain Supabase queries or business logic (should be in a service).
- New AI calls outside the designated AI service/enrichment layer, or without fallback and error handling.
- Large new “god” files (target: one main responsibility per file, max ~300–400 lines for a service).
- Duplicate preHandler arrays or new auth/workspace logic duplicated instead of reusing shared middleware.
- Features that add “another way” to do the same thing (e.g. a second way to get vulnerabilities) without deprecating the old one.

### 6.3 When to Add Abstractions vs Keep It Simple

- **Add an abstraction when:** The same logic appears in 3+ places, or you need to swap implementations (e.g. different AI provider). Then introduce a small interface or service and one implementation.
- **Keep it simple when:** The code is used in one place and the requirement is stable. Prefer a clear function over a generic “repository” or “manager” until the second use case appears.
- **Do not abstract:** “Just in case” or to make the code “look” more enterprise. Prefer readable, linear code over deep layers.

---

## Summary Table

| Area | Critical issue | First action |
|------|----------------|-------------|
| Vulnerabilities | Two systems; create-issue broken | Fix unified route paths; implement create-issue on unified |
| Worker | God file + dead code | Extract scan completion; remove dead code |
| Tests | None | Add minimal integration + API tests |
| AI | Well isolated; small type/consistency risks | Keep boundary; align explainer types and fallback shape |
| Scale | In-memory stats; no scan_id filter | DB aggregation for stats; add scan_id to list if needed |
| Consistency | Naming, errors, validation | Shared middleware, schemas, error codes |

This guide is tailored to the current CodeSentinel codebase and is intended as a roadmap a senior engineer can follow for an incremental, low-risk path to enterprise-grade structure and maintainability.
