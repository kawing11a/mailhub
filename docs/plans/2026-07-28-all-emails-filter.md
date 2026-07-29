# All Emails Screen & Aggregated Account Filtering Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Transform the "New emails" screen into an "All emails" aggregated screen with top filter pills (All, Unread, Favourite accounts, Favourite emails), sticky unread retention, and account indicator badges per email row.

**Architecture:** Update the `/api/accounts/[id]/emails` endpoint to handle `'all'` pseudo-account with `filter` parameter and return account relation metadata. Enhance `EmailRow` to display account badges and `EmailList` to support top horizontal filter pills with client-side unread retention. Update sidebar and routes to transition from `/new-emails` to `/all-emails`.

**Tech Stack:** Next.js (App Router), React, React Query, Prisma, Tailwind CSS, Lucide icons.

---

### Task 1: API Endpoint Enhancement for Aggregated Filtering & Account Data

**Files:**
- Modify: `src/app/api/accounts/[id]/emails/route.ts:1-120`
- Test: `src/__tests__/app/api/all-emails-route.test.ts`

**Step 1: Write the test**
Create test file `src/__tests__/app/api/all-emails-route.test.ts` verifying that GET `/api/accounts/all/emails` accepts `filter` query parameter (`all`, `unread`, `favourite-accounts`, `favourite-emails`) and includes account relation metadata in the returned email payload.

**Step 2: Run test to verify it fails**
Run: `npx vitest run src/__tests__/app/api/all-emails-route.test.ts` or `npm test`
Expected: FAIL due to missing test/functionality.

**Step 3: Implement API changes**
In `src/app/api/accounts/[id]/emails/route.ts`:
- Allow `accountId === 'all'` or `accountId === 'new-emails'`.
- Support `filter` query param (`all`, `unread`, `favourite-accounts`, `favourite-emails`).
- If `filter === 'favourite-accounts'`, query active `favouriteAccounts` for `auth.userId` and filter `accountId in favouriteAccountIds`.
- If `filter === 'favourite-emails'`, add `isStarred: true` to `where`.
- Include `account: { select: { id: true, label: true, emailAddress: true, color: true } }` in `prisma.email.findMany`.

**Step 4: Run test to verify it passes**
Run: `npx vitest run src/__tests__/app/api/all-emails-route.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/app/api/accounts/[id]/emails/route.ts src/__tests__/app/api/all-emails-route.test.ts
git commit -m "feat(api): add aggregated filtering and account relation metadata to emails route"
```

---

### Task 2: Account Display Badge in EmailRow

**Files:**
- Modify: `src/components/email/EmailRow.tsx:1-149`

**Step 1: Update EmailRow interface and component**
Modify `src/components/email/EmailRow.tsx` to display an account badge when account metadata (`email.account`) is present.
- Render account label or email address with dot/badge styled with `email.account.color || '#3B82F6'`.

**Step 2: Verify visually and via build check**
Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

**Step 3: Commit**
```bash
git add src/components/email/EmailRow.tsx
git commit -m "feat(ui): display account badge in EmailRow"
```

---

### Task 3: Filter Pills Bar and Unread Retention in EmailList

**Files:**
- Modify: `src/components/email/EmailList.tsx:1-710`

**Step 1: Implement filter pills and sticky unread retention logic**
Modify `src/components/email/EmailList.tsx`:
- Add filter state: `activeFilter` (`'all' | 'unread' | 'favourite-accounts' | 'favourite-emails'`).
- Pass `filter` param in query key and request URL to `/api/accounts/all/emails?filter=${activeFilter}`.
- Render top filter bar with 4 horizontal pill buttons: "All emails", "Unread emails", "Favourite accounts", "Favourite emails".
- In "Unread emails" mode, track read state changes locally so emails marked as read remain in the visible list until filter switch or view reload.

**Step 2: Run typecheck**
Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

**Step 3: Commit**
```bash
git add src/components/email/EmailList.tsx
git commit -m "feat(ui): add horizontal filter pills bar and unread retention to EmailList"
```

---

### Task 4: All Emails Route & Navigation Updates

**Files:**
- Create: `src/app/(dashboard)/all-emails/page.tsx`
- Modify: `src/app/(dashboard)/new-emails/page.tsx`
- Modify: `src/components/sidebar/Sidebar.tsx`

**Step 1: Create All Emails route**
Create `src/app/(dashboard)/all-emails/page.tsx` rendering the aggregated list with `setSelectedAccountId('all')`.

**Step 2: Update New Emails route to redirect**
Update `src/app/(dashboard)/new-emails/page.tsx` to redirect to `/all-emails`.

**Step 3: Update Sidebar**
In `src/components/sidebar/Sidebar.tsx`, update navigation link text from "New Emails" to "All Emails" pointing to `/all-emails`.

**Step 4: Verify typecheck & build**
Run: `npm run build` or `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**
```bash
git add src/app/\(dashboard\)/all-emails/page.tsx src/app/\(dashboard\)/new-emails/page.tsx src/components/sidebar/Sidebar.tsx
git commit -m "feat(navigation): add /all-emails route and update sidebar"
```
