# Attachment download recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retry every provider-backed received attachment across all accounts when its `storagePath` is null, including attachments whose BullMQ job was retained as failed or completed.

**Architecture:** Each worker runs a paged PostgreSQL scan at startup and on a configurable interval. The scanner reconciles missing attachment rows with the existing `attachment-download` queue, reviving eligible terminal jobs and leaving already scheduled jobs alone. The existing download worker continues to retrieve bytes and update the attachment row.

**Tech Stack:** TypeScript, Prisma 7, PostgreSQL, BullMQ 5, ioredis.

## Global Constraints

- Keep the existing `download-attachment` job name and deterministic `attachment-${attachmentId}` job ID.
- Preserve the existing download order: write the file, then update `storagePath` and `sizeBytes`.
- Exclude `SENT` and `DRAFTS` local uploads and skip rows without provider references supported by `getReceivedAttachment`.
- Reconcile both failed and completed jobs, resetting attempt counters before retrying terminal jobs.
- Serialize per-attachment cooldown checks across workers with a Redis lease, compare-token release, and expiry equal to the longer of the scan interval or 30000 milliseconds.
- Use a per-pass recovery queue connection with offline queueing and unfulfilled-command replay disabled. Set its 10000 millisecond command timeout shorter than the lease.
- Make terminal retry atomic with a Redis script that verifies the lease token and observed `finishedOn` before moving the job, while preserving BullMQ queue markers and events.
- Do not add a schema migration or a new queue job type.
- Do not add or run tests unless the user asks for tests or verification.

---

### Task 1: Implement attachment reconciliation

**Files:**
- Create: `src/lib/queue/attachment-download-recovery.ts`
- Modify: `src/lib/queue/client.ts`

**Interfaces:**
- Consumes: Prisma `Attachment` and `Email` relations; the shared `attachmentDownloadQueue`.
- Produces: `startAttachmentDownloadRecovery(): () => Promise<void>` which begins an immediate pass, schedules the next pass after completion, and stops future passes on shutdown.

- [ ] Add a bounded page query for eligible null-path attachment IDs, ordered by UUID and continued with `id > lastSeenId`.
- [ ] Include all accounts and folders except `SENT` and `DRAFTS`. Match retrieval precedence: if `imapPart` exists, require a usable IMAP UID; otherwise require Gmail message identity and an attachment ID or ordinal.
- [ ] For each ID, enqueue the existing job when no job exists, do nothing for waiting or active states, and retry completed or failed jobs only after the terminal cooldown. Reset `attemptsMade` and `attemptsStarted` when retrying.
- [ ] Re-read job state after a retry race. Ignore the race only when the job disappeared or changed out of the terminal state. Propagate Redis and unexpected errors so the pass logs its failure.
- [ ] Hold a per-attachment Redis lease across job inspection and terminal retry. Set its expiry to `Math.max(intervalMs, 30000)`. Release it with a compare-token operation; skip the row when another process holds it.
- [ ] Use the same per-pass producer connection for lease and BullMQ operations. Disable offline queueing and replay, set `commandTimeout: 10000`, and close the producer after each pass.
- [ ] Retry terminal jobs with one atomic Redis script that checks lease ownership, observed `finishedOn`, and terminal queue membership before reproducing BullMQ's state transition, markers, and waiting event.
- [ ] Keep only one pass active per process. Schedule the next pass after the current pass settles, and stop pagination when shutdown begins.
- [ ] Read the design spec and ensure this task covers each recovery state, eligibility rule, pagination requirement, and accepted tradeoff.

### Task 2: Wire recovery into worker lifecycle

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/lib/queue/attachment-download-recovery.ts`

**Interfaces:**
- Consumes: `startAttachmentDownloadRecovery(): () => Promise<void>` from Task 1.
- Produces: Startup recovery on every worker partition and an awaited stop before Prisma disconnect.

- [ ] Parse `ATTACHMENT_RECOVERY_INTERVAL_MS` as a positive integer, defaulting to `300000` milliseconds.
- [ ] Start the immediate recovery pass after worker bootstrap completes and before printing the final ready message.
- [ ] Clear the recovery timer and await any active pass in both SIGTERM and SIGINT shutdown paths before disconnecting Prisma.
- [ ] Keep the scanner independent of the Gmail account polling map so one pass covers every eligible Gmail account, plus IMAP accounts.
- [ ] Run `npx tsc --noEmit` and `npx eslint src/lib/queue/attachment-download-recovery.ts src/lib/queue/client.ts src/worker.ts`.
- [ ] Review the final diff to confirm that no user changes in unrelated files were staged or modified.

## Plan self-review

- The spec's null-path scope, provider reference rules, terminal job retry behavior, multi-worker safety, timer configuration, and shutdown behavior map to Tasks 1 and 2.
- Missing files behind nonnull `storagePath` values remain out of scope as stated in the spec.
- The plan adds no schema migration, queue type, or test suite.
- The function signature is consistent across both tasks.
