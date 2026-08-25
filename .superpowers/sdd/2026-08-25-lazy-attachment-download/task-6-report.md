# Task 6 Report: Verify draft/sent compatibility and complete the migration

## Pre-change compatibility check

- Ran the existing focused attachment/storage suite before making any code changes:
  - `npm test -- --runInBand src/__tests__/app/api/mail-access-routes.test.ts src/__tests__/lib/email/attachment-retrieval.test.ts src/__tests__/app/api/send-email-route.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts`
- Result: passed with `4` suites and `31` tests.
- Outcome: the current production routes already matched the expected compatibility split, so Task 6 only needed missing proof coverage rather than runtime changes.

## RED

- Added focused compatibility assertions to existing route suites:
  - `src/__tests__/app/api/send-email-route.test.ts`
    - verifies sent-mail uploads still write buffers into `.storage/attachments`
    - verifies attachment rows keep a local `storagePath`
    - verifies provider-reference fields are not written for sent uploads
  - `src/__tests__/app/api/related-mail-access-routes.test.ts`
    - verifies draft synchronization reads local draft attachment files from `storagePath`
    - verifies the composed draft payload includes the loaded attachment buffer
  - `src/__tests__/app/api/mail-access-routes.test.ts`
    - verifies a legacy received attachment with an existing `storagePath` is served through `readStoredAttachment` instead of provider retrieval
- First focused run after adding the new assertions:
  - `npm test -- --runInBand src/__tests__/app/api/send-email-route.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts src/__tests__/app/api/mail-access-routes.test.ts`
- Initial result: failed in the new draft-sync test because the test setup left one extra account mock queued for the next test and did not pin the Gmail access-token mock.

## GREEN

- Fixed only the new compatibility test setup:
  - removed the extra `emailAccount.findFirst` queued mock value
  - mocked `getValidAccessToken` explicitly as `'access-token'`
  - asserted `syncDraftRaw` with the resolved token and generated MIME buffer
- Re-ran the focused compatibility suite:
  - `npm test -- --runInBand src/__tests__/app/api/send-email-route.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts src/__tests__/app/api/mail-access-routes.test.ts`
- Result: passed with `3` suites and `27` tests.
- Production-code outcome: no changes were required in:
  - `src/app/api/accounts/[id]/emails/send/route.ts`
  - `src/app/api/accounts/[id]/drafts/route.ts`
  - `src/app/api/accounts/[id]/drafts/sync/route.ts`
  - `src/app/api/accounts/[id]/emails/[emailId]/attachments/[attachmentId]/route.ts`

## REFACTOR

- Kept all new coverage inside existing API route test files instead of adding a broader new integration harness.
- Preserved all unrelated dirty-worktree edits; only Task 6 test/report files were touched.

## Verification

- Focused pre-change compatibility suite
  - `npm test -- --runInBand src/__tests__/app/api/mail-access-routes.test.ts src/__tests__/lib/email/attachment-retrieval.test.ts src/__tests__/app/api/send-email-route.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts`
  - Passed: `4` suites, `31` tests

- Focused Task 6 compatibility suite
  - `npm test -- --runInBand src/__tests__/app/api/send-email-route.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts src/__tests__/app/api/mail-access-routes.test.ts`
  - Passed: `3` suites, `27` tests

- Schema validation
  - `npx prisma validate`
  - Passed: `The schema at prisma\schema.prisma is valid`

- Type checking
  - `npx tsc --noEmit`
  - Passed with exit code `0`

- Full test suite
  - `npm test -- --runInBand`
  - Did not complete cleanly in this environment
  - Observed repeated Redis connection failures during and after the run, including:
    - `connect ECONNREFUSED 127.0.0.1:6379`
    - `connect ECONNREFUSED ::1:6379`
    - repeated `Cannot log after tests are done` messages from Redis/BullMQ retry loops
  - This prevented a clean end-to-end Jest result unrelated to the Task 6 attachment compatibility paths

- Production build
  - `npm run build`
  - Passed with exit code `0`
  - Build completed and emitted the final route manifest
  - The build also logged repeated Redis connection errors against `192.168.0.222:6379` (`EACCES`) from background queue/summary worker initialization, but the build still succeeded

- Diff formatting
  - `git diff --check`
  - Returned only pre-existing CRLF warnings in unrelated dirty files; no Task 6 formatting errors were introduced

## Final scope

- Runtime code changed: none
- Test/report files changed:
  - `src/__tests__/app/api/send-email-route.test.ts`
  - `src/__tests__/app/api/related-mail-access-routes.test.ts`
  - `src/__tests__/app/api/mail-access-routes.test.ts`
  - `.superpowers/sdd/2026-08-25-lazy-attachment-download/task-6-report.md`
