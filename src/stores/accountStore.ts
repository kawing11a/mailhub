import { create } from 'zustand';

interface AccountState {
  selectedAccountId: string | 'all';
  setSelectedAccountId: (id: string | 'all') => void;
  
  isComposeModalOpen: boolean;
  setComposeModalOpen: (isOpen: boolean) => void;
  
  composeDraft: {
    to: string;
    subject: string;
    bodyHtml: string;
  } | null;
  setComposeDraft: (draft: any) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  selectedAccountId: 'all',
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  
  isComposeModalOpen: false,
  setComposeModalOpen: (isOpen) => set({ isComposeModalOpen: isOpen }),
  
  composeDraft: null,
  setComposeDraft: (draft) => set({ composeDraft: draft }),
}));
