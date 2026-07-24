'use client';

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

export function ServiceWorkerRegister() {
  const currentBuildTimeRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Register Service Worker if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Periodically check for SW update every 2 minutes
          const interval = setInterval(() => {
            registration.update().catch(() => {});
          }, 120000);

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                toast.loading('New version deployed! Updating application...', { id: 'sw-update' });
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              }
            });
          });

          return () => clearInterval(interval);
        })
        .catch((err) => {
          console.warn('Service Worker registration skipped or failed:', err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    // 2. Poll /api/version for deployment updates
    const checkDeploymentVersion = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();

        if (currentBuildTimeRef.current === null) {
          currentBuildTimeRef.current = data.buildTime;
        } else if (currentBuildTimeRef.current !== data.buildTime) {
          toast.loading('New version deployed! Updating application...', { id: 'app-update' });
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      } catch {
        // Suppress network check errors
      }
    };

    checkDeploymentVersion();
    const versionInterval = setInterval(checkDeploymentVersion, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkDeploymentVersion();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(versionInterval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
