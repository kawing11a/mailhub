# Member Permission Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete member permissions across account data, dashboard, search, labels, signatures, settings, and AI features while preserving administrator access and current account-health changes.

**Architecture:** Integrate the existing account ownership/access model first, then make every protected resource query through shared organization/account predicates. Each route enforces authorization server-side; navigation and page guards provide the matching UI behavior. Tests are added at every API boundary before implementation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, TanStack React Query, Meilisearch, Jest 30, existing auth middleware and Redis/BullMQ services.

## Global Constraints

- Administrators access every account in their organization.
- Non-admin members access only accounts they own or have explicit access to.
- Members cannot access another organization’s data.
- UI visibility is not security enforcement; APIs must independently authorize.
- Members may create/modify labels only within the approved account-access rules.
- Members cannot access Members, Email Rules, or Experimental settings.
- Members have full signature access for accounts they can access.
- AI requests must authorize the referenced account/email/label before model calls.
- Preserve existing account-health fields, migrations, dirty worktree changes, and unrelated behavior.
- Do not add dependencies.
- Do not use destructive Git commands or reset the user’s dirty worktree.
- Run focused tests for every task and commit only that task’s files.

---

### Task 1: Integrate account ownership and shared access predicates

**Files:**
- Modify: `prisma/schema.prisma`
- Create or adapt: `prisma/migrations/20260817120000_add_email_account_owner/migration.sql`
- Create: `src/lib/accounts/access.ts`
- Modify: `src/lib/accounts/service.ts`
- Modify: `src/app/api/accounts/route.ts`
- Modify: `src/app/api/accounts/[id]/route.ts`
- Modify: `src/app/api/accounts/test-credentials/route.ts`
- Modify: `src/app/api/accounts/oauth/google/callback/route.ts`
- Modify: `src/app/api/accounts/oauth/microsoft/callback/route.ts`
- Modify: `src/app/api/org/members/[userId]/accounts/route.ts`
- Modify: `src/hooks/useFavouriteMutations.tsx`
- Tests: `src/__tests__/lib/accounts/access.test.ts`, `src/__tests__/lib/accounts/service.test.ts`, `src/__tests__/app/api/accounts-route.test.ts`, `src/__tests__/app/api/accounts-create-route.test.ts`, `src/__tests__/app/api/account-ownership-callbacks.test.ts`, `src/__tests__/app/api/org-member-accounts-route.test.ts`, `src/__tests__/app/api/test-credentials-route.test.ts`

**Interfaces:**
- Produce `accountAccessWhere(auth)`, an organization-scoped Prisma account filter where admins receive all organization accounts and members receive owner-or-explicit-access accounts.
- Produce `canManageAccountAccess(auth, account)`, true only for same-organization admins or the account owner.
- `createOwnedAccount(organizationId, ownerUserId, data)` creates the account and mandatory owner access row in one transaction.
- Preserve account-health fields already present in the current schema and account responses.

- [ ] **Step 1: Write failing schema/access tests.** Assert the owner relation and owner access relation exist, admin/member predicates differ correctly, and an owner row cannot be removed.
- [ ] **Step 2: Run the focused tests and confirm they fail** because current main does not expose the ownership/access interfaces.
- [ ] **Step 3: Port the ownership schema/migration and access module** from `codex/account-ownership-sharing`, reconciling the current account-health schema instead of replacing it.
- [ ] **Step 4: Port transactional account creation and OAuth owner/provider checks.** Members and admins may connect accounts; only admins or the existing account owner may reauthorize an existing mailbox; provider-confirmed mailbox identity is used for Microsoft and Google.
- [ ] **Step 5: Update account list/detail/test-credentials/member-access routes** to use the shared predicates while retaining health fields and admin-only edit/disconnect behavior.
- [ ] **Step 6: Run the focused ownership/access suite.** Expected: all owner, member, admin, cross-organization, and provider-mismatch tests pass.
- [ ] **Step 7: Validate Prisma and commit.**
  ```powershell
  npx prisma validate
  npx prisma generate
  npm test -- --runInBand src/__tests__/lib/accounts/access.test.ts src/__tests__/lib/accounts/service.test.ts src/__tests__/app/api/accounts-route.test.ts src/__tests__/app/api/accounts-create-route.test.ts src/__tests__/app/api/account-ownership-callbacks.test.ts src/__tests__/app/api/org-member-accounts-route.test.ts src/__tests__/app/api/test-credentials-route.test.ts
  git add prisma/schema.prisma prisma/migrations/20260817120000_add_email_account_owner/migration.sql src/lib/accounts/access.ts src/lib/accounts/service.ts src/app/api/accounts/route.ts src/app/api/accounts/[id]/route.ts src/app/api/accounts/test-credentials/route.ts src/app/api/accounts/oauth/google/callback/route.ts src/app/api/accounts/oauth/microsoft/callback/route.ts src/app/api/org/members/[userId]/accounts/route.ts src/hooks/useFavouriteMutations.tsx src/__tests__/lib/accounts/access.test.ts src/__tests__/lib/accounts/service.test.ts src/__tests__/app/api/accounts-route.test.ts src/__tests__/app/api/accounts-create-route.test.ts src/__tests__/app/api/account-ownership-callbacks.test.ts src/__tests__/app/api/org-member-accounts-route.test.ts src/__tests__/app/api/test-credentials-route.test.ts
  git commit -m "feat: integrate account ownership access"
  ```

**Review follow-up (2026-08-18):** Fixed the empty-list member access mutation gap in `src/app/api/org/members/[userId]/accounts/route.ts` by rejecting an otherwise no-op update when the target still has inaccessible non-owner grants. Added a regression in `src/__tests__/app/api/org-member-accounts-route.test.ts` and verified it with `npm test -- --runInBand src/__tests__/app/api/org-member-accounts-route.test.ts`.

---

### Task 2: Enforce member dashboard and search scope

**Files:**
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/api/emails/search/route.ts`
- Modify: `src/components/search/SearchModal.tsx` only if the API response contract requires a client change
- Tests: `src/__tests__/app/api/dashboard-route.test.ts`, `src/__tests__/app/api/search-route.test.ts`

**Interfaces:**
- Dashboard GET accepts `scope=system|user`; members requesting `system` receive 403.
- Dashboard user scope uses `accountAccessWhere(auth)` for every account, email, activity, and count query.
- Search GET keeps the existing query/limit/offset/folder parameters and applies an account filter before querying Meilisearch.

- [ ] **Step 1: Write failing dashboard tests.** Cover member system-scope 403, member user-scope filtering, admin system scope, and no inaccessible account IDs in returned data.
- [ ] **Step 2: Write failing search tests.** Cover admin organization search, member accessible-account filtering, member zero-access empty results, inaccessible explicit `accountId` rejection, and folder filtering.
- [ ] **Step 3: Run the focused tests and confirm failures** against the current unguarded system scope/search implementation.
- [ ] **Step 4: Implement the dashboard guard and shared account filter.** Reject member system scope before queue statistics or broad organization queries.
- [ ] **Step 5: Implement search account filtering.** Resolve accessible account IDs with Prisma; for members, reject an inaccessible requested account and return an empty result when no accessible IDs exist. Build a safe Meilisearch filter from organization ID plus allowed account IDs.
- [ ] **Step 6: Run focused tests and commit.**
  ```powershell
  npm test -- --runInBand src/__tests__/app/api/dashboard-route.test.ts src/__tests__/app/api/search-route.test.ts
  git add src/app/api/dashboard/route.ts src/app/api/emails/search/route.ts src/__tests__/app/api/dashboard-route.test.ts src/__tests__/app/api/search-route.test.ts
  git commit -m "feat: scope dashboard and search access"
  ```

---

### Task 3: Filter labels and restrict label-account assignment

**Files:**
- Modify: `src/app/api/labels/route.ts`
- Modify: `src/app/api/labels/[id]/route.ts`
- Modify: `src/app/api/labels/[id]/accounts/route.ts`
- Modify: `src/app/api/labels/[id]/emails/route.ts`
- Modify: `src/app/api/emails/labels/route.ts`
- Modify: `src/app/(dashboard)/settings/labels/page.tsx`
- Modify: `src/components/labels/AccountLabelList.tsx`
- Tests: `src/__tests__/app/api/labels-route.test.ts`, `src/__tests__/app/api/label-accounts-route.test.ts`, `src/__tests__/app/api/label-emails-route.test.ts`

**Interfaces:**
- Label GET returns only labels with at least one account visible to the actor, and returns only visible account IDs for members.
- Label create/update/delete preserves the existing label schema and organization ownership.
- Member account assignment accepts only IDs matching `accountAccessWhere(auth)`.
- Label email reads/writes verify both label organization and email account visibility.

- [ ] **Step 1: Write failing label tests.** Cover member label filtering, inaccessible account IDs removed from responses, member assignment rejection, cross-organization rejection, and admin organization-wide assignment.
- [ ] **Step 2: Run the focused label tests and confirm current organization-only queries fail the member cases.
- [ ] **Step 3: Implement relation filters.** Use nested account access predicates for label reads and account assignment validation; validate all requested account IDs before mutation.
- [ ] **Step 4: Update the label UI** to use the filtered account list and show only permitted assignments; preserve member label creation and modification.
- [ ] **Step 5: Run tests and commit.**
  ```powershell
  npm test -- --runInBand src/__tests__/app/api/labels-route.test.ts src/__tests__/app/api/label-accounts-route.test.ts src/__tests__/app/api/label-emails-route.test.ts
  git add src/app/api/labels/route.ts src/app/api/labels/[id]/route.ts src/app/api/labels/[id]/accounts/route.ts src/app/api/labels/[id]/emails/route.ts src/app/api/emails/labels/route.ts src/app/(dashboard)/settings/labels/page.tsx src/components/labels/AccountLabelList.tsx src/__tests__/app/api/labels-route.test.ts src/__tests__/app/api/label-accounts-route.test.ts src/__tests__/app/api/label-emails-route.test.ts
  git commit -m "feat: scope labels to account access"
  ```

---

### Task 4: Enforce signature access by account

**Files:**
- Modify: `src/app/api/accounts/[id]/signatures/route.ts`
- Modify: `src/app/api/signatures/[id]/route.ts`
- Modify: `src/app/api/signatures/[id]/set-default/route.ts`
- Modify: `src/app/(dashboard)/settings/signatures/page.tsx` if its account list needs filtering
- Tests: `src/__tests__/app/api/signatures-route.test.ts`, `src/__tests__/app/api/signature-set-default-route.test.ts`

**Interfaces:**
- Every signature route resolves its account through `accountAccessWhere(auth)`.
- Admins can list/create/update/delete/set-default signatures for any organization account.
- Members can perform the same operations only for accessible accounts.

- [ ] **Step 1: Write failing signature tests.** Cover member CRUD on an accessible account, member 403/404 on an inaccessible account, member cross-organization rejection, and admin access to another member’s account.
- [ ] **Step 2: Run the focused tests and confirm current organization-only signature queries allow inaccessible account operations.
- [ ] **Step 3: Add account access predicates to every signature query and mutation.** Check the account before reading or modifying the signature and preserve existing default-signature constraints.
- [ ] **Step 4: Verify the signatures page receives only accessible accounts.**
- [ ] **Step 5: Run tests and commit.**
  ```powershell
  npm test -- --runInBand src/__tests__/app/api/signatures-route.test.ts src/__tests__/app/api/signature-set-default-route.test.ts
  git add src/app/api/accounts/[id]/signatures/route.ts src/app/api/signatures/[id]/route.ts src/app/api/signatures/[id]/set-default/route.ts src/app/(dashboard)/settings/signatures/page.tsx src/__tests__/app/api/signatures-route.test.ts src/__tests__/app/api/signature-set-default-route.test.ts
  git commit -m "feat: enforce signature account access"
  ```

---

### Task 5: Restrict members settings, rules, and experimental features

**Files:**
- Modify: `src/app/(dashboard)/settings/layout.tsx`
- Modify: `src/app/(dashboard)/settings/members/page.tsx`
- Modify: `src/app/(dashboard)/settings/rules/page.tsx`
- Modify: `src/app/(dashboard)/settings/experiments/page.tsx`
- Modify: `src/app/api/rules/route.ts`
- Modify: `src/app/api/rules/[id]/route.ts`
- Modify: `src/app/api/rules/[id]/run/route.ts`
- Modify: `src/app/api/rules/test/route.ts`
- Modify: `src/app/api/experiments/settings/route.ts`
- Modify: `src/app/api/experiments/webhooks/route.ts`
- Modify: `src/app/api/experiments/webhooks/[id]/route.ts`
- Modify: `src/app/api/experiments/webhooks/test/route.ts`
- Modify: `src/app/api/experiments/summary/trigger/route.ts`
- Modify: `src/app/api/experiments/summary/[id]/route.ts`
- Tests: `src/__tests__/app/api/rules-permissions.test.ts`, `src/__tests__/app/api/experiment-permissions.test.ts`, `src/__tests__/components/settings/settings-navigation.test.tsx`

**Interfaces:**
- Use `requireAdmin(auth)` at the start of every rules/experimental API handler.
- Navigation omits Members, Rules, and Experimental links for members.
- Direct member requests to these pages render an authorization fallback or redirect without fetching protected data.

- [ ] **Step 1: Write failing permission tests** for each route family and navigation role.
- [ ] **Step 2: Run the tests and confirm members currently receive data or page links.
- [ ] **Step 3: Add API admin guards before body parsing, database reads, mutations, queue calls, or provider calls.
- [ ] **Step 4: Update settings navigation and direct-page guards.** Preserve account, labels, signatures, preferences, and security settings.
- [ ] **Step 5: Run focused tests and commit.**
  ```powershell
  npm test -- --runInBand src/__tests__/app/api/rules-permissions.test.ts src/__tests__/app/api/experiment-permissions.test.ts src/__tests__/components/settings/settings-navigation.test.tsx
  git add src/app/(dashboard)/settings/layout.tsx src/app/(dashboard)/settings/members/page.tsx src/app/(dashboard)/settings/rules/page.tsx src/app/(dashboard)/settings/experiments/page.tsx src/app/api/rules/route.ts src/app/api/rules/[id]/route.ts src/app/api/rules/[id]/run/route.ts src/app/api/rules/test/route.ts src/app/api/experiments/settings/route.ts src/app/api/experiments/webhooks/route.ts src/app/api/experiments/webhooks/[id]/route.ts src/app/api/experiments/webhooks/test/route.ts src/app/api/experiments/summary/trigger/route.ts src/app/api/experiments/summary/[id]/route.ts src/__tests__/app/api/rules-permissions.test.ts src/__tests__/app/api/experiment-permissions.test.ts src/__tests__/components/settings/settings-navigation.test.tsx
  git commit -m "feat: restrict member settings"
  ```

---

### Task 6: Authorize all AI features by account context

**Files:**
- Modify: `src/app/api/ai/draft/route.ts`
- Modify: `src/app/api/ai/explain/route.ts`
- Modify: `src/app/api/ai/toolbox/route.ts`
- Modify: `src/app/api/ai/spam/label/route.ts`
- Modify: `src/app/api/ai/spam/stats/route.ts`
- Modify: `src/app/api/ai/spam/dataset/route.ts`
- Modify: `src/components/email/ComposeAiWriter.tsx`
- Modify: `src/components/email/EmailExplainPanel.tsx`
- Modify: `src/components/labels/summarize-label-modal.tsx`
- Tests: `src/__tests__/app/api/ai-permissions.test.ts`

**Interfaces:**
- Add a shared `assertAccountAccess(auth, accountId)` helper that returns an accessible account or a 403 response.
- Stored-email AI calls accept `emailId` or `accountId`; the server resolves the email’s account and checks access.
- Label summary calls accept `labelId`; the server verifies the label has at least one accessible account.
- Draft/toolbox calls from the UI include the selected account ID in the request body.
- Missing required resource context returns 400 before any model call.

- [ ] **Step 1: Write failing AI permission tests.** Cover accessible member account, inaccessible account, cross-organization account, missing context, and admin organization-wide access for each route family.
- [ ] **Step 2: Run the focused tests and confirm current routes call the model without authentication/access checks.
- [ ] **Step 3: Implement authentication and resource resolution before `callLlmApi` or training mutations.** Reuse the shared account predicate and return 401/403/400 without exposing email content.
- [ ] **Step 4: Update client callers** to send accountId/emailId/labelId from their existing selected context.
- [ ] **Step 5: Run tests and commit.**
  ```powershell
  npm test -- --runInBand src/__tests__/app/api/ai-permissions.test.ts
  git add src/app/api/ai/draft/route.ts src/app/api/ai/explain/route.ts src/app/api/ai/toolbox/route.ts src/app/api/ai/spam/label/route.ts src/app/api/ai/spam/stats/route.ts src/app/api/ai/spam/dataset/route.ts src/components/email/ComposeAiWriter.tsx src/components/email/EmailExplainPanel.tsx src/components/labels/summarize-label-modal.tsx src/__tests__/app/api/ai-permissions.test.ts
  git commit -m "feat: enforce AI account permissions"
  ```

---

### Task 7: Align member-facing account and settings UI

**Files:**
- Modify: `src/app/(dashboard)/settings/accounts/page.tsx`
- Modify: `src/app/(dashboard)/settings/labels/page.tsx`
- Modify: `src/app/(dashboard)/settings/signatures/page.tsx`
- Modify: `src/components/sidebar/AccountsSection.tsx`
- Modify: `src/components/sidebar/Sidebar.tsx`
- Modify: `src/components/settings/AddAccountModal.tsx`
- Modify: `src/components/settings/ManageAccountAccessModal.tsx`
- Tests: `src/__tests__/components/member-permission-navigation.test.tsx`, `src/__tests__/components/member-account-actions.test.tsx`

**Interfaces:**
- Members see only accessible account rows and member-allowed actions.
- Admins retain organization-wide account rows, edit/disconnect controls, and access management.
- Account creation and post-connect sharing use the integrated ownership/access API.
- Label/signature controls use filtered account data from Tasks 3 and 4.

- [ ] **Step 1: Write failing UI tests** for member account creation, restricted buttons, accessible-only account selectors, and hidden settings links.
- [ ] **Step 2: Run focused UI tests and confirm current main still shows admin-only or organization-wide behavior.
- [ ] **Step 3: Apply the integrated account sharing UI** while preserving account-health indicators and existing dirty UI changes.
- [ ] **Step 4: Align labels and signatures account selectors** with accessible account query results.
- [ ] **Step 5: Run focused UI tests and commit.**
  ```powershell
  npm test -- --runInBand src/__tests__/components/member-permission-navigation.test.tsx src/__tests__/components/member-account-actions.test.tsx
  git add src/app/(dashboard)/settings/accounts/page.tsx src/app/(dashboard)/settings/labels/page.tsx src/app/(dashboard)/settings/signatures/page.tsx src/components/sidebar/AccountsSection.tsx src/components/sidebar/Sidebar.tsx src/components/settings/AddAccountModal.tsx src/components/settings/ManageAccountAccessModal.tsx src/__tests__/components/member-permission-navigation.test.tsx src/__tests__/components/member-account-actions.test.tsx
  git commit -m "feat: align member permission UI"
  ```

---

### Task 8: Full integration verification and final review

**Files:**
- Modify only files required by verified failures.
- Tests: all focused suites and full repository suite.

- [ ] **Step 1: Run Prisma checks.**
  ```powershell
  npx prisma validate
  npx prisma generate
  ```
- [ ] **Step 2: Run all focused permission suites.**
  ```powershell
  npm test -- --runInBand src/__tests__/lib/accounts/access.test.ts src/__tests__/app/api/dashboard-route.test.ts src/__tests__/app/api/search-route.test.ts src/__tests__/app/api/labels-route.test.ts src/__tests__/app/api/label-accounts-route.test.ts src/__tests__/app/api/signatures-route.test.ts src/__tests__/app/api/rules-permissions.test.ts src/__tests__/app/api/experiment-permissions.test.ts src/__tests__/app/api/ai-permissions.test.ts src/__tests__/components/member-permission-navigation.test.tsx src/__tests__/components/member-account-actions.test.tsx
  ```
- [ ] **Step 3: Run the full suite and type/build checks.**
  ```powershell
  npm test -- --runInBand
  npx tsc --noEmit
  npm run build
  git diff --check
  git status --short --untracked-files=all
  ```
- [ ] **Step 4: Review the final diff** for organization leaks, credential/token exposure, unauthorized queue/model calls, and accidental modifications to the user’s dirty changes.
- [ ] **Step 5: Commit only verified fixes** with `fix: complete member permission verification`.

