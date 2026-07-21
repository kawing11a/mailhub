import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isSearchOpen: boolean;
  isComposeOpen: boolean;
  isMobileSidebarOpen: boolean;
  theme: string;
  density: string;
  readingPane: string;
  timeFormat: string;
  showAvatars: boolean;
  accountsExpanded: boolean;
  setSearchOpen: (open: boolean) => void;
  setComposeOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setTheme: (theme: string) => void;
  setDensity: (density: string) => void;
  setReadingPane: (pane: string) => void;
  setTimeFormat: (format: string) => void;
  setShowAvatars: (show: boolean) => void;
  setAccountsExpanded: (expanded: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSearchOpen: false,
      isComposeOpen: false,
      isMobileSidebarOpen: false,
      theme: 'theme-blue',
      density: 'density-comfortable',
      readingPane: 'right',
      timeFormat: '12h',
      showAvatars: true,
      // Collapsed by default so favourites lead; forced open when there are no
      // favourites (see AccountList). Persisted once the user toggles it.
      accountsExpanded: false,
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      setComposeOpen: (open) => set({ isComposeOpen: open }),
      setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setReadingPane: (pane) => set({ readingPane: pane }),
      setTimeFormat: (format) => set({ timeFormat: format }),
      setShowAvatars: (show) => set({ showAvatars: show }),
      setAccountsExpanded: (expanded) => set({ accountsExpanded: expanded }),
    }),
    {
      name: 'ui-preferences',
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
        readingPane: state.readingPane,
        timeFormat: state.timeFormat,
        showAvatars: state.showAvatars,
        accountsExpanded: state.accountsExpanded
      }),
    }
  )
);
