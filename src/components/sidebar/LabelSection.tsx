'use client';

import { useQuery } from '@tanstack/react-query';
import { Tag, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export function LabelSection() {
  const pathname = usePathname();

  const { data: labelsData, isLoading } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const labels = labelsData?.labels || [];

  return (
    <div className="flex flex-col space-y-1 p-2">
      <div className="pt-4 pb-1 flex items-center justify-between px-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Labels
        </p>
        <button className="text-gray-400 hover:text-gray-600 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>

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
