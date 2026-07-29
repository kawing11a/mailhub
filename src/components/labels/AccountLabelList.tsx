'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Tag } from 'lucide-react';

interface AccountLabel {
  id: string;
  name: string;
  color?: string | null;
  accountIds?: string[];
}

interface LabelsResponse {
  labels: AccountLabel[];
}

interface AccountLabelListProps {
  accountId: string;
}

export function AccountLabelList({ accountId }: AccountLabelListProps) {
  const { data: labelsData, isLoading } = useQuery<LabelsResponse>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const accountLabels = (labelsData?.labels || []).filter((label) =>
    label.accountIds?.includes(accountId)
  );

  if (isLoading) {
    return (
      <div className="mt-2 ml-5 flex items-center gap-1.5 text-xs text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading labels…</span>
      </div>
    );
  }

  if (accountLabels.length === 0) return null;

  return (
    <div className="mt-2 ml-5 flex flex-wrap gap-1.5" aria-label="Account labels">
      {accountLabels.map((label) => (
        <div
          key={label.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600"
        >
          <Tag
            className="h-3 w-3 flex-shrink-0"
            style={{ color: label.color || '#3B82F6' }}
          />
          <span className="max-w-32 truncate">{label.name}</span>
        </div>
      ))}
    </div>
  );
}
