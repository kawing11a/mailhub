# New Emails Feature Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a feature to list all newly received emails across all accounts under a "New Emails" sidebar navigation item.

**Architecture:** We will create a new API endpoint that aggregates unread emails received *after* the account was connected. A new page will render the existing `EmailList` components filtered by this logic. The sidebar will contain a new link and badge.

**Tech Stack:** Next.js App Router, React Query, Prisma, TailwindCSS.

---

### Task 1: Create the API Endpoint

**Files:**
- Create: `src/app/api/emails/new/route.ts`

**Step 1: Write the implementation**
We will fetch all accounts the user has access to, then map over them to create a query that fetches unread emails where `receivedAt` is greater than the account's `createdAt` timestamp. We then combine these conditions using an `OR` clause.

```ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  // 1. Fetch accessible accounts
  const accounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin'
        ? {
            memberAccess: {
              some: {
                userId: auth.userId,
              },
            },
          }
        : {}),
    },
    select: { id: true, createdAt: true },
  });

  if (accounts.length === 0) {
    return apiResponse({ emails: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } });
  }

  // 2. Build OR conditions for each account (isRead = false, receivedAt > account.createdAt)
  const orConditions = accounts.map(acc => ({
    accountId: acc.id,
    isRead: false,
    receivedAt: { gt: acc.createdAt },
  }));

  // 3. Fetch emails
  const emails = await prisma.email.findMany({
    where: { OR: orConditions },
    orderBy: { receivedAt: 'desc' },
    include: {
      account: { select: { emailAddress: true, label: true, color: true } },
      emailLabels: { include: { label: true } },
      body: { select: { bodyHtml: true, bodyText: false } }
    },
    take: 50,
  });

  return apiResponse({ emails, pagination: { total: emails.length, page: 1, limit: 50, totalPages: 1 } });
}
```

**Step 2: Commit**
```bash
git add src/app/api/emails/new/route.ts
git commit -m "feat: add api endpoint for new aggregated emails"
```

---

### Task 2: Create the Dedicated Inbox View

**Files:**
- Create: `src/app/(dashboard)/new-emails/page.tsx`
- Modify: `src/components/email/EmailList.tsx` (Add support for `selectedAccountId="new-emails"` so it doesn't block rendering if no account is explicitly selected).

*Note: Since we are reusing the EmailList, we will just create a specific page that fetches the new endpoint directly, or we can just render the EmailList but with a prop that tells it to fetch from `/api/emails/new`. However, `EmailList` is heavily tied to `useInfiniteQuery` on `/api/accounts/${selectedAccountId}/emails`. To keep it clean, we'll create a simplified custom list or adjust `EmailList` to handle a special `selectedAccountId === 'new-emails'`.*

Actually, modifying `EmailList` might be complex because of how deeply integrated it is. Instead, we can add a small condition in `EmailList.tsx`:

**Step 1: Modify `EmailList.tsx`**

```tsx
// In src/components/email/EmailList.tsx, around line 247:
    queryFn: async ({ pageParam = 1 }) => {
      let url = `/api/accounts/${selectedAccountId}/emails`;
      
      // ADD THIS OVERRIDE:
      if (selectedAccountId === 'new-emails') {
         url = '/api/emails/new';
      } else {
         url += `?folder=${selectedFolder}&page=${pageParam}&limit=20`;
      }
      // ...
```

Around line 298:
```tsx
  // CHANGE:
  if (!selectedAccountId && selectedAccountId !== 'new-emails') {
```

Around line 316:
```tsx
          {activeAccount || selectedAccountId === 'new-emails' ? (
            <>
              {selectedAccountId === 'new-emails' ? (
                 <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                   <span>New Emails</span>
                 </h2>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: activeAccount.color || '#3B82F6' }}
                    />
                    <span className="truncate">{activeAccount.label || activeAccount.emailAddress}</span>
                  </h2>
                  {activeAccount.label && (
                    <p className="text-xs text-gray-500 truncate mt-0.5 ml-5">{activeAccount.emailAddress}</p>
                  )}
                  <AccountLabelList
                    accountId={activeAccount.id}
                  />
                </>
              )}
            </>
          ) : null}
```

**Step 2: Create `src/app/(dashboard)/new-emails/page.tsx`**

```tsx
'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { EmailList } from '@/components/email/EmailList';
import { EmailViewer } from '@/components/email/EmailViewer';
import { useUIStore } from '@/stores/uiStore';
import { useAccountStore } from '@/stores/accountStore';
import clsx from 'clsx';

function NewEmailsContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedEmailId = searchParams.get('emailId');
  const { readingPane } = useUIStore();
  const { setSelectedAccountId } = useAccountStore();

  useEffect(() => {
    setSelectedAccountId('new-emails');
    return () => setSelectedAccountId(null);
  }, [setSelectedAccountId]);

  const handleSelectEmail = (id: string | null) => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (id) newParams.set('emailId', id);
    else newParams.delete('emailId');
    const queryString = newParams.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;
    window.history.pushState(null, '', url);
  };

  if (readingPane === 'off') {
    return (
      <div className="flex flex-1 h-full overflow-hidden relative">
        {selectedEmailId ? (
          <div className="absolute inset-0 z-10 bg-white flex flex-col">
            <EmailViewer emailId={selectedEmailId} onBack={() => handleSelectEmail(null)} />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            <EmailList selectedEmailId={selectedEmailId} onSelectEmail={handleSelectEmail} />
          </div>
        )}
      </div>
    );
  }

  const isBottomPane = readingPane === 'bottom';

  return (
    <div className={clsx("flex flex-1 h-full overflow-hidden", isBottomPane ? "flex-col" : "")}>
      <div className={clsx("flex flex-col", isBottomPane ? (selectedEmailId ? "h-[45%] min-h-[300px]" : "h-full") : "w-1/3 min-w-[320px] max-w-[480px] h-full")}>
        <EmailList selectedEmailId={selectedEmailId} onSelectEmail={handleSelectEmail} />
      </div>
      <div className={clsx("bg-white relative", isBottomPane ? "flex-1 border-t border-gray-200" : "flex-1 h-full border-l border-gray-200")}>
        {selectedEmailId ? (
          <EmailViewer emailId={selectedEmailId} onBack={() => handleSelectEmail(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-500 bg-gray-50/50">
            <p className="text-sm font-medium">Select an item to read</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewEmailsPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-gray-50/50"><div className="w-6 h-6 animate-spin text-accent-500 border-2 border-current border-t-transparent rounded-full" /></div>}>
      <NewEmailsContent />
    </Suspense>
  );
}
```

**Step 3: Commit**
```bash
git add src/app/\(dashboard\)/new-emails/page.tsx src/components/email/EmailList.tsx
git commit -m "feat: add dedicated view for new emails"
```

---

### Task 3: Update Sidebar Navigation

**Files:**
- Modify: `src/components/sidebar/Sidebar.tsx`

**Step 1: Write implementation**
Underneath the "Compose" button, add a new link that navigates to `/new-emails`.
We will also need to fetch the count of new emails. We can use a quick `useQuery` here.

```tsx
// At top of Sidebar.tsx:
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react'; // Or any icon you prefer
import clsx from 'clsx';
import { usePathname } from 'next/navigation';

// Inside Sidebar function:
  const pathname = usePathname();

  const { data: newEmails } = useQuery({
    queryKey: ['new-emails-count'],
    queryFn: async () => {
      const res = await fetch('/api/emails/new');
      if (!res.ok) return { emails: [] };
      return res.json();
    },
    refetchInterval: 30000 // Poll every 30s
  });

  const newEmailsCount = newEmails?.emails?.length || 0;

// Render under the Compose button (around line 58):
      <div className="flex-none px-4 pb-4">
        <Link
          href="/new-emails"
          onClick={() => useAccountStore.getState().setSelectedAccountId('new-emails')}
          className={clsx(
            "w-full flex items-center justify-between px-3 py-2 rounded-md font-medium transition-colors text-sm",
            pathname === '/new-emails'
              ? 'bg-accent-100 text-accent-900'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <div className="flex items-center space-x-2">
            <Inbox className="w-4 h-4" />
            <span>New Emails</span>
          </div>
          {newEmailsCount > 0 && (
            <span className="bg-accent-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {newEmailsCount}
            </span>
          )}
        </Link>
      </div>
```

**Step 2: Commit**
```bash
git add src/components/sidebar/Sidebar.tsx
git commit -m "feat: add new emails link to sidebar"
```
