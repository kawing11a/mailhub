import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isSearchOpen: boolean;
  isComposeOpen: boolean;
  isMobileSidebarOpen: boolean;
  isAllAccountsOpen: boolean;
  theme: string;
  density: string;
  readingPane: string;
  timeFormat: string;
  showAvatars: boolean;
  setSearchOpen: (open: boolean) => void;
  setComposeOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setAllAccountsOpen: (open: boolean) => void;
  setTheme: (theme: string) => void;
  setDensity: (density: string) => void;
  setReadingPane: (pane: string) => void;
  setTimeFormat: (format: string) => void;
  setShowAvatars: (show: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSearchOpen: false,
      isComposeOpen: false,
      isMobileSidebarOpen: false,
      // Transient like the other overlays — deliberately not persisted.
      isAllAccountsOpen: false,
      theme: 'theme-blue',
      density: 'density-comfortable',
      readingPane: 'right',
      timeFormat: '12h',
      showAvatars: true,
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setComposeOpen: (open) => set({ isComposeOpen: open }),
      setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),
      setAllAccountsOpen: (open) => set({ isAllAccountsOpen: open }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setReadingPane: (pane) => set({ readingPane: pane }),
      setTimeFormat: (format) => set({ timeFormat: format }),
      setShowAvatars: (show) => set({ showAvatars: show }),
    }),
    {
      name: 'ui-preferences',
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
        readingPane: state.readingPane,
        timeFormat: state.timeFormat,
        showAvatars: state.showAvatars,
      }),
    }
  )
);
