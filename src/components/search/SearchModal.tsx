'use client';

import { useEffect, useRef } from 'react';
import { useSearch } from '@/hooks/useSearch';
import { useUIStore } from '@/stores/uiStore';
import { Search, X, Mail, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export function SearchModal() {
  const router = useRouter();
  const { isSearchOpen, setSearchOpen } = useUIStore();
  const { query, setQuery, results, isLoading } = useSearch('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isSearchOpen, setQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setSearchOpen]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" 
        onClick={() => setSearchOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all border border-gray-200">
        <div className="flex items-center border-b border-gray-200 px-4 py-3">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent px-4 py-2 text-gray-900 placeholder:text-gray-500 focus:outline-none"
            placeholder="Search emails by subject, sender, or content..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" />}
          <button 
            onClick={() => setSearchOpen(false)}
            className="rounded-md p-1 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        {query.length > 0 && (
          <div className="max-h-96 overflow-y-auto p-2">
            {results.length === 0 && !isLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No emails found for "{query}"
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((email: any) => (
                  <li key={email.id}>
                    <button
                      className="w-full flex flex-col items-start px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors text-left group"
                      onClick={() => {
                        setSearchOpen(false);
                        // Navigate to the email
                        router.push(`/accounts/${email.accountId}/inbox?emailId=${email.id}`);
                      }}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center space-x-2 truncate">
                          <Mail className="h-4 w-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                          <span className="font-medium text-gray-900 truncate">{email.fromName || email.fromAddress}</span>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                          {email.receivedAt ? format(new Date(email.receivedAt), 'MMM d, yyyy') : ''}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-gray-700 truncate w-full">
                        {email.subject || '(No Subject)'}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-2 mt-1">
                        {email.snippet || email.bodyText?.substring(0, 150)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span className="flex items-center"><kbd className="bg-white border border-gray-200 rounded px-2 py-0.5 shadow-sm mr-2 font-mono">↑↓</kbd> to navigate</span>
            <span className="flex items-center"><kbd className="bg-white border border-gray-200 rounded px-2 py-0.5 shadow-sm mr-2 font-mono">Enter</kbd> to select</span>
            <span className="flex items-center"><kbd className="bg-white border border-gray-200 rounded px-2 py-0.5 shadow-sm mr-2 font-mono">Esc</kbd> to close</span>
          </div>
          <div className="text-xs text-gray-400">
            Powered by Meilisearch
          </div>
        </div>
      </div>
    </div>
  );
}
