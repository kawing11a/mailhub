# AI Availability and Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI and Meilisearch embeddings individually controllable, and keep mail, spam, summary, and search workflows usable when their providers are disabled or unavailable.

**Architecture:** Keep the existing organization-level AI setting as the admin-controlled provider master switch. Add AI and semantic-search preferences to the authenticated organization membership, enforce AI availability in a shared organization-aware LLM client, and let optional background work fall back to local results or lexical search.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, Meilisearch JS SDK, BullMQ, existing local spam classifier.

## Global Constraints

- AI provider configuration and the master switch remain organization-scoped and admin-controlled.
- Personal AI and embedding preferences are scoped to the organization membership.
- A disabled organization master setting prevents provider calls even when environment credentials are configured.
- Automatic spam checks and queued summaries follow organization-level AI availability; interactive AI actions follow both organization and member settings.
- AI failures fall back only for optional AI work; unrelated persistence, search, and notification errors retain their existing behavior.
- Disabled or unavailable embedding requests retry as lexical/full-text Meilisearch queries.
- Hide provider, model, API key, base URL, and custom prompt controls while the organization AI master switch is off.

---

### Task 1: Persist organization-member AI and embedding preferences

**Files:**
- Modify: `prisma/schema.prisma` (`OrganizationMember`)
- Create: `prisma/migrations/20260929120000_add_member_ai_preferences/migration.sql`
- Create: `src/app/api/settings/preferences/route.ts`

**Interfaces:**
- `GET /api/settings/preferences` returns `{ personalAiEnabled: boolean, semanticSearchEnabled: boolean }` for the authenticated `(organizationId, userId)` membership.
- `PUT /api/settings/preferences` accepts either or both boolean fields and returns the saved preference object. Reject non-boolean provided values with 400. Never accept organization or user IDs from the request body.
- Add `personalAiEnabled Boolean @default(true) @map("personal_ai_enabled")` and `semanticSearchEnabled Boolean @default(true) @map("semantic_search_enabled")` to `OrganizationMember`.

- [ ] Add both default-true fields to `OrganizationMember` and their SQL columns to a new migration. Existing users retain current behavior by default.
- [ ] Inspect and preserve the existing uncommitted edits already present in `prisma/schema.prisma`; make only the targeted membership-field change.
- [ ] Implement authenticated GET using `prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: auth.organizationId, userId: auth.userId } } })`; return 404 if the membership is missing.
- [ ] Implement authenticated PUT using the same composite key, update only supplied fields, reject an empty body and non-boolean values, and return the saved values.
- [ ] Confirm the migration SQL uses `BOOLEAN NOT NULL DEFAULT TRUE` for both columns and is reversible through the normal migration history.

### Task 2: Add member switches and hide disabled organization AI configuration

**Files:**
- Modify: `src/app/(dashboard)/settings/preferences/page.tsx`
- Modify: `src/app/(dashboard)/settings/experiments/page.tsx`
- Modify: `src/app/api/experiments/settings/route.ts`

**Interfaces:**
- Preferences page loads and saves the Task 1 response. It exposes two independent switches: “AI features for me” and “Semantic search embeddings”. Save each change to `PUT /api/settings/preferences` and restore the prior switch value with a visible error if saving fails.
- Experimental Features continues to show `isAiEnabled` to admins. Provider/model/key/base URL/custom prompt controls render only when it is enabled.
- Partial PUT updates preserve omitted fields, including a currently disabled `isAiEnabled`; they must not silently reset AI to enabled.

- [ ] Add a query for `/api/settings/preferences` and mutation-backed controls using the existing React Query and toast conventions in the settings page.
- [ ] Make the organization master checkbox state control a conditional provider configuration section. Keep only that checkbox and a short explanation visible while disabled.
- [ ] When saving the master switch as off, send only `{ isAiEnabled: false }` so the hidden provider controls do not erase stored configuration. When saving it on, include the visible config fields.
- [ ] Update the Experimental Settings PUT handler to read the existing row and update only fields provided by the request. Preserve API key unless an explicit non-masked key value is sent.
- [ ] Change AI settings copy to explain that the switch disables organization AI processing and hides provider configuration.

### Task 3: Enforce AI availability in the shared LLM client and interactive routes

**Files:**
- Modify: `src/lib/ai/llm-client.ts`
- Modify: `src/lib/ai/summary-service.ts`
- Modify: `src/app/api/ai/draft/route.ts`
- Modify: `src/app/api/ai/explain/route.ts`
- Modify: `src/app/api/ai/toolbox/route.ts`

**Interfaces:**
- Add `AiUnavailableError` carrying a stable `reason` of `disabled` or `provider_unavailable`.
- `getResolvedAiConfig(organizationId: string, userId?: string)` reads exactly that organization’s ExperimentSetting; when `userId` is present it also enforces that member’s `personalAiEnabled` preference. It must never use `findFirst()` for organization settings.
- `callLlmApi` accepts required organization context and optional member context, checks the effective switches before `fetch`, applies a bounded request timeout, and translates network, timeout, non-2xx, invalid, or empty provider responses into `AiUnavailableError`.
- Interactive routes return 503 with `{ error, reason }` for disabled/provider-unavailable outcomes; validation, authorization, and account-access responses retain their existing status behavior.

- [ ] Add the stable error type and organization/member config resolution to `llm-client.ts`. When the organization setting explicitly has `isAiEnabled: false`, do not fall back to environment variables. Use environment values only for provider configuration when no organization row overrides them and AI is enabled.
- [ ] Add timeout and provider error translation to the shared client. Keep successful OpenAI-compatible and Claude response parsing unchanged.
- [ ] Replace the duplicate HTTP implementation in `summary-service.ts` with `callLlmApi`, passing provider settings and organization context through `AiSummarizeOptions`.
- [ ] Pass `auth.organizationId` and `auth.userId` from draft, explain, and toolbox routes to `callLlmApi`; map `AiUnavailableError` to the 503 response while keeping other failures at 500.
- [ ] Special-case toolbox `spam_check`: if AI is disabled for the organization/member or unavailable, return the local spam classifier’s decision, score, and reason. Keep other toolbox actions as explicit unavailable responses.

### Task 4: Keep automatic spam checks and summary jobs moving

**Files:**
- Modify: `src/lib/ai/spam-checker.ts`
- Modify: `src/lib/imap/connection-manager.ts`
- Modify: `src/lib/gmail/sync-manager.ts`
- Modify: `src/lib/queue/workers/summary.ts`
- Modify: `src/lib/ai/summary-service.ts`

**Interfaces:**
- `checkIsHighRisk(subject, snippet, fromAddress, organizationId)` always computes a local result first and uses it if AI is disabled/unavailable. On successful LLM classification, preserve the existing response shape.
- `generateFallbackEmailBatchDigest({ labelName, emails })` returns deterministic Markdown with a fallback label plus available subject, sender, date, and snippet for each message.
- `executeSummaryRun` uses the digest when AI is disabled or the provider throws `AiUnavailableError`; it continues to webhook dispatch and completion. Errors outside the AI invocation still fail the job.

- [ ] Pass each account’s `organizationId` to automatic spam checking from both IMAP and Gmail sync flows.
- [ ] Replace direct `AI_API_URL` calls in the spam checker with the shared organization-aware LLM client. For disabled or unavailable AI, malformed JSON, timeout, or provider errors, return the already-computed local classifier result.
- [ ] Implement `generateFallbackEmailBatchDigest` in `summary-service.ts`, using the existing email cleanup utilities and the available fields specified above. Label its output “Basic summary (AI unavailable)”.
- [ ] In the summary worker, do not fail a run solely because organization AI is off. Skip provider calls and use the digest; catch only `AiUnavailableError` around the model generation call and use the same digest.
- [ ] Preserve search/database failures, webhook failures, and other worker failures as failures; do not wrap the entire worker in the AI fallback catch.

### Task 5: Make semantic search member-controlled and resilient

**Files:**
- Modify: `src/app/api/emails/search/route.ts`

**Interfaces:**
- Search resolves `semanticSearchEnabled` using the authenticated organization membership. For enabled preferences, issue the current hybrid query with `embedder: 'default'`; for disabled preferences, omit `hybrid` entirely.
- If a hybrid query fails, retry once using the same query, filter, limit, and offset without `hybrid`. If the lexical retry fails, preserve the current 500 behavior.

- [ ] Read the current member’s preference after authentication and before issuing the Meilisearch request.
- [ ] Build shared base search parameters once so the retry uses identical access filters and pagination.
- [ ] Add `hybrid: { semanticRatio: 0.5, embedder: 'default' }` only for enabled members, and retry lexically if that hybrid request throws.
- [ ] Keep empty-result and account-access filtering behavior unchanged.

### Task 6: Review the final behavior and affected copy

**Files:**
- Review: `src/app/(dashboard)/settings/preferences/page.tsx`
- Review: `src/app/(dashboard)/settings/experiments/page.tsx`
- Review: `src/app/api/experiments/settings/route.ts`
- Review: `src/app/api/settings/preferences/route.ts`
- Review: `src/lib/ai/llm-client.ts`
- Review: `src/lib/ai/spam-checker.ts`
- Review: `src/lib/queue/workers/summary.ts`
- Review: `src/app/api/emails/search/route.ts`

- [ ] Inspect the final diff to confirm existing unrelated user changes are untouched.
- [ ] Manually trace these cases: organization AI off hides provider controls and blocks all model calls; member AI off blocks that member’s interactive calls; member embeddings off skips hybrid search; failed embeddings retry lexically; failed spam AI returns local scoring; disabled/failed summary AI produces a digest and continues notifications; unrelated errors still surface.
- [ ] Follow the repo’s `node_modules/next/dist/docs/` guidance for any Route Handler behavior changed during implementation.
