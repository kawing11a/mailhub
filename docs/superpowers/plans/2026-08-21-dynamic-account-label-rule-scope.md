# Dynamic Account-Label Rule Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic account-label target mode to Email Rules so rules automatically follow current account-label assignments and removals.

**Architecture:** Preserve the existing nullable `EmailRule.accountId` scope and add a nullable `EmailRule.accountLabelId` relation to `Label`. Resolve label membership at rule-evaluation time and when running rules retroactively; never copy account IDs into a rule. Keep scope validation and evaluation defensive by checking organization ownership, mutually exclusive fields, and the email account’s current label IDs.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, React 19, TanStack React Query, Prisma 7, PostgreSQL, Tailwind CSS 4, Jest 30, ts-jest.

## Global Constraints

- Preserve all existing uncommitted user changes; modify only files required by this feature.
- Existing rules with `accountId = null` or a specific `accountId` must retain their behavior.
- The new label scope stores one `accountLabelId`; it does not snapshot or persist a list of account IDs.
- A rule may use exactly one scope mode: all accounts, one account, or one account label.
- Rule APIs remain administrator-only as they are in the current branch.
- Read the relevant Next.js guide in `node_modules/next/dist/docs/` before writing application code, per `AGENTS.md`.
- Use `apply_patch` for source edits and run focused tests after each task.

## Files and Responsibilities

- Modify `prisma/schema.prisma`: add the nullable rule-to-label relation.
- Create `prisma/migrations/20260821120000_add_email_rule_account_label_scope/migration.sql`: add the nullable database column, index, and foreign key.
- Modify `src/lib/rules/types.ts`: represent account-label scope and account label IDs on evaluation input.
- Modify `src/lib/rules/engine.ts`: enforce label scope in pure evaluation and load current account labels for new-email processing.
- Create `src/lib/rules/scope.ts`: centralize UI scope-mode inference and payload construction.
- Create `src/__tests__/lib/rules/scope.test.ts`: test scope-mode and payload behavior.
- Modify `src/app/api/rules/route.ts`: validate, persist, and return `accountLabelId` scope.
- Modify `src/app/api/rules/[id]/route.ts`: validate and update label scope while preserving omitted PUT fields.
- Modify `src/app/api/rules/[id]/run/route.ts`: select current accounts through the target label and pass current label IDs into evaluation.
- Modify `src/app/api/rules/test/route.ts`: accept sample account label IDs and label-scoped rule input.
- Modify `src/components/rules/RuleModal.tsx`: render all/account/label scope modes and submit mutually exclusive IDs.
- Modify `src/app/(dashboard)/settings/rules/page.tsx`: display the selected account label in the rule summary.
- Modify `src/__tests__/lib/rules/engine.test.ts`: cover label-scope matching and dynamic removal.
- Modify `src/__tests__/app/api/rules-routes.test.ts`: cover label validation and persistence.
- Modify `src/__tests__/components/rules/RuleModal.test.tsx`: cover scope-mode rendering through the existing lightweight test setup.

### Task 1: Add the nullable account-label relation

**Files:**
- Modify: `prisma/schema.prisma:170-190, 350-372`
- Create: `prisma/migrations/20260821120000_add_email_rule_account_label_scope/migration.sql`

**Interfaces:**
- Produces `EmailRule.accountLabelId`, `EmailRule.accountLabel`, and `Label.accountScopedRules` for API and engine tasks.

- [ ] **Step 1: Update the Prisma schema.**

Add this field and relation to `EmailRule`:

```prisma
accountLabelId String? @map("account_label_id") @db.Uuid

accountLabel Label? @relation("EmailRuleAccountLabel", fields: [accountLabelId], references: [id], onDelete: Cascade)
```

Add this relation to `Label`:

```prisma
accountScopedRules EmailRule[] @relation("EmailRuleAccountLabel")
```

Add `@@index([accountLabelId])` to `EmailRule`.

- [ ] **Step 2: Create the SQL migration.**

Create `prisma/migrations/20260821120000_add_email_rule_account_label_scope/migration.sql` with:

```sql
ALTER TABLE "email_rules"
ADD COLUMN "account_label_id" UUID;

CREATE INDEX "email_rules_account_label_id_idx"
ON "email_rules"("account_label_id");

ALTER TABLE "email_rules"
ADD CONSTRAINT "email_rules_account_label_id_fkey"
FOREIGN KEY ("account_label_id") REFERENCES "labels"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Validate the schema and regenerate Prisma types.**

Run:

```powershell
npx prisma validate
npx prisma generate
```

Expected: both commands exit with code 0.

- [ ] **Step 4: Commit the schema change.**

```powershell
git add prisma/schema.prisma prisma/migrations/20260821120000_add_email_rule_account_label_scope/migration.sql
git commit -m "feat(rules): add account-label scope storage"
```

### Task 2: Add pure scope behavior and evaluator coverage

**Files:**
- Modify: `src/lib/rules/types.ts:35-55`
- Modify: `src/lib/rules/engine.ts:110-245`
- Create: `src/lib/rules/scope.ts`
- Create: `src/__tests__/lib/rules/scope.test.ts`
- Modify: `src/__tests__/lib/rules/engine.test.ts:120-220`

**Interfaces:**
- Produces `RuleScopeMode = 'all' | 'account' | 'label'`.
- Produces `getRuleScopeMode(rule)` and `buildRuleScopePayload(mode, accountId, accountLabelId)`.
- Extends `EmailEvaluationInput` with `accountLabelIds?: string[] | null`.
- Extends `EmailRuleDefinition` with `accountLabelId?: string | null`.

- [ ] **Step 1: Write failing scope helper tests.**

Add these behaviors to `scope.test.ts`:

```ts
it('infers label mode when accountLabelId is set', () => {
  expect(getRuleScopeMode({ accountId: null, accountLabelId: 'label-1' })).toBe('label');
});

it('builds a label-scoped payload without copying account IDs', () => {
  expect(buildRuleScopePayload('label', null, 'label-1')).toEqual({
    accountId: null,
    accountLabelId: 'label-1',
  });
});

it('builds all-account and specific-account payloads', () => {
  expect(buildRuleScopePayload('all', null, null)).toEqual({ accountId: null, accountLabelId: null });
  expect(buildRuleScopePayload('account', 'account-1', null)).toEqual({ accountId: 'account-1', accountLabelId: null });
});
```

- [ ] **Step 2: Run the helper tests and verify the expected failure.**

Run `npx jest src/__tests__/lib/rules/scope.test.ts --runInBand`. Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the scope helper and type extensions.**

Implement `getRuleScopeMode` so it prefers `accountLabelId`, then `accountId`, then all-account mode. Implement `buildRuleScopePayload` so it returns only the two nullable scope fields and sets the unused field to `null`. Add the two new type properties without changing existing names.

- [ ] **Step 4: Run the helper tests and verify they pass.**

Run the same Jest command. Expected: all scope helper tests pass.

- [ ] **Step 5: Write failing label-scope evaluator tests.**

Add to `engine.test.ts`:

```ts
it('matches a rule when the email account currently has the target label', () => {
  const rule = { ...baseRule, accountLabelId: 'label-vip' };
  expect(evaluateRule({ ...sampleEmail, accountLabelIds: ['label-vip'] }, rule)).toBe(true);
});

it('stops matching after the target account label is removed', () => {
  const rule = { ...baseRule, accountLabelId: 'label-vip' };
  expect(evaluateRule({ ...sampleEmail, accountLabelIds: [] }, rule)).toBe(false);
});
```

- [ ] **Step 6: Run the evaluator tests and verify the expected failure.**

Run `npx jest src/__tests__/lib/rules/engine.test.ts --runInBand`. Expected: the new label-scope tests fail because the evaluator does not enforce `accountLabelId` yet.

- [ ] **Step 7: Implement label-scope enforcement and re-run the tests.**

In `evaluateRule`, after the existing `accountId` check, reject a rule when `rule.accountLabelId` is set and `email.accountLabelIds` does not contain it. Preserve all-account behavior when both fields are null. Run both scope and engine test files and require all tests to pass.

- [ ] **Step 8: Commit the pure behavior.**

```powershell
git add src/lib/rules/types.ts src/lib/rules/scope.ts src/lib/rules/engine.ts src/__tests__/lib/rules/scope.test.ts src/__tests__/lib/rules/engine.test.ts
git commit -m "feat(rules): evaluate dynamic account-label scope"
```

### Task 3: Extend rule CRUD validation and responses

**Files:**
- Modify: `src/app/api/rules/route.ts:25-145`
- Modify: `src/app/api/rules/[id]/route.ts:25-145`
- Modify: `src/__tests__/app/api/rules-routes.test.ts:45-130`

**Interfaces:**
- Consumes the Prisma relation from Task 1.
- Produces rule CRUD payloads with optional nullable `accountLabelId`.

- [ ] **Step 1: Write failing API tests.**

Add tests that POST accepts an organization-owned `accountLabelId` and persists it; rejects both non-null scope IDs with status 400; rejects a label from another organization with status 404; and verifies PUT rejects an effective state where an omitted existing scope field would make both IDs non-null. Extend the Prisma mock with `label.findFirst` and include `accountLabel` in returned fixtures.

- [ ] **Step 2: Run the API tests and verify the expected failure.**

Run `npx jest src/__tests__/app/api/rules-routes.test.ts --runInBand`. Expected: the new cases fail because the route schemas and writes do not handle `accountLabelId`.

- [ ] **Step 3: Implement CRUD validation and relation responses.**

Add `accountLabelId: z.string().uuid().optional().nullable()` to create and update schemas. Verify supplied accounts and labels belong to `session.organizationId`. Reject both non-null fields. For PUT, compute effective values from omitted fields plus the existing record before checking exclusivity; preserve omitted fields and allow explicit `null` to clear scope. Include `accountLabel: { select: { id: true, name: true, color: true } }` in GET, POST, and PUT responses.

- [ ] **Step 4: Run route and permission tests, then commit.**

Run `npx jest src/__tests__/app/api/rules-routes.test.ts src/__tests__/app/api/rules-permissions.test.ts --runInBand`. Expected: all selected tests pass.

```powershell
git add src/app/api/rules/ src/__tests__/app/api/rules-routes.test.ts
git commit -m "feat(rules): support account-label scope in API"
```

### Task 4: Resolve current account labels during automatic and retroactive execution

**Files:**
- Modify: `src/lib/rules/engine.ts:190-330`
- Modify: `src/app/api/rules/[id]/run/route.ts:20-130`
- Modify: `src/app/api/rules/test/route.ts:15-100`
- Modify: `src/__tests__/lib/rules/engine.test.ts:250-340`
- Modify: `src/__tests__/app/api/rules-routes.test.ts:145-235`

**Interfaces:**
- Consumes `accountLabelId` rule records and current `AccountLabel` assignments.
- Produces evaluation inputs containing current `accountLabelIds`.

- [ ] **Step 1: Extend the automatic-processing fixtures before implementation.**

Change the existing email lookup expectation to include:

```ts
include: {
  body: true,
  emailLabels: true,
  account: { select: { accountLabels: { select: { labelId: true } } } },
}
```

Add a label-scoped rule with `accountLabelId: 'label-vip'` and an email account returning `accountLabels: [{ labelId: 'label-vip' }]`. Add a second case with an empty assignment list proving the rule stops matching after removal.

- [ ] **Step 2: Run the engine tests and verify the expected failure.**

Run `npx jest src/__tests__/lib/rules/engine.test.ts --runInBand`. Expected: the new automatic-processing case fails because current account labels are not queried or mapped.

- [ ] **Step 3: Implement dynamic automatic processing.**

In `processRulesForNewEmail`, include rules that are all-account, match `accountId`, or have an `accountLabel` relation containing an `AccountLabel` row for the incoming account. Include the email’s current account labels, map `accountLabelId` into each definition, and map current label IDs into the evaluation input. Keep the pure evaluator scope guard as the final check.

- [ ] **Step 4: Write the retroactive selection test.**

Add a run-route test where `ruleRecord.accountLabelId` is `label-vip`. Assert `emailAccount.findMany` receives an organization filter containing `accountLabels: { some: { labelId: 'label-vip' } }`, and assert the email select includes current account labels before applying the action.

- [ ] **Step 5: Run the route test and verify the expected failure.**

Run `npx jest src/__tests__/app/api/rules-routes.test.ts --runInBand`. Expected: the new retroactive selection assertion fails because the route currently filters only by `accountId`.

- [ ] **Step 6: Implement retroactive execution and dry-run input.**

In the run route, build the account filter from current scope; for label scope use `accountLabels: { some: { labelId: ruleRecord.accountLabelId } }`; include current account labels with each email; and map both new scope fields into evaluation. In the dry-run route, add optional `sampleEmail.accountLabelIds` and optional `rule.accountLabelId` to validation and evaluation input.

- [ ] **Step 7: Run execution tests and commit.**

Run `npx jest src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts src/__tests__/app/api/rules-permissions.test.ts --runInBand`. Expected: all selected tests pass.

```powershell
git add src/lib/rules/engine.ts src/app/api/rules/[id]/run/route.ts src/app/api/rules/test/route.ts src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts
git commit -m "feat(rules): follow account-label changes during execution"
```

### Task 5: Add the account-label target mode to the rule builder

**Files:**
- Modify: `src/components/rules/RuleModal.tsx:35-260, 289-335`
- Modify: `src/app/(dashboard)/settings/rules/page.tsx:200-245`
- Modify: `src/__tests__/components/rules/RuleModal.test.tsx`
- Modify: `src/lib/rules/scope.ts`
- Modify: `src/__tests__/lib/rules/scope.test.ts`

**Interfaces:**
- Consumes `accounts` and `labels` already fetched by the settings page.
- Produces payloads from `buildRuleScopePayload` with `accountId` and `accountLabelId`.

- [ ] **Step 1: Write failing UI scope tests.**

Extend helper tests for specific-account and all-account inference. Update `RuleModal.test.tsx` to render an open modal with mocked accounts/labels and assert static markup includes `Target Account Scope`, `All Connected Accounts`, and `Account Label`.

- [ ] **Step 2: Run the UI tests and verify the expected failure.**

Run `npx jest src/__tests__/lib/rules/scope.test.ts src/__tests__/components/rules/RuleModal.test.tsx --runInBand`. Expected: the new inference or markup assertions fail because the modal currently supports only one dropdown mode.

- [ ] **Step 3: Implement scope state and controls.**

Add `scopeMode`, `accountId`, and `accountLabelId` state. Infer mode on edit and reset it on create. Replace the current target dropdown with a mode selector containing All Connected Accounts, Specific Account, and Account Label. Render the account picker only for account mode and the label picker only for label mode. Show the current assigned-account count when the label response supplies `accountIds`, but submit only the label ID.

Build the request with:

```ts
const scope = buildRuleScopePayload(scopeMode, accountId, accountLabelId);
const payload = { ...otherRuleFields, ...scope };
```

- [ ] **Step 4: Update the rule list summary.**

Show `rule.accountLabel` name/color when `rule.accountLabelId` is set, keep the existing account badge when `rule.account` is set, and show `All Accounts` otherwise.

- [ ] **Step 5: Run UI tests and commit.**

Run `npx jest src/__tests__/lib/rules/scope.test.ts src/__tests__/components/rules/RuleModal.test.tsx src/__tests__/components/settings/settings-navigation.test.tsx --runInBand`. Expected: all selected tests pass.

```powershell
git add src/components/rules/RuleModal.tsx src/app/(dashboard)/settings/rules/page.tsx src/lib/rules/scope.ts src/__tests__/components/rules/RuleModal.test.tsx src/__tests__/lib/rules/scope.test.ts
git commit -m "feat(rules): add account-label target picker"
```

### Task 6: Full verification and migration safety check

**Files:**
- Verify: all changed files from Tasks 1-5
- No new production files in this task

- [ ] **Step 1: Read the applicable Next.js route-handler guide.**

Run:

```powershell
Get-Content -Raw node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
```

Confirm modified handlers use the current Next.js 16 request and params conventions.

- [ ] **Step 2: Validate Prisma and TypeScript.**

Run `npx prisma validate`, `npx prisma generate`, and `npx tsc --noEmit`. Expected: all commands exit 0.

- [ ] **Step 3: Run the focused regression suite.**

Run:

```powershell
npx jest src/__tests__/lib/rules src/__tests__/app/api/rules-routes.test.ts src/__tests__/app/api/rules-permissions.test.ts src/__tests__/components/rules/RuleModal.test.tsx src/__tests__/components/settings/settings-navigation.test.tsx --runInBand
```

Expected: all selected suites pass with zero failures.

- [ ] **Step 4: Run the full test suite.**

Run `npm test -- --runInBand`. Expected: all repository tests pass. If unrelated pre-existing modified files affect the result, report the exact failing suites and do not revert them.

- [ ] **Step 5: Inspect the final diff.**

Run `git diff --check`, `git diff --stat`, and `git status --short`. Confirm there are no debug logs, no copied account-ID snapshots, and no modifications to unrelated user work.

- [ ] **Step 6: Commit only any verified remaining feature changes.**

If all feature files were committed in Tasks 1-5, do not create a no-op commit. Otherwise stage only the remaining verified feature files and use commit message `test(rules): verify dynamic account-label scope`.
