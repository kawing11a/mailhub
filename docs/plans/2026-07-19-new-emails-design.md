# New Emails Feature Design

## Overview
A feature to list all newly received emails across all connected email accounts. The entry point for this list will be located in the sidebar, directly underneath the "Compose" button.

## Requirements & Constraints
- **Aggregation**: Must show new emails from *all* connected email accounts.
- **Placement**: Under the Compose button in the main sidebar.
- **Read state**: When an email is marked as read (e.g., opened by the user), it must automatically be removed from the "New Emails" list.
- **Initial Sync exclusion**: Emails fetched during the initial synchronization of an account should *not* be treated as "new emails". Only emails that arrive after the account is connected should appear here.

## Data & Logic (No DB schema changes)
Instead of adding a new boolean flag (like `isNew`) to the database, we define "New Email" dynamically using existing fields:
- `isRead === false` (The email is unread)
- `email.receivedAt > account.createdAt` (The email was received *after* the account was connected to our platform).

When a user clicks on one of these emails to read it, the existing logic that marks it as read (`isRead = true`) will execute. Because our query filters for `isRead === false`, the email will automatically be removed from the "New Emails" list.

## UI Components
1. **Sidebar Navigation (`Sidebar.tsx`)**:
   - A new navigation item labeled "New Emails".
   - A small notification badge displaying the total count of these new emails.
2. **Dedicated Inbox View**:
   - A new route (e.g., `/new-emails`) that renders the existing inbox list components but applies the specific filter to fetch only "new emails" across all accounts.

## Real-time Updates
As the background sync worker fetches new emails and inserts them into the database, the UI will fetch them on its next poll or websocket update, automatically adding them to the top of the list and incrementing the badge.
