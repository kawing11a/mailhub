import { create } from 'zustand';

interface ComposeDraft {
  id?: string;
  accountId?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml: string;
  replyToSubject?: string;
  replyToBody?: string;
  attachments?: Array<{
    id?: string;
    filename: string;
    contentType: string;
    sizeBytes?: number;
    content: string;
  }>;
}

interface AccountState {
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  
  isComposeModalOpen: boolean;
  setComposeModalOpen: (isOpen: boolean) => void;
  
  composeDraft: ComposeDraft | null;
  setComposeDraft: (draft: ComposeDraft | null) => void;
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
