# System AI Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-editable system-wide AI and semantic-search switches that gate model calls, Meilisearch embeddings, and hybrid search for every organization.

**Architecture:** Store one `SystemPreference` row with stable singleton key `global`, defaulting both switches to enabled. Admin APIs read and update it; shared server helpers enforce it, and the settings UI exposes it. Semantic search updates Meilisearch’s embedder setting immediately and the worker reconciles it on startup.

**Tech Stack:** Next.js route handlers, Prisma/PostgreSQL, React Query, Meilisearch JavaScript SDK.

## Global Constraints

- Preserve existing organization-level and member-level preferences as additional opt-outs.
- System-level AI and semantic-search switches are hard gates across all organizations.
- Existing emails, access filters, and pagination behavior must remain unchanged.
- When AI is unavailable or disabled, existing local spam and summary fallback behavior continues.
- When semantic search is unavailable or disabled, use lexical search.
- Do not add or run tests or create commits; use static review and preserve all unrelated dirty changes.
- Before adding or changing a Next.js route handler, read the relevant guide in `node_modules/next/dist/docs/` as required by `AGENTS.md`.

---

### Task 1: Add singleton system preference storage

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260929140000_add_system_ai_preferences/migration.sql`

**Interfaces:**
- Produces Prisma model `SystemPreference` with `id`, `isAiEnabled`, `semanticSearchEnabled`, and `updatedAt`.
- The singleton uses `id = "global"`; both flags default to `true`.

- [ ] Add the model with database-mapped snake_case column names and `updatedAt @updatedAt`.
- [ ] Add a SQL migration creating `system_preferences`, a `VARCHAR(20)` primary key defaulting to `global`, two non-null boolean columns defaulting to `TRUE`, and `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
- [ ] Generate Prisma Client so the new model is available to the application.
- [ ] Inspect only the schema and migration diffs; preserve unrelated schema changes.

### Task 2: Add system preference reader and admin API

**Files:**
- Create: `src/lib/settings/system-preferences.ts`
- Create: `src/app/api/settings/system-preferences/route.ts`

**Interfaces:**
- `getSystemPreferences(): Promise<{ isAiEnabled: boolean; semanticSearchEnabled: boolean }>` reads or creates the singleton defaults.
- `GET /api/settings/system-preferences` returns the two booleans for an authenticated organization admin.
- `PUT /api/settings/system-preferences` accepts a non-empty partial object containing only those two booleans and returns the resulting preferences.

- [ ] Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` before editing the route.
- [ ] Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` and export `maxDuration = 300` from the route to cover the Meilisearch wait and compensation window.
- [ ] Implement the singleton read with `upsert({ where: { id: 'global' }, create: { id: 'global' }, update: {} })` and return only the editable fields.
- [ ] Authenticate both methods, read the current `OrganizationMember.role` for the authenticated organization/user, and reject missing memberships or non-admin roles with HTTP 403 so stale admin JWTs cannot edit global preferences.
- [ ] Parse the request as an object; reject arrays, empty objects, unknown fields, or non-boolean field values with HTTP 400.
- [ ] Update only submitted flags so partial updates preserve the other stored value.
- [ ] Inspect auth and validation paths statically.

### Task 3: Synchronize Meilisearch embedder configuration

**Files:**
- Modify: `src/lib/search/meilisearch.ts`
- Modify: `src/worker.ts`
- Modify: `src/app/api/settings/system-preferences/route.ts`

**Interfaces:**
- `configureEmailEmbedder(enabled: boolean): Promise<void>` configures the existing `default` REST embedder when enabled and calls `index.resetEmbedders()` when disabled; each path calls `.waitTask({ timeout: 120_000 })` and throws unless the returned task has `status === 'succeeded'`.
- `initMeilisearch()` applies the stored system preference so restarts reconcile index configuration.

- [ ] Extract the current `default` embedder configuration from `initMeilisearch()` without changing its environment-variable values or document template.
- [ ] Remove the unconditional `embedders` field from the base `initMeilisearch()` settings call; after applying the non-embedder settings, call `configureEmailEmbedder(getSystemPreferences().semanticSearchEnabled)` so an off value resets rather than re-enables the embedder.
- [ ] In the preferences `PUT`, upsert the singleton first, then use an interactive Prisma transaction with `maxWait: 10_000` and `timeout: 270_000` to `SELECT id FROM system_preferences WHERE id = 'global' FOR UPDATE`, read the latest row while holding that lock, apply and await any needed Meilisearch change, and update the row before releasing the lock. On Meilisearch wait/network failure, best-effort reapply the persisted value before rolling back; if that fails, reacquire the row lock and reconcile to the persisted setting before returning HTTP 503. On database failure after a Meilisearch change, best-effort restore the state read under the lock and return HTTP 500.
- [ ] If `.waitTask()` reports a task status other than `succeeded` or rejects, do not report a successful preference update; return HTTP 503 and leave the stored preference unchanged.
- [ ] Inspect the toggle and startup order statically; confirm the disabled branch calls `resetEmbedders()` and the enabled branch restores the exact existing config.

### Task 4: Enforce global AI and semantic-search gates

**Files:**
- Modify: `src/lib/ai/llm-client.ts`
- Modify: `src/lib/queue/workers/summary.ts`
- Modify: `src/app/api/emails/search/route.ts`
- Modify: `src/app/api/experiments/settings/route.ts`
- Modify: `src/app/api/settings/preferences/route.ts`

**Interfaces:**
- The shared LLM resolver reads system preference and throws `AiUnavailableError('disabled')` when system AI is off, before any provider fetch.
- Summary jobs use the local basic digest if either the system or organization AI switch is off.
- Search uses hybrid mode only when both global and member semantic-search preferences are enabled.
- Member preference reads include read-only system availability flags for the existing preference page.

- [ ] Read the current search/LLM flows and retain `organizationId`, membership checks, filter construction, and pagination unchanged.
- [ ] Add the system flag to the shared LLM resolution and preserve the current organization/member checks and unavailable-provider behavior.
- [ ] Make the summary worker classify AI as enabled only when system and organization preferences are both enabled; continue to use the local digest otherwise.
- [ ] Require global and member semantic-search flags before issuing a hybrid Meilisearch query; retain lexical retry on hybrid failure.
- [ ] Include global AI availability in the experiments settings response so the UI can hide configuration while system AI is disabled.
- [ ] Include read-only `systemAiEnabled` and `systemSemanticSearchEnabled` values in the member preference GET response without accepting them on PUT; preserve the member's saved preferences for later.
- [ ] Inspect all AI call paths and search query options statically for bypass behavior and preserved access constraints.

### Task 5: Add the System Preferences page

**Files:**
- Create: `src/app/(dashboard)/settings/system-preferences/page.tsx`
- Modify: `src/app/(dashboard)/settings/layout.tsx`
- Modify: `src/app/(dashboard)/settings/preferences/page.tsx`
- Modify: `src/app/(dashboard)/settings/experiments/page.tsx`

**Interfaces:**
- Add a “System Preferences” link for authenticated organization admins.
- The page reads and updates the two flags through `/api/settings/system-preferences` and gives each control pending/error feedback.

- [ ] Add an admin-only nav item following existing settings navigation conventions and re-check role before rendering protected controls.
- [ ] Add “Enable AI across organizations” and “Enable semantic search embeddings” controls with explanatory copy that these settings affect every organization.
- [ ] Use React Query mutation state to disable the control while saving, show success/failure feedback, and refresh the displayed persisted values.
- [ ] In the organization AI settings page, hide provider/model/key/base URL/prompt controls when either the system or organization AI flag is off; show a system-disabled explanation when applicable.
- [ ] On member Preferences, show when system gates currently override personal AI or semantic-search preferences, without changing the member's saved choices.
- [ ] Inspect admin/member navigation, API paths, and switch state handling statically.

### Task 6: Final cross-feature static review

**Files:**
- Review: all files in Tasks 1–5.

- [ ] Confirm stored defaults preserve existing behavior before the first admin change.
- [ ] Confirm system AI off bypasses provider calls for interactive AI, spam checking, and summary generation; the summary worker still completes with the basic digest.
- [ ] Confirm semantic search off resets Meilisearch embeddings at runtime and startup, prevents hybrid queries, and preserves lexical access filtering and pagination.
- [ ] Confirm organization/member preferences remain additional opt-outs and global controls are writable only by authenticated admins.
- [ ] Run `git diff --check` without running tests; report any line-ending warnings separately from whitespace errors.
- [ ] Update the SDD ledger and report static review outcomes. Do not commit.
