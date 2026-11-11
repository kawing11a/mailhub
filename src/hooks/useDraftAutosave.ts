'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DraftAutosaveController,
  type DraftIdentity,
  type DraftSaveStatus,
  type DraftSnapshot,
} from '@/lib/email/draft-autosave';

interface UseDraftAutosaveOptions {
  enabled: boolean;
  snapshot: DraftSnapshot | null;
  changeVersion: number;
}

interface UseDraftAutosaveResult {
  status: DraftSaveStatus;
  initialize: (identity: DraftIdentity | null) => void;
  flush: () => Promise<DraftIdentity | null>;
  cancelScheduledSave: () => void;
  getIdentity: () => DraftIdentity | null;
}

async function saveDraft(
  snapshot: DraftSnapshot,
  identity: DraftIdentity | null
): Promise<DraftIdentity> {
  const res = await fetch(`/api/accounts/${snapshot.accountId}/drafts`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      draftId: identity?.draftId,
      to: snapshot.to,
      cc: snapshot.cc,
      bcc: snapshot.bcc,
      subject: snapshot.subject,
      bodyHtml: snapshot.bodyHtml,
      bodyText: snapshot.bodyText,
      attachments: snapshot.attachments,
    }),
  });

  if (!res.ok) throw new Error('Failed to save draft');

  const data = await res.json();
  if (!data.draftId || !data.accountId) {
    throw new Error('Draft save returned an invalid identity');
  }

  return { draftId: data.draftId, accountId: data.accountId };
}

export function useDraftAutosave({
  enabled,
  snapshot,
  changeVersion,
}: UseDraftAutosaveOptions): UseDraftAutosaveResult {
  const [status, setStatus] = useState<DraftSaveStatus>('idle');
  const previousAccountIdRef = useRef<string | null>(null);
  const [controller] = useState(() => new DraftAutosaveController(saveDraft, setStatus));

  useEffect(() => {
    if (!enabled || !snapshot) {
      controller.cancelTimer();
      previousAccountIdRef.current = null;
      return;
    }

    const accountChanged = previousAccountIdRef.current !== null
      && previousAccountIdRef.current !== snapshot.accountId;
    previousAccountIdRef.current = snapshot.accountId;

    if (accountChanged) {
      void controller.flush(snapshot).catch(() => {
        // The hook exposes the failure through status and retries on later edits.
      });
    } else {
      setStatus('idle');
      controller.schedule(snapshot);
    }

    return () => controller.cancelTimer();
  }, [
    enabled,
    snapshot?.accountId,
    snapshot?.to,
    snapshot?.cc,
    snapshot?.bcc,
    snapshot?.subject,
    snapshot?.attachments?.length,
    changeVersion,
    snapshot,
    controller,
  ]);

  useEffect(() => () => controller.dispose(), [controller]);

  const initialize = useCallback((identity: DraftIdentity | null) => {
    previousAccountIdRef.current = identity?.accountId ?? null;
    controller.initialize(identity);
  }, [controller]);

  const flush = useCallback(async () => {
    if (!snapshot) return null;
    return controller.flush(snapshot);
  }, [controller, snapshot]);

  const cancelScheduledSave = useCallback(() => {
    controller.cancelTimer();
  }, [controller]);

  const getIdentity = useCallback(
    () => controller.getIdentity(),
    [controller]
  );

  return { status, initialize, flush, cancelScheduledSave, getIdentity };
}
