import { create } from 'zustand';

interface UIState {
  isSearchOpen: boolean;
  isComposeOpen: boolean;
  isMobileSidebarOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  setComposeOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSearchOpen: false,
  isComposeOpen: false,
  isMobileSidebarOpen: false,
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setComposeOpen: (open) => set({ isComposeOpen: open }),
  setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),
}));
