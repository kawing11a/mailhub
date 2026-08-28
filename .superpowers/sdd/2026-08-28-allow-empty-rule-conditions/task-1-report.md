# Task 1 Report: Allow unconditional email rules

## RED

- Added two evaluator tests in `src/__tests__/lib/rules/engine.test.ts`:
  - `matches every email when criteria is empty`
  - `still enforces account scope when criteria is empty`
- Updated `src/__tests__/app/api/rules-routes.test.ts` so the existing invalid-payload test now omits the `criteria` property entirely, preserving coverage that the field is required.
- Added API coverage in `src/__tests__/app/api/rules-routes.test.ts` for:
  - creating a rule with `criteria: []`
  - dry-running a rule with `criteria: []` and expecting `{ matched: true }`
- Ran `npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts`.
- Observed the expected failure:
  - `matches every email when criteria is empty` failed because `evaluateRule` returned `false` for an empty criteria array.

## GREEN

- Updated `src/lib/rules/engine.ts` so `evaluateRule` still performs:
  - active check
  - `accountId` scope check
  - `accountLabelId` scope check
- Replaced the empty-criteria rejection with unconditional matching after scope checks:
  - `if (!criteria || criteria.length === 0) return true;`
- Updated both validation schemas to accept zero criteria while keeping the field itself required:
  - `src/app/api/rules/route.ts`
  - `src/app/api/rules/[id]/route.ts`
- Left `matchType` untouched in the stored condition shape for compatibility.
- Left non-empty `ALL` and `ANY` semantics unchanged.
- Did not change RuleModal action requirements or add any new rule mode or migration.

## REFACTOR

- Kept the implementation minimal and localized to the evaluator short-circuit and the two route schemas.
- Added the new contract tests beside the existing evaluator and route behavior coverage so the unconditional-rule behavior is exercised at the current boundaries.

## Verification

- `npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts`
  - Failed first for the expected reason: empty criteria still returned `false`
- `npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts`
  - Passed: 2 suites, 43 tests
- Notes from the passing run:
  - Jest reported both requested suites as passing.
  - After the passing summary, unrelated Redis/BullMQ retry logging from existing queue client code continued to emit `ECONNREFUSED` / `Cannot log after tests are done` noise. This did not change the passing suite/test counts for the requested command.

## Commit

- Staged only the task-scoped files requested in the brief:
  - `src/lib/rules/engine.ts`
  - `src/app/api/rules/route.ts`
  - `src/app/api/rules/[id]/route.ts`
  - `src/__tests__/lib/rules/engine.test.ts`
  - `src/__tests__/app/api/rules-routes.test.ts`
- Report file added at:
  - `.superpowers/sdd/2026-08-28-allow-empty-rule-conditions/task-1-report.md`

## Concerns

- The target files already contained pre-existing dirty changes for account-label rule scope and address normalization before this task began. Those edits were preserved.
- The requested test command passes, but the repository currently has unrelated asynchronous Redis/BullMQ retry noise after Jest completes. That should be cleaned up separately if pristine test output is required.

## Fix Round 1

### Finding

- Important review finding: `src/lib/rules/engine.ts` only rejected account-scoped rules when `email.accountId` was truthy, which allowed a scoped unconditional rule to match when `email.accountId` was omitted.

### Files Changed

- `src/lib/rules/engine.ts`
- `src/__tests__/lib/rules/engine.test.ts`
- `src/__tests__/app/api/rules-routes.test.ts`

### Command

- `npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts src/__tests__/app/api/rules-routes.test.ts`

### Output

- Red phase before the fix:
  - Failed: 2 suites, 45 tests run, 2 failures
  - Regression failures:
    - `Email Rules Engine › evaluateRule › does not match a scoped unconditional rule when the email accountId is missing`
    - `Email Rules API Routes › POST /api/rules/test › does not match a scoped dry run when criteria is empty and sample accountId is missing`
- Green phase after the fix:
  - Passed: 2 suites, 45 tests
  - Jest summary:
    - `Test Suites: 2 passed, 2 total`
    - `Tests: 45 passed, 45 total`
- Residual output:
  - The same unrelated post-summary Redis/BullMQ `ECONNREFUSED` and `Cannot log after tests are done` noise continued after the passing Jest summary.
