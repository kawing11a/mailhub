'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tag, Loader2, Plus, Check } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export function LabelSection() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [labelName, setLabelName] = useState('');

  const { data: labelsData, isLoading } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const labels = labelsData?.labels || [];

  const createLabel = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create label');
      return data.label;
    },
    onSuccess: (label) => {
      queryClient.setQueryData(['labels'], (current: { labels: typeof labels } | undefined) => ({
        labels: [...(current?.labels || []), label].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setLabelName('');
      setIsCreating(false);
      toast.success('Label created');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (isCreating) inputRef.current?.focus();
  }, [isCreating]);

  const finishCreating = () => {
    const name = labelName.trim();
    if (!name || createLabel.isPending) return;
    createLabel.mutate(name);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      finishCreating();
    }
    if (event.key === 'Escape') {
      setLabelName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col space-y-1 p-2">
      <div className="pt-4 pb-1 flex items-center justify-between px-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Labels
        </p>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
          aria-label="Add label"
          disabled={isCreating}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {isCreating && (
        <div className="label-create-enter mx-1 flex items-stretch overflow-hidden rounded-md border border-accent-300 bg-white shadow-sm focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-100">
          <textarea
            ref={inputRef}
            value={labelName}
            onChange={(event) => setLabelName(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="New label"
            aria-label="New label name"
            rows={1}
            maxLength={100}
            className="min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-5 outline-none"
          />
          <button
            type="button"
            onClick={finishCreating}
            disabled={!labelName.trim() || createLabel.isPending}
            className="flex min-w-9 items-center justify-center border-l border-accent-200 bg-accent-50 px-2 text-accent-700 transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Finish creating label"
            title="Finish (Enter)"
          >
            {createLabel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : labels.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-500 italic">
          No labels created
        </div>
      ) : (
        labels.map((label: any) => {
          const isActive = pathname === `/labels/${label.id}`;
          return (
            <Link
              key={label.id}
              href={`/labels/${label.id}`}
              className={clsx(
                'flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                isActive
                  ? 'bg-accent-600 text-white shadow-sm'
                  : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
              )}
            >
              <Tag className="w-4 h-4" style={{ color: label.color }} />
              <span className="truncate">{label.name}</span>
            </Link>
          );
        })
      )}
    </div>
  );
}
