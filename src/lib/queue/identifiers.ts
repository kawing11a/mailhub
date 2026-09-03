export function getSyncQueueName(workerPartition: string | null | undefined): string {
  return `imap-sync-${workerPartition || 'default'}`;
}

export function getInitialSyncJobId(accountId: string): string {
  return `initial-sync-${accountId}`;
}
