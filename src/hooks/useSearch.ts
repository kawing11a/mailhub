'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export function useSearch(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return { hits: [], estimatedTotalHits: 0 };
      const res = await fetch(`/api/emails/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedQuery.length > 0,
  });

  return {
    query,
    setQuery,
    results: data?.hits || [],
    isLoading,
    error,
  };
}
