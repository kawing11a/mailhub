export interface DraftIdentity {
  draftId: string;
  accountId: string;
}

export interface DraftSnapshot {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type DraftSaveFunction = (
  snapshot: DraftSnapshot,
  identity: DraftIdentity | null
) => Promise<DraftIdentity>;

export function isEmptyDraft(snapshot: DraftSnapshot): boolean {
  const bodyText = snapshot.bodyText.trim();
  const bodyHtml = snapshot.bodyHtml
    .replace(/<p><\/p>/gi, '')
    .replace(/<p><br><\/p>/gi, '')
    .trim();

  return !snapshot.to.trim()
    && !snapshot.cc.trim()
    && !snapshot.bcc.trim()
    && !snapshot.subject.trim()
    && !bodyText
    && !bodyHtml;
}

/**
 * Owns debounce timing and serializes saves. Serial execution is important:
 * changing From must first finish any older save and then move the same draft
 * to the new account, without a stale response replacing its identity.
 */
export class DraftAutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private pending = 0;
  private identity: DraftIdentity | null = null;

  constructor(
    private readonly save: DraftSaveFunction,
    private readonly onStatus: (status: DraftSaveStatus) => void
  ) {}

  initialize(identity: DraftIdentity | null): void {
    this.cancelTimer();
    this.generation += 1;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.identity = identity;
    this.onStatus(identity ? 'saved' : 'idle');
  }

  dispose(): void {
    this.cancelTimer();
    this.generation += 1;
    this.queue = Promise.resolve();
    this.pending = 0;
    this.identity = null;
  }

  getIdentity(): DraftIdentity | null {
    return this.identity;
  }

  schedule(snapshot: DraftSnapshot, delay = 3000): void {
    this.cancelTimer();
    if (isEmptyDraft(snapshot)) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.enqueue(snapshot).catch(() => {
        // Status is reported by enqueue; edits remain available for retry.
      });
    }, delay);
  }

  async flush(snapshot: DraftSnapshot): Promise<DraftIdentity | null> {
    this.cancelTimer();
    if (isEmptyDraft(snapshot) && !this.identity) return null;
    return this.enqueue(snapshot);
  }

  cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private enqueue(snapshot: DraftSnapshot): Promise<DraftIdentity> {
    const generation = this.generation;
    this.pending += 1;

    const result = this.queue.then(async () => {
      if (generation !== this.generation) {
        throw new Error('Draft save session changed');
      }

      this.onStatus('saving');
      const identity = await this.save(snapshot, this.identity);

      if (generation !== this.generation) {
        throw new Error('Draft save session changed');
      }

      this.identity = identity;
      return identity;
    });

    this.queue = result.then(
      () => undefined,
      () => undefined
    );

    void result.then(
      () => {
        if (generation !== this.generation) return;
        this.pending -= 1;
        if (this.pending === 0) {
          this.onStatus('saved');
        }
      },
      () => {
        if (generation !== this.generation) return;
        this.pending -= 1;
        this.onStatus('error');
      }
    );

    return result;
  }
}
