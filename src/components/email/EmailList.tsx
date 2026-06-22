'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { EmailRow } from './EmailRow';
import { Loader2, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearch } from '@/hooks/useSearch';

interface EmailListProps {
  onSelectEmail: (emailId: string) => void;
  selectedEmailId: string | null;
}

export function EmailList({ onSelectEmail, selectedEmailId }: EmailListProps) {
  const { selectedAccountId } = useAccountStore();
  const [searchQuery, setSearchQuery] = useState('');
  const { results: searchResults, isLoading: isSearchLoading } = useSearch(searchQuery);

  const { data, isLoading } = useQuery({
    queryKey: ['emails', selectedAccountId],
    queryFn: async () => {
      const url = selectedAccountId === 'all' 
        ? '/api/accounts/all/emails' // Will need to handle unified inbox route logic
        : `/api/accounts/${selectedAccountId}/emails`;
        
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch emails');
      return res.json();
    },
    enabled: searchQuery.length === 0, // Only fetch normal list if not searching
  });

  const emailsToDisplay = searchQuery ? searchResults : data?.emails;
  const loading = isLoading || isSearchLoading;

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : emailsToDisplay?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
            <InboxEmptyState />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {emailsToDisplay?.map((email: any) => (
              <EmailRow
                key={email.id}
                email={email}
                onClick={onSelectEmail}
                isSelected={selectedEmailId === email.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InboxEmptyState() {
  return (
    <>
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
        <Search className="w-8 h-8 text-gray-300" />
      </div>
      <p className="text-sm font-medium text-gray-900">No emails found</p>
      <p className="text-sm text-gray-500 mt-1">
        Try adjusting your search or check back later.
      </p>
    </>
  );
}
