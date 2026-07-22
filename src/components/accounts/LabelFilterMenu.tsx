'use client';

import { useQuery } from '@tanstack/react-query';

export interface AccountLabel {
  id: string;
  name: string;
  color?: string | null;
  accountIds?: string[];
}

/** Shared labels query, used by both the sidebar filter and the all-accounts modal. */
export function useLabels(enabled = true) {
  const { data } = useQuery<{ labels: AccountLabel[] }>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
    enabled,
  });
  return data?.labels ?? [];
}

/**
 * Accounts carrying any of the selected labels. Returns null when nothing is
 * selected, meaning "no label filter — allow everything".
 */
export function allowedAccountIdsForLabels(
  labels: AccountLabel[],
  selectedLabelIds: Set<string>
): Set<string> | null {
  if (selectedLabelIds.size === 0) return null;
  return new Set(
    labels.filter((l) => selectedLabelIds.has(l.id)).flatMap((l) => l.accountIds ?? [])
  );
}
