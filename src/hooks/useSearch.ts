'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export function useSearch(initialQuery = '', accountId?: string, folder?: string) {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', debouncedQuery, accountId, folder],
    queryFn: async () => {
      if (!debouncedQuery) return { hits: [], estimatedTotalHits: 0 };
      
      const params = new URLSearchParams({ q: debouncedQuery });
      if (accountId && accountId !== 'all') params.append('accountId', accountId);
      if (folder && folder !== 'all') params.append('folder', folder);
      
      const res = await fetch(`/api/emails/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedQuery.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000, // Cache results for 1 minute to reduce API calls
  });

  return {
    query,
    setQuery,
    results: data?.hits || [],
    isLoading,
    error,
  };
}
