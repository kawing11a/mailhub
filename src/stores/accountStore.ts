import { create } from 'zustand';

interface AccountState {
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  
  isComposeModalOpen: boolean;
  setComposeModalOpen: (isOpen: boolean) => void;
  
  composeDraft: {
    id?: string;
    to: string;
    subject: string;
    bodyHtml: string;
  } | null;
  setComposeDraft: (draft: any) => void;
  selectedFolder: string;
  setSelectedFolder: (folder: string) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  selectedAccountId: null,
  setSelectedAccountId: (id) => set({ selectedAccountId: id }),
  
  selectedFolder: 'INBOX',
  setSelectedFolder: (folder) => set({ selectedFolder: folder }),
  
  isComposeModalOpen: false,
  setComposeModalOpen: (isOpen) => set({ isComposeModalOpen: isOpen }),
  
  composeDraft: null,
  setComposeDraft: (draft) => set({ composeDraft: draft }),
}));
