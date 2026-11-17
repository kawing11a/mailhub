# Attachment download recovery

**Date:** 2026-11-17

## Problem

Received attachment metadata is committed to PostgreSQL before the download is queued in Redis. A Redis outage can leave an attachment row without a job. A job can also exhaust its retries, or finish with `AttachmentNotFoundError`, and remain in BullMQ's retained failed or completed set. Adding the same deterministic job ID does not revive that job. In each case, `storagePath` stays null and nothing tries the download again.

The database is the durable inventory. BullMQ is the shared work queue. The fix should reconcile those existing states without adding a separate retry table or changing the attachment download job format.

## Usage

The worker starts recovery after bootstrapping its services. Recovery scans immediately, then repeats on a configurable interval. Shutdown stops the timer and waits for the current pass before Prisma disconnects.

```ts
const stopRecovery = startAttachmentDownloadRecovery();

// During worker shutdown:
await stopRecovery();
await attachmentDownloadWorker.close();
await prisma.$disconnect();
```

IMAP and Gmail sync keep calling `enqueueAttachmentDownload(attachmentId)` after persisting received attachment metadata. Recovery uses the same `download-attachment` job and deterministic `attachment-${id}` job ID.

## Shape

Add `src/lib/queue/attachment-download-recovery.ts`. It owns the interval, paged query, and per-row reconciliation. Keep the scan state small: the current UUID cursor, one in-flight pass, and the timer. PostgreSQL remains the source of truth, so a process restart rebuilds the candidate set from attachment rows rather than relying on an in-memory list.

The recovery query selects only attachment IDs with a null `storagePath`, received email folders, and provider references that `getReceivedAttachment` can use. Preserve its IMAP-first lookup order. An IMAP row needs a part reference and UID. A Gmail row needs the provider message ID plus an attachment ID or ordinal. Exclude `SENT` and `DRAFTS`, whose attachments come from local uploads. Skip rows without a usable provider reference because the current retrieval code cannot fetch them.

Read IDs in pages of 100, ordered by ID. Advance with `id > lastSeenId` so deleting or updating the last row cannot invalidate the cursor. Start each pass without a cursor. New rows that fall before the cursor are handled by the next pass.

For each candidate, inspect its deterministic BullMQ job:

- If no job exists, enqueue the normal download job.
- If the job is waiting, active, delayed, paused, prioritized, or waiting for children, leave it alone.
- If a retained failed or completed job is older than one scan interval, retry it and reset its attempt counters. Completed jobs need recovery because `AttachmentNotFoundError` currently completes without writing a path.
- If another worker moves a terminal job first, re-read its state. Treat only disappearance or a state change as an expected race. Propagate Redis failures and unexpected retry errors.

Each worker may run the same scan. This avoids assigning ownership to one partition and lets any worker restart recovery. Deterministic job IDs and atomic BullMQ retry transitions make duplicate scans safe. Prevent overlapping passes within one process. Schedule the next pass only after the current pass settles.

The download worker continues to retrieve provider bytes, write the file, and then update `storagePath` and `sizeBytes`. A null-path-only scan does not repair a row whose nonnull path points to a missing file.

## Configuration and failure handling

Use a five-minute default interval and allow `ATTACHMENT_RECOVERY_INTERVAL_MS` to set another positive integer interval. Keep the page size at 100. Log the scan counts and elapsed time when a scan finds work or fails. Do not log message content, provider responses, or credentials.

A provider-side not-found result leaves the row eligible for a later scan. This can retry an attachment indefinitely when the provider permanently removed it. The interval limits the retry rate. A persistent terminal status and maximum retry count would require a separate data model and are outside this change.

If a scan fails because PostgreSQL or Redis is unavailable, log the error and let the next scheduled pass retry. Shutdown cancels future passes and waits for any active pass before disconnecting Prisma and closing Redis-backed workers.

## Synthesis decision

Use a paged timer-driven reconciler in each worker. The independent design review preferred this over putting scan jobs on the download queue. Existing consumers understand only `download-attachment`; an older worker could misread a new scheduler payload during a rolling upgrade. The timer keeps the queue payload unchanged and leaves download capacity for attachment jobs.

The scheduler candidate's provider precedence check is included. The per-worker candidate's bounded UUID pagination and terminal-job recovery are retained. The scheduler job type, new queue lifecycle, and retry ledger were rejected as unnecessary for the current deployment.

## Tradeoffs accepted

- Both workers scan the same table. This spends extra database reads to avoid a single-instance scheduler dependency.
- Missing provider attachments with valid references remain candidates. This retries transient failures without a migration, but can retry permanent provider-side deletions.
- The scan handles null paths only. Detecting missing files behind nonnull paths needs filesystem checks and a separate failure policy.
- Shutdown waits for the current database and queue operations. A Redis timeout does not cancel a PostgreSQL query that is already running.

## Alternatives considered

- A BullMQ repeatable scan job would centralize the scan and persist scheduling in Redis. It would add a second job shape to a queue consumed by older workers, creating a rolling-upgrade hazard.
- A process-local in-memory attachment list would have to be rebuilt after restart and could diverge across the two workers. The database query already provides a durable, shared list.
- A retry-status column could control retry count and timing. It needs a schema migration and write-path changes, so it is not needed for periodic recovery.

## Open questions and risks

- Rows whose stored path is nonnull but whose file is absent remain out of scope.
- Provider references that return not-found will be revisited each interval until the row changes or is deleted.
- The first scan starts after worker bootstrap, so a long bootstrap delays recovery. The periodic scan still runs once bootstrap completes.

## Next implementation step

Implement the paged scan and terminal-job reconciliation, then start and stop it with the worker lifecycle.
