# MailHub — Refined System Design Document

**Project:** MailHub — Full-Stack Multi-Account Email Management System  
**Stack:** Next.js (App Router) + Node.js + PostgreSQL + Redis + Meilisearch  
**Version:** 1.1 (Refined from v1.0 brainstorming session)  
**Date:** 2026-06-21

---

## 1. Executive Summary

MailHub is a full-stack, team-based email management platform supporting 100+ email
accounts across IMAP/SMTP and OAuth-based providers (Gmail, Outlook). The system
maintains persistent IMAP connections via IDLE across all connected accounts using
partitioned worker instances, persists email data in PostgreSQL, indexes it in
Meilisearch for instant search, and exposes a RESTful API for account management
and email operations.

The Next.js frontend provides an account-separated UI with cross-account threading,
real-time SSE push notifications, inbox/draft/sent views per account, and a
label-based organization system. The platform is designed for team use within an
organization, where all members can read and send from any connected account.

### Key Changes from v1.0

| Area | v1.0 | v1.1 (Refined) |
|------|------|----------------|
| User model | Single-user per account | Team-based organization model |
| Audit | None | Write-action activity log |
| Email body storage | Inline in `emails` table | Separate `email_bodies` table |
| IMAP workers | Single worker process | 2-3 partitioned worker instances |
| Search | Deferred to Phase 5 | Meilisearch from Phase 2 |
| Threading | Schema only | RFC 2822 cross-account implementation |
| Attachments | Thin spec | Local filesystem + abstraction layer |
| Rich text editor | TipTap or react-quill | TipTap (committed) |

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS FRONTEND (App Router)                    │
│  Account Sidebar │ Email List │ Email Viewer │ Compose │ Label Manager  │
└───────────┬──────────────────────────────────────────────┬──────────────┘
            │  REST API (Next.js Route Handlers)           │  SSE
            ▼                                               ▼
┌───────────────────────────────┐              ┌───────────────────────────┐
│   BACKEND API SERVER           │              │  REALTIME SERVICE         │
│  (Next.js Route Handlers)      │              │  (SSE stream endpoint)    │
│                                │              │  Pushes new email events  │
└────────────┬──────────────────┘              └──────────┬────────────────┘
             │                                             │
             ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          CORE SERVICES LAYER                            │
│                                                                         │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐    │
│  │  IMAP Workers     │   │  SMTP Sender     │   │  OAuth Service   │    │
│  │  (2-3 instances,  │   │  (nodemailer)    │   │  (Gmail/O365)    │    │
│  │   partitioned)    │   │                  │   │                  │    │
│  └────────┬─────────┘   └──────────────────┘   └──────────────────┘    │
│           │ IMAP IDLE per account                                       │
└───────────┼─────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│  PostgreSQL Database │  │  Redis Cache   │  │  BullMQ      │  │  Meilisearch │
│  - organizations     │  │  - sessions    │  │  Job Queue   │  │  - email     │
│  - org_members       │  │  - email counts│  │  - sync jobs │  │    search    │
│  - accounts          │  │  - worker      │  │  - send jobs │  │    index     │
│  - emails            │  │    heartbeats  │  │  - index jobs│  │              │
│  - email_bodies      │  └───────────────┘  └──────────────┘  └──────────────┘
│  - attachments       │
│  - labels            │
│  - activity_log      │
└──────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14+ (App Router) | SSR + RSC, API routes, file-based routing |
| Styling | Tailwind CSS v4 | Utility-first, rapid UI development |
| State Management | Zustand + React Query (TanStack) | Local UI state + server state sync |
| Real-time | SSE (Server-Sent Events) | Push new email notifications (unidirectional) |
| Backend API | Next.js Route Handlers | Co-located API within Next.js project |
| IMAP | `imapflow` (Node.js) | Modern IMAP client, IDLE support |
| SMTP | `nodemailer` | Battle-tested email sending |
| OAuth | NextAuth.js v5 | Gmail OAuth2, Microsoft OAuth2 |
| Database ORM | Prisma | Type-safe DB access, migrations (raw SQL for complex queries) |
| Database | PostgreSQL 16 | Relational, JSONB for metadata |
| Cache / Queue | Redis + BullMQ | Job queues, connection pool, worker heartbeats |
| Search | Meilisearch | Instant full-text search with typo tolerance |
| Auth | JWT (HTTP-only cookies) | Secure session management |
| Background Jobs | BullMQ workers | IMAP sync, search indexing, account health |
| Rich Text Editor | TipTap v2 | Compose modal, extensible and well-maintained |
| Attachment Storage | Local filesystem (v1) | Abstraction layer for future S3 migration |

---

## 4. Database Schema

### 4.1 Organizations Table

```sql
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.2 Organization Members Table

```sql
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'member')),
  joined_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

-- Roles:
--   admin  → can add/remove/configure accounts, manage members, manage labels
--   member → can read and send from any org account, apply labels
```

### 4.3 Email Accounts Table

```sql
CREATE TABLE email_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           VARCHAR(100) NOT NULL,
  email_address   VARCHAR(255) NOT NULL,
  provider        VARCHAR(50) NOT NULL,            -- 'imap', 'gmail', 'outlook'
  color           VARCHAR(7),
  avatar_initials VARCHAR(3),
  is_active       BOOLEAN DEFAULT true,
  last_synced_at  TIMESTAMP WITH TIME ZONE,
  worker_partition VARCHAR(50),                    -- assigned worker instance ID

  -- IMAP/SMTP credentials (encrypted at rest via AES-256-GCM)
  imap_host       VARCHAR(255),
  imap_port       INTEGER,
  imap_secure     BOOLEAN DEFAULT true,
  smtp_host       VARCHAR(255),
  smtp_port       INTEGER,
  smtp_secure     BOOLEAN DEFAULT true,
  username        VARCHAR(255),
  password_encrypted TEXT,

  -- OAuth credentials
  oauth_provider      VARCHAR(50),
  oauth_access_token  TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expiry  TIMESTAMP WITH TIME ZONE,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, email_address)
);
```

### 4.4 Emails Table (Lightweight Envelope)

```sql
CREATE TABLE emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id      VARCHAR(512) NOT NULL,           -- RFC 2822 Message-ID
  uid             BIGINT,                          -- IMAP UID
  thread_id       VARCHAR(512),                    -- org-scoped thread ID
  folder          VARCHAR(100) NOT NULL,
  subject         TEXT,
  snippet         VARCHAR(300),                    -- preview text for list view
  from_address    VARCHAR(512),
  from_name       VARCHAR(255),
  to_addresses    JSONB,
  cc_addresses    JSONB,
  bcc_addresses   JSONB,
  reply_to        VARCHAR(512),
  in_reply_to     VARCHAR(512),
  references_header TEXT,                          -- RFC 2822 References header (for threading)
  is_read         BOOLEAN DEFAULT false,
  is_starred      BOOLEAN DEFAULT false,
  is_draft        BOOLEAN DEFAULT false,
  has_attachments BOOLEAN DEFAULT false,
  size_bytes      INTEGER,
  received_at     TIMESTAMP WITH TIME ZONE,
  sent_at         TIMESTAMP WITH TIME ZONE,
  raw_headers     JSONB,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, message_id)
);

CREATE INDEX idx_emails_account_folder ON emails(account_id, folder, received_at DESC);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_emails_thread ON emails(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX idx_emails_message_id ON emails(message_id);
```

### 4.5 Email Bodies Table (Separated for Performance)

```sql
-- Bodies stored separately to keep the emails table lightweight for list queries.
-- Fetched lazily when a user opens an email.
CREATE TABLE email_bodies (
  email_id    UUID PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  body_html   TEXT,
  body_text   TEXT
);
```

### 4.6 Attachments Table

```sql
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  filename        VARCHAR(512),
  content_type    VARCHAR(255),
  size_bytes      INTEGER,
  storage_path    TEXT,                            -- local path (v1); S3 key (future)
  cid             VARCHAR(255),                    -- Content-ID for inline images
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Max attachment size: 25MB (matching common SMTP limits)
```

### 4.7 Labels Table

```sql
CREATE TABLE labels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
  description     TEXT,
  icon            VARCHAR(50),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, name)
);
```

### 4.8 Account-Label Junction Table

```sql
CREATE TABLE account_labels (
  account_id  UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  label_id    UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, label_id)
);
```

### 4.9 Email-Label Junction Table

```sql
CREATE TABLE email_labels (
  email_id   UUID REFERENCES emails(id) ON DELETE CASCADE,
  label_id   UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (email_id, label_id)
);
```

### 4.10 Email Activity Log Table

```sql
-- Tracks write actions only: send, reply, forward, delete, label changes.
-- Reads are not logged to keep volume manageable.
CREATE TABLE email_activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  account_id      UUID REFERENCES email_accounts(id),
  email_id        UUID REFERENCES emails(id),
  action          VARCHAR(50) NOT NULL,   -- 'sent', 'replied', 'forwarded',
                                          -- 'deleted', 'label_added', 'label_removed',
                                          -- 'account_created', 'account_deleted'
  metadata        JSONB,                  -- action-specific: { to: [...], subject: "..." }
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_org ON email_activity_log(organization_id, created_at DESC);
CREATE INDEX idx_activity_account ON email_activity_log(account_id, created_at DESC);
```

---

## 5. Backend Architecture

### 5.1 IMAP Connection Manager (Multi-Worker)

The system runs **2-3 IMAP worker instances**, each managing a partition of accounts.
Account assignment uses consistent hashing on `account_id` to distribute accounts evenly.

```
Worker Instance 1          Worker Instance 2          Worker Instance 3
├── accounts[0..33]        ├── accounts[34..66]       ├── accounts[67..99]
├── IDLE per account       ├── IDLE per account       ├── IDLE per account
└── heartbeat → Redis      └── heartbeat → Redis      └── heartbeat → Redis
```

**Connection lifecycle per worker:**
1. On startup, query assigned accounts from DB (based on partition key).
2. For each account, open `imapflow` connection (IMAP/SSL or OAuth2 XOAUTH2).
3. Enter IDLE on INBOX. On new email: fetch, parse with `mailparser`, persist to DB,
   enqueue Meilisearch index job, emit Redis Pub/Sub event.
4. Rotate through SENT/DRAFTS/TRASH via scheduled BullMQ jobs.
5. Proactively refresh OAuth tokens 5 minutes before expiry.

**Resilience mechanisms:**
- **Health heartbeats:** Each worker writes to `Redis: worker:{workerId}:heartbeat` every 30s.
- **Per-connection error isolation:** Each IMAP connection wrapped in try/catch with individual
  reconnect (exponential backoff: 1s → 2s → 4s → max 5m).
- **Graceful shutdown:** On SIGTERM, drain in-progress syncs, close connections, deregister
  from Redis.
- **Rebalancing:** When a worker fails, a supervisor process (or BullMQ job) detects missing
  heartbeat and reassigns orphaned accounts to surviving workers.

**Provider-specific limits:**
- Gmail: max 15 concurrent IMAP sessions per account → session recycling
- Outlook: respect Microsoft Graph rate limits for OAuth accounts
- Custom IMAP: configurable connection timeout per account

### 5.2 SMTP Sender Service

```typescript
// src/services/smtp-sender.ts
export async function sendEmail(
  accountId: string,
  userId: string,       // for audit log
  payload: SendEmailPayload
) {
  const account = await getDecryptedAccount(accountId);

  const transporter = account.provider === 'gmail'
    ? createGmailTransporter(account.oauthAccessToken)
    : createSMTPTransporter(account);

  const info = await transporter.sendMail({
    from: `"${account.label}" <${account.emailAddress}>`,
    to: payload.to,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    html: payload.bodyHtml,
    text: payload.bodyText,
    attachments: payload.attachments,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
  });

  // Persist sent email to DB
  await persistSentEmail(accountId, info, payload);

  // Audit log
  await logActivity({
    organizationId: account.organizationId,
    userId,
    accountId,
    action: 'sent',
    metadata: { to: payload.to, subject: payload.subject },
  });

  return info;
}
```

### 5.3 OAuth2 Flow

**Gmail OAuth2:**
1. Frontend redirects to `/api/auth/oauth/google?accountId=new`
2. Backend exchanges code for `access_token` + `refresh_token`
3. Credentials stored encrypted in `email_accounts` table
4. IMAP connection uses XOAUTH2 SASL mechanism via imapflow

**Microsoft OAuth2 (Outlook/Office 365):**
- Same flow; uses IMAP with OAuth2
- `authorization_code` flow for user-delegated access

### 5.4 Credential Encryption

All passwords and OAuth tokens stored encrypted using AES-256-GCM:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
```

### 5.5 Email Threading Implementation

Threading uses RFC 2822 `References` header chaining for cross-account thread grouping:

**On email arrival:**
1. Parse `In-Reply-To` and `References` headers.
2. Look up any referenced `message_id` in the `emails` table across all org accounts.
3. If found → assign the same `thread_id` as the matched email.
4. If not found → use the email's own `message_id` as the new `thread_id`.

**Thread view:**
- Query `SELECT * FROM emails WHERE thread_id = ? ORDER BY received_at ASC`
- Joins across accounts within the org automatically (since `thread_id` is org-scoped)
- Frontend renders as collapsed conversation view

**Cross-account threading example:**
- `sales@company.com` receives email with `Message-ID: <abc@example.com>`
- `support@company.com` receives a reply with `In-Reply-To: <abc@example.com>`
- Both emails get `thread_id = '<abc@example.com>'`
- Team sees unified conversation across both accounts

### 5.6 Meilisearch Integration

**Index schema:**
```json
{
  "uid": "emails",
  "primaryKey": "id",
  "searchableAttributes": ["subject", "bodyText", "fromAddress", "fromName", "toAddresses", "snippet"],
  "filterableAttributes": ["accountId", "folder", "isRead", "isStarred", "hasdAttachments", "labelIds", "organizationId"],
  "sortableAttributes": ["receivedAt", "sentAt"]
}
```

**Indexing pipeline:**
1. After email is persisted to PostgreSQL, enqueue `index-email` BullMQ job.
2. Worker fetches email + body, transforms to Meilisearch document, upserts.
3. On email delete/update, enqueue corresponding index update/delete.

### 5.7 Attachment Storage Service

```typescript
// src/services/storage.ts — abstraction layer for future S3 migration

interface StorageService {
  save(orgId: string, emailId: string, filename: string, buffer: Buffer): Promise<string>;
  get(path: string): Promise<Buffer>;
  getSignedUrl(path: string, expiresIn?: number): Promise<string>;
  delete(path: string): Promise<void>;
}

// v1: LocalStorageService
// Future: S3StorageService (swap via config)
```

**Inline image handling:**
- When rendering HTML emails, replace `cid:` references with local attachment URLs
- Endpoint: `GET /api/attachments/:id/content` (serves attachment content)

**Limits:**
- Max single attachment: 25MB
- Max total attachments per email: 50MB

---

## 6. RESTful API Specification

### 6.1 Authentication

All endpoints require a valid JWT in an HTTP-only cookie. JWT payload includes
`userId`, `organizationId`, and `role`.

### 6.2 Account Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/accounts` | member+ | List all org email accounts |
| `POST` | `/api/accounts` | admin | Add new email account |
| `GET` | `/api/accounts/:id` | member+ | Get account details |
| `PUT` | `/api/accounts/:id` | admin | Update account config |
| `DELETE` | `/api/accounts/:id` | admin | Remove account and all synced emails |
| `POST` | `/api/accounts/:id/test` | admin | Test IMAP/SMTP connectivity |
| `POST` | `/api/accounts/:id/sync` | admin | Trigger manual full sync |
| `GET` | `/api/accounts/:id/stats` | member+ | Unread count, last sync time |

### 6.3 Email Operations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/accounts/:id/emails` | member+ | List emails (paginated) |
| `GET` | `/api/accounts/:id/emails/:emailId` | member+ | Get email with body |
| `POST` | `/api/accounts/:id/emails/send` | member+ | Send email via SMTP |
| `POST` | `/api/accounts/:id/emails/draft` | member+ | Save draft |
| `PUT` | `/api/accounts/:id/emails/:emailId` | member+ | Update flags (read/starred) |
| `DELETE` | `/api/accounts/:id/emails/:emailId` | member+ | Move to trash / delete |
| `POST` | `/api/accounts/:id/emails/:emailId/reply` | member+ | Reply to email |
| `POST` | `/api/accounts/:id/emails/:emailId/forward` | member+ | Forward email |
| `GET` | `/api/emails/thread/:threadId` | member+ | Get full thread (cross-account) |
| `GET` | `/api/emails/search` | member+ | Search via Meilisearch |

**Query parameters for email list:**
- `folder`: INBOX | SENT | DRAFTS | TRASH (default: INBOX)
- `page`, `limit`: pagination (default: 1, 50; max limit: 200)
- `search`: full-text search via Meilisearch
- `unreadOnly`: boolean filter
- `labelId`: filter by label UUID

### 6.4 Label Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/labels` | member+ | List all org labels |
| `POST` | `/api/labels` | member+ | Create new label |
| `PUT` | `/api/labels/:id` | member+ | Update label |
| `DELETE` | `/api/labels/:id` | admin | Delete label |
| `POST` | `/api/labels/:id/accounts` | admin | Assign label to account(s) |
| `POST` | `/api/labels/:id/emails` | member+ | Tag email(s) with label |
| `GET` | `/api/labels/:id/emails` | member+ | List emails by label (cross-account) |

### 6.5 Organization Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/org` | member+ | Get current org details |
| `PUT` | `/api/org` | admin | Update org settings |
| `GET` | `/api/org/members` | admin | List org members |
| `POST` | `/api/org/members` | admin | Invite new member |
| `PUT` | `/api/org/members/:userId` | admin | Update member role |
| `DELETE` | `/api/org/members/:userId` | admin | Remove member |

### 6.6 Activity Log

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/activity` | admin | List activity log (paginated) |
| `GET` | `/api/activity?accountId=:id` | admin | Filter by account |

### 6.7 Real-time Notifications (SSE)

```
GET /api/realtime/stream
```

Event types:
```json
{ "event": "new_email",       "data": { "accountId": "...", "emailId": "...", "subject": "...", "from": "..." } }
{ "event": "account_synced",  "data": { "accountId": "...", "lastSyncedAt": "..." } }
{ "event": "account_error",   "data": { "accountId": "...", "error": "Auth failed" } }
{ "event": "unread_count",    "data": { "accountId": "...", "count": 12 } }
{ "event": "sync_progress",   "data": { "accountId": "...", "folder": "INBOX", "progress": 75 } }
```

---

## 7. Frontend Architecture

### 7.1 App Router Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← Main app shell (sidebar + topbar)
│   │   ├── page.tsx                ← Redirect to unified inbox
│   │   ├── inbox/page.tsx          ← Unified inbox (all accounts)
│   │   ├── accounts/
│   │   │   ├── [accountId]/
│   │   │   │   ├── inbox/page.tsx
│   │   │   │   ├── sent/page.tsx
│   │   │   │   ├── drafts/page.tsx
│   │   │   │   └── trash/page.tsx
│   │   ├── labels/
│   │   │   ├── page.tsx            ← Label manager
│   │   │   └── [labelId]/page.tsx  ← View by label
│   │   ├── settings/
│   │   │   ├── page.tsx            ← Org settings (admin)
│   │   │   └── members/page.tsx    ← Member management (admin)
│   │   └── activity/page.tsx       ← Activity log (admin)
│   └── api/
│       ├── accounts/
│       ├── emails/
│       ├── labels/
│       ├── org/
│       ├── activity/
│       └── realtime/stream/
├── components/
│   ├── sidebar/
│   │   ├── AccountList.tsx
│   │   ├── AccountItem.tsx
│   │   ├── LabelSection.tsx
│   │   └── AddAccountModal.tsx
│   ├── email/
│   │   ├── EmailList.tsx
│   │   ├── EmailRow.tsx
│   │   ├── EmailViewer.tsx
│   │   ├── ThreadView.tsx          ← Cross-account conversation view
│   │   ├── ComposeModal.tsx
│   │   └── AttachmentList.tsx
│   ├── labels/
│   │   ├── LabelManager.tsx
│   │   ├── LabelPicker.tsx
│   │   └── LabelBadge.tsx
│   ├── admin/
│   │   ├── MemberList.tsx
│   │   ├── ActivityLog.tsx
│   │   └── OrgSettings.tsx
│   └── ui/
├── stores/
│   ├── accountStore.ts
│   ├── notificationStore.ts
│   └── composeStore.ts
├── hooks/
│   ├── useSSE.ts
│   ├── useEmails.ts
│   ├── useAccounts.ts
│   └── useSearch.ts               ← Meilisearch integration
└── lib/
    ├── imap/
    │   ├── connection-manager.ts
    │   ├── partition.ts            ← Account-to-worker assignment
    │   └── oauth.ts
    ├── smtp/
    │   └── sender.ts
    ├── search/
    │   └── meilisearch.ts
    ├── storage/
    │   ├── interface.ts            ← StorageService interface
    │   └── local.ts                ← LocalStorageService (v1)
    ├── db/
    │   └── prisma.ts
    └── crypto.ts
```

### 7.2 Account-Separation UI Design

Each account is assigned a unique color and abbreviation:

- **Sidebar**: colored left-border, account color dot, email address, unread badge
- **Email list header**: colored banner showing current account name and email
- **Compose window**: FROM field with colored badge, locked to current account
- **Send confirmation**: modal showing "Sending as: [badge] sales@company.com — by [user name]"
- **Account switcher**: `Cmd/Ctrl + K` fuzzy search

### 7.3 Thread View

- Conversation view showing all emails in a thread, ordered chronologically
- Emails from different accounts in the same thread are visually distinguished
  by their account color badge
- Collapsed by default; click to expand individual messages
- Reply/Forward actions available inline within the thread view

---

## 8. Security Considerations

### 8.1 Credential Storage
- IMAP/SMTP passwords encrypted with AES-256-GCM
- OAuth tokens encrypted with same mechanism
- Encryption key from env var (production: AWS KMS / Vault)

### 8.2 API Security
- JWT middleware on all routes; JWT includes org context
- Rate limiting: 100 req/min on email endpoints; 10/min on account create
- Input validation via `zod` schemas
- CSRF protection via `SameSite=Strict` cookies

### 8.3 Email Content Security
- HTML emails rendered in sandboxed `<iframe>` with restricted sandbox attribute
- External images blocked by default
- Attachment downloads via signed URLs (1-hour expiry)

### 8.4 Team Security
- All API operations scoped to the user's organization
- Admin-only endpoints enforced at middleware level
- Activity log provides accountability for team actions

---

## 9. Background Job Architecture (BullMQ)

| Queue | Job Type | Concurrency | Description |
|-------|----------|-------------|-------------|
| `imap-sync` | `sync-folder` | 5 | Sync SENT/DRAFTS/TRASH folders |
| `imap-sync` | `initial-sync` | 3 | Full sync on account first add |
| `email-send` | `send-email` | 10 | Async SMTP send with retry |
| `oauth-refresh` | `refresh-token` | 20 | Proactive token renewal |
| `account-health` | `ping-account` | 10 | IMAP connection health check |
| `search-index` | `index-email` | 15 | Index email in Meilisearch |
| `search-index` | `reindex-account` | 2 | Full reindex of an account |
| `worker-health` | `check-heartbeat` | 1 | Detect failed workers, reassign accounts |

**Initial sync strategy:**
1. Open IMAP connection, enter IDLE on INBOX
2. Enqueue sync: INBOX (last 500), SENT (last 200), DRAFTS (all)
3. Fetch headers first (fast); bodies fetched lazily on view
4. Index emails in Meilisearch as they're synced
5. Progress streamed via SSE `sync_progress` events

---

## 10. Deployment Architecture

```
Internet
    │
    ▼
[Cloudflare / CDN]
    │
    ▼
[Nginx Reverse Proxy]  (TLS termination, HTTP/2)
    │          │
    ▼          ▼
[Next.js App]   [IMAP Worker Pool (2-3 instances)]
(HTTP API +      Worker 1: accounts[0..33]
 SSE + UI)       Worker 2: accounts[34..66]
    │            Worker 3: accounts[67..99]
    └────────┬───────────┘
             │
    ┌────────┼────────────┬──────────────┐
    ▼        ▼            ▼              ▼
[PostgreSQL] [Redis]   [Meilisearch]  [Local FS]
                                      (attachments)
```

**Docker Compose services:**
- `app` — Next.js frontend + API
- `worker-1`, `worker-2`, `worker-3` — IMAP connection workers
- `postgres` — PostgreSQL 16
- `redis` — Redis 7
- `meilisearch` — Meilisearch latest
- `nginx` — Reverse proxy

---

## 11. Development Phases (Revised)

### Phase 1 — Core Infrastructure (Weeks 1-3)
- Database schema + Prisma setup (with org model)
- User auth (JWT + registration/login)
- Organization CRUD (create org, invite members)
- Account CRUD API with encryption
- Basic IMAP connection manager (single account, IDLE)
- Basic SMTP sender

### Phase 2 — Multi-Account Engine + Search (Weeks 4-6)
- Scale IMAP manager to multi-worker with partitioning
- OAuth2 integration (Gmail + Outlook)
- Full sync jobs (all folders)
- Meilisearch integration (indexing + search API)
- SSE real-time notification stream

### Phase 3 — Frontend Core (Weeks 7-9)
- Next.js App Router shell with sidebar
- Account-separated email list + viewer
- Cross-account thread view
- Compose modal with from-account lock
- React Query integration with SSE invalidation
- Search UI with Meilisearch

### Phase 4 — Labels, Teams & Organization (Week 10-11)
- Label management API + UI
- Account labeling + label-grouped sidebar
- Email tagging + cross-account label views
- Admin panel: member management, org settings
- Activity log

### Phase 5 — Polish & Production (Weeks 12-13)
- Keyboard shortcuts (account switcher, navigation)
- Mobile responsive layout
- Docker Compose production setup
- Performance testing at 100+ accounts
- Worker health monitoring dashboard

---

## 12. Third-Party Library Summary

| Library | Version | Purpose |
|---------|---------|---------|
| `imapflow` | ^1.0 | IMAP client with IDLE support |
| `nodemailer` | ^6.9 | SMTP email sending |
| `mailparser` | ^3.6 | Parse raw MIME email messages |
| `bullmq` | ^5.0 | Job queue for background workers |
| `ioredis` | ^5.3 | Redis client (Pub/Sub + BullMQ) |
| `@prisma/client` | ^5.0 | PostgreSQL ORM |
| `meilisearch` | ^0.40 | Meilisearch JS client |
| `zod` | ^3.22 | Request validation schemas |
| `jose` | ^5.0 | JWT creation and verification |
| `@tiptap/react` | ^2.0 | Rich text editor for compose |
| `zustand` | ^4.5 | Frontend local state |
| `@tanstack/react-query` | ^5.0 | Server state + caching |
| `@tanstack/react-virtual` | ^3.0 | Virtualized email list |
