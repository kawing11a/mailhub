# Allow Email Rules Without Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow rules with no incoming-email criteria to match every incoming email within their configured scope.

**Architecture:** Preserve the existing `{ conditions: { matchType, criteria } }` JSON shape and use `criteria: []` as the unconditional form. The rule evaluator will perform active/scope checks first and treat an empty criteria list as a match; the RuleModal will allow removing the final condition and explain the resulting behavior.

**Tech Stack:** Next.js 16.2.9, React 19, TypeScript, Zod, Prisma JSON rule definitions, Jest with ts-jest.

## Global Constraints

- Keep `matchType` in the stored condition shape for compatibility; it has no effect when `criteria` is empty.
- Existing `ALL` and `ANY` semantics must remain unchanged when criteria are present.
- Preserve account and account-label scope checks before unconditional matching.
- Keep requiring at least one action in the RuleModal.
- Do not add a database migration or introduce a new condition mode.
- Preserve unrelated existing and uncommitted work in the repository.

---

### Task 1: Make empty criteria valid and unconditional in the rule engine

**Files:**
- Modify: `src/lib/rules/engine.ts:169-187`
- Modify: `src/app/api/rules/route.ts:20-23`
- Modify: `src/app/api/rules/[id]/route.ts:20-23`
- Test: `src/__tests__/lib/rules/engine.test.ts`
- Test: `src/__tests__/app/api/rules-routes.test.ts`

**Interfaces:**
- Consumes: `EmailRuleDefinition.conditions.criteria`, `EmailEvaluationInput.accountId`, and `EmailEvaluationInput.accountLabelIds`.
- Produces: `evaluateRule(email, rule)` returns `true` for an active, in-scope rule with `criteria: []`; create/update APIs accept that array.

- [ ] **Step 1: Add failing evaluator tests for unconditional rules**

Add tests beside the existing `evaluateRule` match-type tests:

```ts
it('matches every email when criteria is empty', () => {
  const rule = {
    ...baseRule,
    conditions: { matchType: 'ALL', criteria: [] },
  };

  expect(evaluateRule(sampleEmail, rule)).toBe(true);
});

it('still enforces account scope when criteria is empty', () => {
  const rule = {
    ...baseRule,
    accountId: 'acc-2',
    conditions: { matchType: 'ALL', criteria: [] },
  };

  expect(evaluateRule(sampleEmail, rule)).toBe(false);
});
```

- [ ] **Step 2: Run the evaluator tests and verify the new tests fail**

Run:

```bash
npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts
```

Expected: the new unconditional-match test fails because `evaluateRule` currently returns `false` for an empty criteria list; existing tests continue to run.

- [ ] **Step 3: Implement the empty-criteria evaluator rule**

In `evaluateRule`, retain the active and scope checks, then replace the empty-list rejection with:

```ts
const { matchType, criteria } = rule.conditions;
if (!criteria || criteria.length === 0) return true;

if (matchType === 'ANY') {
  return criteria.some((c) => evaluateCriterion(email, c));
}
```

This makes an empty list an unconstrained condition while leaving non-empty `ALL` and `ANY` evaluation unchanged.

- [ ] **Step 4: Allow zero criteria in create and update validation**

Change both route schemas from:

```ts
criteria: z.array(ruleCriterionSchema).min(1, 'At least one condition is required'),
```

to:

```ts
criteria: z.array(ruleCriterionSchema),
```

Leave the test-rule route’s existing zero-or-more `z.array(...)` schema unchanged.

- [ ] **Step 5: Update API tests for the new contract**

Change the existing “rejects payload missing criteria” test to omit the `criteria` property entirely, so it still verifies that the criteria field is required. Add a create-route test with `criteria: []` and an action, and add a dry-run test with `criteria: []` that expects `{ matched: true }`.

- [ ] **Step 6: Run the engine and API tests**

Run:

```bash
npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts
```

Expected: all tests pass, including unconditional matches, scope rejection, empty-criteria creation, and dry-run evaluation.

- [ ] **Step 7: Commit the focused rule-engine/API change**

```bash
git add -- src/lib/rules/engine.ts src/app/api/rules/route.ts src/app/api/rules/[id]/route.ts src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts
git commit -m "feat: allow unconditional email rules"
```

### Task 2: Update the RuleModal to permit no conditions

**Files:**
- Modify: `src/components/rules/RuleModal.tsx:103-118,157-163,221-230,428-438,440-442,526-533`
- Test: `src/__tests__/components/rules/RuleModal.test.tsx`

**Interfaces:**
- Consumes: existing `initialRule.conditions.criteria` and `matchType` state.
- Produces: RuleModal submits `conditions.criteria: []` when the user removes every condition and keeps the existing action requirement.

- [ ] **Step 1: Add failing form-logic and render tests for the final remove control**

Export two small pure helpers from `RuleModal.tsx` so the form’s empty-list behavior can be tested without a browser DOM:

```ts
export function getRuleCriteriaForEdit(initialRule: any): RuleCriterion[] {
  const initialCriteria = initialRule?.conditions?.criteria;
  return Array.isArray(initialCriteria)
    ? initialCriteria
    : [{ field: 'from', operator: 'contains', value: '' }];
}

export function cleanRuleCriteria(criteria: RuleCriterion[]): RuleCriterion[] {
  return criteria.filter((criterion) => {
    if (criterion.field === 'hasAttachment') return true;
    if (criterion.field === 'hasLabelId') return Boolean(criterion.value);
    return String(criterion.value).trim() !== '';
  });
}
```

Test that an explicit empty edit list stays empty, a missing list gets the initial editable row, and a blank text row cleans to an empty list. Extend the static-render test to assert that the initial condition’s remove button is not disabled:

```ts
expect(html).toContain('title="Remove condition"');
expect(html).not.toContain('title="Remove condition" disabled');
```

- [ ] **Step 2: Run the modal tests and verify the new assertion fails**

Run:

```bash
npm test -- --runInBand src/__tests__/components/rules/RuleModal.test.tsx
```

Expected: the test fails because the final condition currently renders with `disabled`.

- [ ] **Step 3: Preserve an existing empty criteria array while editing**

Use the tested `getRuleCriteriaForEdit` helper when loading `initialRule`, distinguishing an absent criteria property from an explicitly empty array:

```ts
setCriteria(getRuleCriteriaForEdit(initialRule));
```

This prevents an existing unconditional rule from reopening with a blank condition.

- [ ] **Step 4: Allow removal of the final condition and submit an empty list**

Remove the `criteria.length === 1` early return from `handleRemoveCriterion`, remove the `disabled={criteria.length === 1}` prop from the remove button, and keep the existing `cleanedCriteria` payload. The existing “at least one condition with a value” guard must be removed because `cleanedCriteria.length === 0` is now valid; the name, action, and scope validations remain.

- [ ] **Step 5: Make the empty state clear in the form**

Render an explanatory message when there are no criteria:

```tsx
{criteria.length === 0 && (
  <p className="text-xs text-gray-500">
    No email conditions: this rule applies to all incoming emails in the selected scope.
  </p>
)}
```

Hide the “Match logic” selector when there are no criteria because `ALL` versus `ANY` has no effect; retain the selector unchanged when one or more criteria exist. Keep `matchType: 'ALL'` in the submitted payload for the stable stored shape.

- [ ] **Step 6: Run the modal tests and verify they pass**

Run:

```bash
npm test -- --runInBand src/__tests__/components/rules/RuleModal.test.tsx
```

Expected: all modal tests pass and confirm that the final condition is removable.

- [ ] **Step 7: Commit the focused form change**

```bash
git add -- src/components/rules/RuleModal.tsx src/__tests__/components/rules/RuleModal.test.tsx
git commit -m "feat: allow rules without email conditions"
```

### Task 3: Update rule summaries and run the complete verification set

**Files:**
- Modify: `src/app/(dashboard)/settings/rules/page.tsx:263-281`
- Test: `src/__tests__/components/settings/settings-navigation.test.tsx:57-115,219-247`

**Interfaces:**
- Consumes: persisted `rule.conditions.criteria` from the rules API.
- Produces: an unambiguous summary for both conditional and unconditional rules.

- [ ] **Step 1: Add a failing summary assertion**

Extend the existing `configureQueries` helper with an optional `rules` argument, return those rules for the `rules` query, and add an admin-page test with one rule whose `conditions` is `{ matchType: 'ALL', criteria: [] }`. Assert that the rendered summary contains:

```text
All incoming emails
```

Keep existing coverage for normal condition summaries unchanged.

- [ ] **Step 2: Implement the unconditional summary branch**

Use an explicit branch before mapping criteria:

```tsx
{conditions?.criteria?.length === 0 ? (
  <span className="text-gray-500 italic">All incoming emails</span>
) : (
  <>
    <span className="text-gray-500 italic">
      ({conditions?.matchType === 'ANY' ? 'Any condition' : 'All conditions'})
    </span>
    {conditions?.criteria?.map((c, idx) => (
      <span key={idx} className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-[11px] border border-gray-200">
        <span className="font-medium">{c.field}</span> {c.operator}{' '}
        <span className="font-semibold">
          {c.field === 'hasLabelId'
            ? getLabelById(String(c.value))?.name || String(c.value)
            : String(c.value)}
        </span>
      </span>
    ))}
  </>
)}
```

Preserve the existing `ANY`/`ALL` labels and criterion badge formatting for non-empty rules.

- [ ] **Step 3: Run all relevant verification**

Run:

```bash
npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts src/__tests__/components/rules/RuleModal.test.tsx src/__tests__/app/settings/settings-navigation.test.tsx
npm run build
```

Expected: all targeted tests pass and the Next.js production build completes successfully.

- [ ] **Step 4: Review the final diff and status**

Run:

```bash
git diff --check
git status --short
```

Confirm only the intended source/test files and the already tracked design/plan artifacts are represented in the final change; do not stage or alter unrelated user work.

- [ ] **Step 5: Commit the summary and verification change**

```bash
git add -- src/app/(dashboard)/settings/rules/page.tsx src/__tests__/components/settings/settings-navigation.test.tsx
git commit -m "feat: show unconditional rule summaries"
```
