'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Check } from 'lucide-react';
import clsx from 'clsx';

export function LabelPicker({ emailId }: { emailId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: labelsData } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      return res.json();
    },
  });

  const tagMutation = useMutation({
    mutationFn: async (labelId: string) => {
      const res = await fetch(`/api/labels/${labelId}/emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId }),
      });
      if (!res.ok) throw new Error('Failed to tag email');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email', emailId] });
      setIsOpen(false);
    },
  });

  const labels = labelsData?.labels || [];

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors flex items-center" 
        title="Tag Email"
      >
        <Tag className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
              Apply Label
            </div>
            <div className="max-h-60 overflow-y-auto">
              {labels.map((label: any) => (
                <button
                  key={label.id}
                  onClick={() => tagMutation.mutate(label.id)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center space-x-2 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="flex-1 truncate">{label.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
