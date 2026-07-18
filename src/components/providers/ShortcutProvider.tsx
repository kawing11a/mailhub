'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useAccountStore } from '@/stores/accountStore';

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const { isSearchOpen, setSearchOpen } = useUIStore();
  const { setComposeModalOpen } = useAccountStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;

      // Cmd+K or Ctrl+K for Search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(!isSearchOpen);
      }

      // Cmd+C or Ctrl+C for Compose (only if not in an input and no text is selected, otherwise it conflicts with Copy)
      const hasSelection = window.getSelection()?.toString() !== '';
      if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !isInput && !hasSelection) {
        e.preventDefault();
        setComposeModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setSearchOpen, setComposeModalOpen]);

  return <>{children}</>;
}
