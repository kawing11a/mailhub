'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check if accessed directly via standalone/PWA window or TWA
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true ||
        document.referrer.startsWith('android-app://');

      if (isStandalone) {
        setIsInstalled(true);
        return true;
      }
      return false;
    };

    if (checkStandalone()) return;

    // 2. Check persistent installation flag in localStorage
    if (localStorage.getItem('pwa_installed') === 'true') {
      setIsInstalled(true);
    }

    // 3. System check for installed related apps (Chrome / Edge Desktop & Android)
    if ('getInstalledRelatedApps' in navigator) {
      (navigator as { getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string }>> })
        .getInstalledRelatedApps?.()
        .then((relatedApps) => {
          if (relatedApps && relatedApps.length > 0) {
            setIsInstalled(true);
            localStorage.setItem('pwa_installed', 'true');
          }
        })
        .catch(() => {});
    }

    // 4. Media query listener for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };
    try {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } catch {
      mediaQuery.addListener?.(handleDisplayModeChange);
    }

    // 5. Native browser install prompt events
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      localStorage.setItem('pwa_installed', 'true');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      try {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } catch {
        mediaQuery.removeListener?.(handleDisplayModeChange);
      }
    };
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        setDeferredPrompt(null);
        localStorage.setItem('pwa_installed', 'true');
        return true;
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
    return false;
  };

  return { isInstallable, isInstalled, installPWA };
}
