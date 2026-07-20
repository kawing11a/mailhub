'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@/hooks/useSearch';
import { useUIStore } from '@/stores/uiStore';
import { useAccountStore } from '@/stores/accountStore';
import { Search, X, Mail, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export function SearchModal() {
  const router = useRouter();
  const { isSearchOpen, setSearchOpen } = useUIStore();
  const { query, setQuery, results, isLoading } = useSearch('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSelectedIndex(0);
    } else {
      setQuery('');
    }
  }, [isSearchOpen, setQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSearchOpen) return;
      
      if (e.key === 'Escape') {
        setSearchOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev < results.length - 1 ? prev + 1 : prev;
          document.getElementById(`search-result-${next}`)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : 0;
          document.getElementById(`search-result-${next}`)?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results.length > 0 && selectedIndex >= 0 && selectedIndex < results.length) {
          const email = results[selectedIndex];
          setSearchOpen(false);
          useAccountStore.getState().setSelectedAccountId(email.accountId);
          if (window.location.pathname === '/inbox') {
            window.history.pushState(null, '', `/inbox?emailId=${email.id}`);
          } else {
            router.push(`/inbox?emailId=${email.id}`);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setSearchOpen, results, selectedIndex, router]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/30 backdrop-blur-md transition-opacity duration-300"
        onClick={() => setSearchOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] transition-all border border-white/20 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center border-b border-gray-200 px-5 py-4">
          <Search className="h-6 w-6 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent ml-4 text-lg text-gray-900 placeholder:text-gray-500 focus:outline-none border-0 p-0"
            placeholder="Search emails by subject, sender, or content..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-gray-400 mr-2" />}
          <button
            onClick={() => setSearchOpen(false)}
            className="rounded-md p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        {query.length > 0 && (
          <div className="max-h-96 overflow-y-auto p-2">
            {results.length === 0 && !isLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 mb-4 rounded-full bg-gray-50/50 border border-gray-100 flex items-center justify-center">
                  <Search className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-sm font-medium text-gray-900">No emails found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  We couldn't find anything matching "<span className="font-medium text-gray-700">{query}</span>". Try adjusting your search terms.
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {results.map((email: any, index: number) => {
                  const account = accounts?.find((a: any) => a.id === email.accountId);
                  const accountName = account ? (account.label || account.emailAddress) : 'Unknown Account';
                  
                  return (
                  <li key={email.id} id={`search-result-${index}`}>
                    <button
                      className={`w-full flex flex-col items-start px-3 py-3 rounded-xl transition-all duration-200 text-left group ${index === selectedIndex ? 'bg-gradient-to-r from-accent-50/80 to-transparent ring-1 ring-accent-200 shadow-sm transform scale-[1.01]' : 'hover:bg-gray-50/80 hover:scale-[1.005]'}`}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        setSearchOpen(false);
                        useAccountStore.getState().setSelectedAccountId(email.accountId);
                        if (window.location.pathname === '/inbox') {
                          window.history.pushState(null, '', `/inbox?emailId=${email.id}`);
                        } else {
                          router.push(`/inbox?emailId=${email.id}`);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center space-x-2 truncate">
                          <Mail className={`h-4 w-4 flex-shrink-0 ${index === selectedIndex ? 'text-accent-500' : 'text-gray-400 group-hover:text-accent-500'}`} />
                          <span className="font-medium text-gray-900 truncate">
                            {email.fromName || email.fromAddress}
                            {email.fromName && <span className="ml-1 font-normal text-gray-500">&lt;{email.fromAddress}&gt;</span>}
                          </span>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0 ml-4 text-xs text-gray-400">
                          <span>{email.receivedAt ? format(new Date(email.receivedAt), 'MMM d, yyyy') : ''}</span>
                          {account && (
                            <span 
                              className="mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[120px]"
                              style={{ 
                                backgroundColor: account.color ? `${account.color}15` : '#F3F4F6', 
                                color: account.color || '#4B5563',
                                border: `1px solid ${account.color ? `${account.color}30` : '#E5E7EB'}`
                              }}
                              title={`Received by: ${accountName}`}
                            >
                              {accountName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-700 truncate w-full">
                        {email.subject || '(No Subject)'}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-2 mt-1">
                        {email.snippet || email.bodyText?.substring(0, 150)}
                      </div>
                    </button>
                  </li>
                )})}
              </ul>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex items-center justify-between">
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
