export interface SyncResult {
  processed: number;
  failed: number;
}

export class IncompleteSyncError extends Error {
  readonly accountId: string;
  readonly result: SyncResult;

  constructor(accountId: string, result: SyncResult) {
    super(`Sync incomplete for account ${accountId}: ${result.failed} email(s) failed to persist.`);
    this.name = 'IncompleteSyncError';
    this.accountId = accountId;
    this.result = result;
  }
}
