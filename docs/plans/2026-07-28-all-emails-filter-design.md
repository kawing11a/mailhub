# Design Document: All Emails Screen & Aggregated Account Filtering

**Date**: 2026-07-28  
**Topic**: All Emails Screen & Aggregated Account Filtering

## Overview
Transform the existing "New emails" screen into a unified "All emails" experience. Aggregates emails across all user-accessible accounts into a single list with top filter pills (All emails, Unread emails, Favourite accounts, Favourite emails) and displays individual account ownership badges on each email item in the list.

## 1. Sidebar & Routing Changes
- **Sidebar Label**: Update "New Emails" link to "All Emails" (`href="/all-emails"`).
- **Routes**:
  - `src/app/(dashboard)/all-emails/page.tsx`: Primary page component for viewing aggregated emails across accounts.
  - `src/app/(dashboard)/new-emails/page.tsx`: Redirect page pointing to `/all-emails` for backwards compatibility.
- **Account State**: Set `selectedAccountId = 'all'` when accessing the All Emails screen.

## 2. Filter Bar (Horizontal Pill Tabs)
Filter control placed above the email list with 4 options:
1. **All emails**: Shows all emails from all accounts.
2. **Unread emails**: Shows unread emails across all accounts.
   - **Sticky Read Retention**: When an unread email is clicked/read on this tab, its state updates visually to read, but it remains visible in the current list. It naturally drops off only when leaving the screen or changing the filter pill.
3. **Favourite accounts**: Shows emails belonging only to accounts favourited by the user (checked via `FavouriteAccount` relation).
4. **Favourite emails**: Shows emails where `isStarred = true`.

## 3. Account Display Badges in Email List Item (`EmailRow`)
- Each item in the email list displays the associated account's display label or email address.
- Badge includes:
  - Account color indicator dot (or background tint)
  - Account `label` (falling back to `emailAddress`)

## 4. API & Backend Enhancements
- Enhance `GET /api/accounts/all/emails` (and `/api/accounts/[id]/emails`) query params:
  - `filter`: `all` | `unread` | `favourite-accounts` | `favourite-emails`
- Include account relation (`select: { id, label, emailAddress, color }`) in the returned email objects so the UI can render account badges without secondary lookups.

## 5. Testing & Verification
- Unit/component tests for filter tab switching, unread retention, and account badge rendering.
- E2E / manual verification of aggregated fetching and filter operations.
