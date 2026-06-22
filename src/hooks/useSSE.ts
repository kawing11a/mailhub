'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Only connect once
    if (eventSourceRef.current) return;

    const es = new EventSource('/api/realtime/stream');
    eventSourceRef.current = es;

    es.addEventListener('new_email', (event) => {
      // Invalidate emails list queries
      console.log('Received new email event', event.data);
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    });

    es.addEventListener('sync_progress', (event) => {
      console.log('Sync progress event', event.data);
      // Can dispatch to a toast or store later
    });

    es.onerror = (err) => {
      console.error('SSE Error', err);
      // Will automatically reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [queryClient]);
}
