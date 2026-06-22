# MailHub Phase 3 Task Tracker

- `[x]` **Task 1: Install Dependencies & Setup Providers**
  - Install `@tanstack/react-query`, `zustand`, `lucide-react`, `clsx`, `tailwind-merge`, and `@tiptap/*`
  - Implement `src/app/providers.tsx` with QueryClientProvider
  - Update `src/app/layout.tsx` to use the provider

- `[x]` **Task 2: Global State & Custom Hooks**
  - Create `src/stores/accountStore.ts` with Zustand
  - Create `src/hooks/useSSE.ts` for real-time invalidation
  - Create `src/hooks/useSearch.ts` for Meilisearch integration

- `[x]` **Task 3: App Shell & Sidebar Layout**
  - Implement `src/app/(dashboard)/layout.tsx`
  - Implement `src/components/sidebar/Sidebar.tsx`
  - Implement `src/components/sidebar/AccountList.tsx`

- `[x]` **Task 4: Email List UI**
  - Implement `src/components/email/EmailList.tsx`
  - Implement `src/components/email/EmailRow.tsx`
  - Setup unified inbox at `src/app/(dashboard)/inbox/page.tsx`

- `[x]` **Task 5: Email Viewer & Compose Modal**
  - Implement `src/components/email/EmailViewer.tsx`
  - Implement `src/components/email/ComposeModal.tsx` using TipTap

- `[x]` **Task 6: Verification & Final Polish**
  - Build and verify all frontend components
  - Verify SSE integration works visually
