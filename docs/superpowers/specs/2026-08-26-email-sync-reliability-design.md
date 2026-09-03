# Email Sync Reliability Design

## Goal

Prevent missed email ingestion caused by PostgreSQL connection saturation, transient database failures, and IMAP connection errors while preserving the existing `workerPartition` ownership model.

## Scope and constraint

- Existing `emailAccount.workerPartition` values remain authoritative.
- Adding worker containers does not rewrite or rebalance existing account assignments.
- Accounts assigned to `worker-1` continue to be handled by the worker whose `WORKER_PARTITION` is `worker-1`, provided that worker remains deployed.
- No per-account PostgreSQL connection pools will be introduced.

## Architecture

Each Node.js process uses one explicitly bounded PostgreSQL pool. Sync job concurrency and per-batch email persistence concurrency are independently bounded so ten workers cannot create an unbounded database write burst. The existing IMAP IDLE and Gmail polling mechanisms remain the low-latency path; reconnect and periodic reconciliation provide recovery when provider events or network connections fail.

Initial and incremental syncs report partial persistence failures to the caller. A sync watermark is advanced only when all fetched messages were persisted successfully. Retryable database failures, including transaction acquisition failures, are retried with bounded exponential backoff before the job is failed for BullMQ retry.

## Worker and queue behavior

The existing partition filter remains in worker bootstrap. Initial-sync jobs use deterministic job IDs to avoid duplicate enqueueing when multiple worker processes bootstrap. Queue processing continues to use the current shared queue, but the worker must not mark an incomplete sync as successful. The deployment must keep the existing `worker-1` service alive for accounts already stored with that partition.

## Error handling

- IMAP `error` events schedule reconnects just like `close` events, with duplicate reconnect timers suppressed.
- Gmail polling prevents overlapping polls for the same account.
- A failed email persistence is counted and surfaced; it is not silently swallowed.
- `lastSyncedAt` and `initialSyncCompletedAt` are updated only after complete success.
- Reconciliation retries the provider query after a transient failure without advancing the watermark.

## Configuration

Add environment variables with conservative defaults:

- `DB_POOL_MAX`: PostgreSQL connections per Node.js process.
- `DB_CONNECTION_TIMEOUT_MS`: maximum wait for a PostgreSQL connection.
- `SYNC_WORKER_CONCURRENCY`: BullMQ sync jobs per worker process.
- `EMAIL_PERSIST_CONCURRENCY`: concurrent email persistence operations per batch.
- `GMAIL_POLL_INTERVAL_MS`: Gmail polling interval.
- `IMAP_RECONCILE_INTERVAL_MS`: interval for recovery checks.

The deployment must choose values whose sum across web and worker processes remains below PostgreSQL `max_connections`, leaving administrative headroom. Raising `max_connections` is optional and is not the primary fix.

## Testing

Tests will cover pool configuration, retry behavior, incomplete sync watermark protection, Gmail poll overlap protection, IMAP reconnect scheduling after `error`, and preservation of worker partition filtering/job deduplication.
