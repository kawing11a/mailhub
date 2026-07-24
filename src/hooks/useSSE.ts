'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import toast from 'react-hot-toast';

// Utility to convert base64 url safe to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  // Request native notification permission on mount and subscribe to Web Push
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      // First, request permission if not already granted/denied
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            registerServiceWorkerAndSubscribe();
          }
        }).catch(console.error);
      } else if (Notification.permission === 'granted') {
        registerServiceWorkerAndSubscribe();
      }
    }

    async function registerServiceWorkerAndSubscribe() {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // Wait until registration is active
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!publicVapidKey) {
            console.warn('Web Push notification registration skipped: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured in environment variables.');
            return;
          }

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
          });
        }

        // Send subscription to backend
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ subscription })
        });

        console.log('Web Push subscribed successfully');
      } catch (error) {
        console.error('Service Worker / Push Registration failed:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Only connect once
    if (eventSourceRef.current) return;

    const es = new EventSource('/api/realtime/stream');
    eventSourceRef.current = es;

    es.addEventListener('new_email', (event) => {
      console.log('Received new email event', event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.subject && data.from) {
          // Show in-app toast
          toast.success(`New email from ${data.from}: ${data.subject}`, {
            duration: 4000,
          });

          // Show native device notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(`New email from ${data.from}`, {
              body: data.subject,
              icon: '/favicon.ico', // Optional fallback icon
            });

            // Focus window when notification is clicked
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        }
      } catch (e) { }

      // Invalidate emails, accounts (unread counts), and labels lists
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      // Without these the sidebar unread badges lag behind pushed mail by up to 30s
      queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
      queryClient.invalidateQueries({ queryKey: ['accountStats'] });
    });

    es.addEventListener('initial_sync_complete', (event) => {
      console.log('Initial sync complete', event.data);
      toast.success('Historical sync complete! Your mailbox is up to date.');
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
      queryClient.invalidateQueries({ queryKey: ['accountStats'] });
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
