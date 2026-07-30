'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import { getEmailDisplayTimestamp } from '@/lib/email/timestamps';

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

  const results = useMemo(() => {
    const hits = data?.hits;
    if (!hits || !Array.isArray(hits)) return [];

    // Attach original index as similarity rank (0 is most relevant)
    const indexed = hits.map((hit: any, index: number) => ({ hit, index }));

    indexed.sort((a, b) => {
      const dateA = getEmailDisplayTimestamp(a.hit);
      const dateB = getEmailDisplayTimestamp(b.hit);

      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;

      if (timeB !== timeA) {
        return timeB - timeA; // sort by time desc
      }
      return a.index - b.index; // tie-breaker: sort by similarity (original search rank)
    });

    return indexed.map((item) => item.hit);
  }, [data?.hits]);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
  };
}
