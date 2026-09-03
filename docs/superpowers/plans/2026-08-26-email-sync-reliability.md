# Email Sync Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make email ingestion resilient to PostgreSQL connection saturation and transient provider failures while preserving existing `workerPartition` ownership.

**Architecture:** Use one bounded PostgreSQL pool per Node.js process, bounded sync and email-persistence concurrency, and retryable failures that prevent sync watermarks from advancing. Keep the existing partition filter, route sync jobs to the account's partition queue, and ensure incomplete work fails visibly.

**Tech Stack:** TypeScript, Prisma 7 with `@prisma/adapter-pg`, `pg`, BullMQ, ImapFlow, Gmail API, Jest.

**Review remediation status (2026-08-26):** Task 4's per-account IMAP fetch
gate and Task 6's partitioned initial-sync queue routing have been implemented
and verified. Existing `workerPartition` data, including `worker-1` accounts,
was not rewritten.

## Global Constraints

- Do not create a PostgreSQL pool per email account.
- Do not rewrite existing `emailAccount.workerPartition` values.
- `worker-1` must continue handling accounts whose stored partition is `worker-1` when that service remains deployed.
- No production code may be written before its focused failing test is run.
- Do not raise PostgreSQL `max_connections` as a substitute for application-side concurrency limits.

---

### Task 1: Add tested runtime configuration and bounded PostgreSQL pool

**Files:**
- Create: `src/lib/runtime-config.ts`
- Modify: `src/lib/db/prisma.ts:10-13`
- Create: `src/__tests__/lib/runtime-config.test.ts`

**Interfaces:**
- Produces `runtimeConfig.dbPoolMax`, `runtimeConfig.dbConnectionTimeoutMs`, `runtimeConfig.syncWorkerConcurrency`, `runtimeConfig.emailPersistConcurrency`, `runtimeConfig.gmailPollIntervalMs`, and `runtimeConfig.imapReconcileIntervalMs`.
- Values parse positive integer environment variables and fall back to `DB_POOL_MAX=5`, `DB_CONNECTION_TIMEOUT_MS=10000`, `SYNC_WORKER_CONCURRENCY=1`, `EMAIL_PERSIST_CONCURRENCY=3`, `GMAIL_POLL_INTERVAL_MS=60000`, and `IMAP_RECONCILE_INTERVAL_MS=300000`.

- [ ] **Step 1: Write failing configuration tests**

Test default values and valid environment overrides in `src/__tests__/lib/runtime-config.test.ts`. Restore modified environment variables in `afterEach`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --runInBand src/__tests__/lib/runtime-config.test.ts`

Expected: FAIL because `src/lib/runtime-config.ts` does not exist.

- [ ] **Step 3: Implement the minimal parser and config object**

Implement positive-integer parsing with defaults and export the six configuration values.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- --runInBand src/__tests__/lib/runtime-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Add pool limits**

Construct the existing `Pool` with `max: runtimeConfig.dbPoolMax`, `connectionTimeoutMillis: runtimeConfig.dbConnectionTimeoutMs`, and a finite `idleTimeoutMillis` while keeping the single module-level pool.

- [ ] **Step 6: Run the focused test suite**

Run: `npm test -- --runInBand src/__tests__/lib/runtime-config.test.ts`

Expected: PASS.

### Task 2: Add retry utility and protect transaction acquisition

**Files:**
- Create: `src/lib/retry.ts`
- Create: `src/__tests__/lib/retry.test.ts`
- Modify: `src/lib/imap/connection-manager.ts:700-795`
- Modify: `src/lib/gmail/sync-manager.ts:153-250`

**Interfaces:**
- Produces `retryAsync<T>(operation: () => Promise<T>, options?: { attempts?: number; baseDelayMs?: number; shouldRetry?: (error: unknown) => boolean }): Promise<T>`.
- Retries Prisma transaction acquisition/P2028 and connection-timeout errors with bounded exponential delay; non-transient errors are immediately rethrown.

- [ ] **Step 1: Write failing retry tests**

Cover success after two transient failures, rethrow of a non-transient error without retry, and final rejection after the attempt limit.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --runInBand src/__tests__/lib/retry.test.ts`

Expected: FAIL because `retryAsync` does not exist.

- [ ] **Step 3: Implement the minimal retry helper**

Use attempts `3` and exponential delays from the supplied base delay. Keep the helper dependency-free and injectable by accepting the operation callback.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- --runInBand src/__tests__/lib/retry.test.ts`

Expected: PASS.

- [ ] **Step 5: Wrap IMAP and Gmail persistence transactions**

Call `retryAsync` around the existing Prisma transaction only, not around parsing, provider fetches, notifications, or search queue writes. Include the existing 30-second transaction timeout and set Prisma interactive transaction `maxWait` to `10000` milliseconds so a request can wait for the bounded pool without failing immediately.

- [ ] **Step 6: Run existing email tests**

Run: `npm test -- --runInBand src/__tests__/lib/imap src/__tests__/lib/gmail`

Expected: Existing tests pass.

### Task 3: Make persistence failures visible and protect sync watermarks

**Files:**
- Modify: `src/lib/imap/connection-manager.ts:654-795,1021-1078`
- Modify: `src/lib/gmail/sync-manager.ts:56-151,153-250`
- Modify: `src/lib/queue/workers/sync.ts:18-91`
- Create: `src/__tests__/lib/queue/sync-watermark.test.ts`

**Interfaces:**
- `fetchNewEmails` and Gmail historical/polling flows return `{ processed: number; failed: number }` or throw a typed incomplete-sync error when any message fails.
- The sync worker updates `lastSyncedAt` and `initialSyncCompletedAt` only after a complete result.

- [ ] **Step 1: Write failing watermark tests**

Test that a job with one failed message rejects and does not call `emailAccount.update`, and that a fully successful job updates both timestamps as currently intended.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --runInBand src/__tests__/lib/queue/sync-watermark.test.ts`

Expected: FAIL because current persistence errors are swallowed and the worker advances the watermark.

- [ ] **Step 3: Change persistence methods to return success/failure**

Return `true` only after the email transaction and downstream enqueue complete. Use `Promise.allSettled` at batch boundaries to count failures without losing the remaining messages.

- [ ] **Step 4: Fail incomplete historical and incremental syncs**

Throw an error containing the account ID and failed count after provider fetch processing completes with failures. Do not update the account timestamps in the queue worker until the manager returns successfully.

- [ ] **Step 5: Run the focused test and confirm it passes**

Run: `npm test -- --runInBand src/__tests__/lib/queue/sync-watermark.test.ts`

Expected: PASS.

- [ ] **Step 6: Run queue and account tests**

Run: `npm test -- --runInBand src/__tests__/lib/queue src/__tests__/lib/accounts`

Expected: PASS.

### Task 4: Bound provider-side concurrency and prevent overlapping Gmail polls

**Files:**
- Modify: `src/lib/imap/connection-manager.ts:654-735,1021-1138`
- Modify: `src/lib/gmail/sync-manager.ts:29-151`
- Modify: `src/lib/queue/workers/sync.ts:38-91,96-107`
- Create: `src/__tests__/lib/gmail/sync-concurrency.test.ts`

**Interfaces:**
- `EMAIL_PERSIST_CONCURRENCY` limits concurrent `persistEmail`/`fetchAndPersist` operations across all fetches for one account.
- `SYNC_WORKER_CONCURRENCY` controls BullMQ worker concurrency.
- `GmailSyncManager` tracks in-flight account IDs so a slow poll cannot overlap the next interval for the same account.

- [ ] **Step 1: Write failing Gmail overlap test**

Start a poll that does not resolve, invoke the polling callback again, and assert the second invocation returns without starting another provider fetch.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --runInBand src/__tests__/lib/gmail/sync-concurrency.test.ts`

Expected: FAIL because polling currently has no in-flight guard.

- [ ] **Step 3: Implement bounded batching, poll guard, and one per-account IMAP fetch gate so concurrent `EXISTS` events share the same persistence limiter**

Implement a FIFO promise worker loop with exactly `runtimeConfig.emailPersistConcurrency` workers; replace hard-coded batch size 10. Read polling interval and BullMQ concurrency from `runtimeConfig`. Always clear the Gmail in-flight marker in `finally`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- --runInBand src/__tests__/lib/gmail/sync-concurrency.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all sync-related tests**

Run: `npm test -- --runInBand src/__tests__/lib/gmail src/__tests__/lib/imap src/__tests__/lib/queue`

Expected: PASS.

### Task 5: Make IMAP error recovery and reconciliation explicit

**Files:**
- Modify: `src/lib/imap/connection-manager.ts:425-610,654-695,1118-1159`
- Create: `src/__tests__/lib/imap/reconnect.test.ts`

**Interfaces:**
- An IMAP `error` event marks the entry disconnected and invokes the same deduplicated reconnect scheduler used by `close`.
- Each monitored account has one reconciliation timer, cleared by `destroyAccount` and `shutdown`.

- [ ] **Step 1: Write failing reconnect tests**

Test that an emitted IMAP error schedules one reconnect and repeated error/close events do not create duplicate timers. Test that destroying an account clears its timer.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --runInBand src/__tests__/lib/imap/reconnect.test.ts`

Expected: FAIL because the error handler currently only marks the entry disconnected.

- [ ] **Step 3: Implement error recovery**

Route `error` through a shared connection-loss handler, preserve exponential backoff, and ensure the connection map still points to the current entry before reconnecting.

- [ ] **Step 4: Add periodic INBOX reconciliation**

Schedule a bounded reconciliation using the account's current `lastSyncedAt`; reuse existing fetch/persist logic and leave the database watermark unchanged when reconciliation fails. Do not create another IMAP connection for an account.

- [ ] **Step 5: Run the focused test and confirm it passes**

Run: `npm test -- --runInBand src/__tests__/lib/imap/reconnect.test.ts`

Expected: PASS.

- [ ] **Step 6: Run IMAP tests**

Run: `npm test -- --runInBand src/__tests__/lib/imap`

Expected: PASS.

### Task 6: Preserve worker partition coverage and route jobs by partition

**Files:**
- Modify: `src/worker.ts:10-38`
- Modify: `src/lib/queue/client.ts:20-50`
- Modify: `src/lib/queue/workers/sync.ts:18-125`
- Modify: `src/lib/accounts/service.ts:87-124,180-190`
- Modify: `src/app/api/accounts/route.ts:52-71`
- Modify: `src/app/api/accounts/oauth/google/callback/route.ts:225-235`
- Modify: `src/app/api/accounts/oauth/microsoft/callback/route.ts:217-226`
- Create: `src/__tests__/lib/worker-partition.test.ts`

**Interfaces:**
- `workerPartition` remains the account assignment source; no migration or data rewrite is introduced.
- `initial-sync` jobs use BullMQ-safe account partition queues and
  `jobId: initial-sync-<accountId>` with `removeOnComplete` and
  `removeOnFail` behavior that permits future manual re-sync.
- Bootstrap still queries the configured `WORKER_PARTITION`, so accounts stored as `worker-1` remain covered by the `worker-1` service when it is running.

- [ ] **Step 1: Write failing partition tests**

Test that a worker configured as `worker-1` queries only `worker-1` accounts, and that enqueueing the same account twice supplies the same deterministic job ID.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --runInBand src/__tests__/lib/worker-partition.test.ts`

Expected: FAIL because enqueue calls currently omit a deterministic job ID and worker behavior is not directly covered.

- [ ] **Step 3: Implement partition queue routing, legacy shared-queue forwarding/validation, and deduplicated enqueueing**

Centralize initial-sync enqueue options in the queue client or a small helper and use it from worker bootstrap, account creation, and OAuth callbacks. Keep existing partition values and filtering unchanged.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm test -- --runInBand src/__tests__/lib/worker-partition.test.ts`

Expected: PASS.

- [ ] **Step 5: Update deployment configuration documentation**

Add the pool/concurrency environment variables to `.env.example` and document that adding workers requires retaining the existing `worker-1` service for its stored accounts. Do not silently change the two-worker partition assignment logic in account creation.

- [ ] **Step 6: Run account/API tests**

Run: `npm test -- --runInBand src/__tests__/lib/accounts src/__tests__/app/api/accounts-route.test.ts src/__tests__/app/api/accounts-create-route.test.ts src/__tests__/app/api/google-oauth-init-route.test.ts src/__tests__/app/api/microsoft-oauth-route.test.ts`

Expected: PASS.

### Task 7: Full verification and operational handoff

**Files:**
- Modify: `README.md` with the new environment variables and the requirement to keep the existing `worker-1` service deployed for accounts stored with `workerPartition='worker-1'`.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --runInBand`

Expected: PASS with no unhandled rejection output.

- [ ] **Step 2: Run TypeScript/build verification**

Run: `npx tsc --noEmit` and `npm run build`

Expected: both commands complete successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors; unrelated pre-existing user changes remain untouched.

- [ ] **Step 4: Report deployment values**

Recommend starting with `DB_POOL_MAX=3`, `SYNC_WORKER_CONCURRENCY=1`, and `EMAIL_PERSIST_CONCURRENCY=3` across ten workers, then raising only after observing `pg_stat_activity` and queue latency. Keep PostgreSQL `max_connections=100` initially unless measured demand requires a controlled increase.

---

## Post-review remediation completed

- [x] Added a per-account IMAP mailbox-operation queue around both
  `fetchNewEmails` and historical sync; concurrent IDLE `EXISTS` and
  historical mailbox selection/fetch work now share one
  `EMAIL_PERSIST_CONCURRENCY` budget.
- [x] Added BullMQ-safe `imap-sync-<workerPartition>` queues and centralized
  `enqueueInitialSync(account)` routing with `jobId: initial-sync-<accountId>`,
  `removeOnComplete: true`, and `removeOnFail: true`.
- [x] Changed worker bootstrap, account creation, account updates, and Google/
  Microsoft OAuth callbacks to use the central partition-aware enqueue helper.
- [x] Added a legacy `imap-sync` forwarding worker. It forwards every legacy
  job to the stored partition without starting an IMAP or Gmail monitor, even
  when it runs in that same partition; retain it until legacy jobs are retired.
