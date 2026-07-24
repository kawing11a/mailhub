# MailHub

A multi-tenant email management platform built with Next.js 16. Connect IMAP/SMTP, Gmail OAuth, or Outlook OAuth accounts, sync emails via background workers, and manage everything from a unified dashboard with full-text search, drag-and-drop labels, activity logs, spam risk detection, granular member access control, Progressive Web App (PWA) support, and Web Push notifications.

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **PWA / Client** | Service Worker, Web App Manifest, `usePWAInstall` hook, `@dnd-kit` (Drag & Drop) |
| **Database** | PostgreSQL 16 + Prisma ORM 7 (`@prisma/adapter-pg`) |
| **Search** | Meilisearch |
| **Queue / Cache** | Redis 7 + BullMQ |
| **Auth** | JWT (`jose`) + `bcryptjs` |
| **Email Protocols** | IMAP (`imapflow`) · SMTP (`nodemailer`) · Gmail OAuth 2.0 · Outlook OAuth 2.0 |
| **UI** | React 19, Tailwind CSS 4, Lucide Icons, TipTap editor, Local `geist` fonts |
| **State** | Zustand + TanStack React Query |
| **Notifications** | Web Push (`web-push` + VAPID) |
| **Testing** | Jest + `ts-jest` |
| **Containerization** | Docker multi-stage build + Docker Compose |

## Key Features

- 📧 **Multi-Account & Multi-Tenant**: Connect multiple IMAP/SMTP, Gmail, or Outlook mailboxes across isolated organization workspaces.
- 👥 **Granular Access Control**: Organization administrators can manage and grant per-member access permissions to specific email accounts.
- ⚡ **Realtime Email Sync**: High-throughput background sync powered by BullMQ workers with automatic SPAM detection and Meilisearch indexation.
- 🔍 **Instant Full-Text Search**: Search headers, body content, and senders seamlessly across all connected accounts.
- 🏷️ **Drag & Drop Label Management**: Organize emails using customizable organization labels and interactive drag-and-drop actions.
- 📱 **Progressive Web App (PWA)**: Installable desktop/mobile experience with offline Service Worker caching, automated background update polling, system installation detection, and dynamic UI install buttons.
- 🔔 **Real-Time SSE & Push Notifications**: Instant inbox updates via Server-Sent Events (SSE) and native Web Push notifications.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Next.js App  │────▶│  PostgreSQL  │◀────│   Workers    │
│ (PWA + API)  │     │  (Prisma)    │     │  (BullMQ)    │
└──────┬───────┘     └──────────────┘     └──────┬───────┘
       │                                         │
       │             ┌──────────────┐            │
       ├────────────▶│  Meilisearch │◀───────────┤
       │             │  (Search)    │            │
       │             └──────────────┘            │
       │             ┌──────────────┐            │
       └────────────▶│    Redis     │◀───────────┘
                     │  (Queue/SSE) │
                     └──────────────┘
```

- **Next.js App** — serves the dashboard UI, handles PWA service worker lifecycle, and exposes REST API routes.
- **Workers** — background processes that sync email via IMAP/Gmail/Outlook, managed by BullMQ. Horizontally scalable with partition keys (`WORKER_PARTITION`).
- **Redis** — backs the BullMQ job queue and server-sent events for realtime updates.
- **Meilisearch** — powers instant full-text search across all synced emails.
- **PostgreSQL** — primary data store for users, organizations, email accounts, permissions, emails, labels, favorites, and activity logs.

## Data Model

Core entities managed via Prisma:

- **User** — authentication identity (email + password hash)
- **Organization** — multi-tenant workspace (slug-based)
- **OrganizationMember** — user ↔ org membership with role permissions
- **EmailAccount** — connected mailbox (IMAP/SMTP creds or OAuth tokens, encrypted at rest)
- **MemberEmailAccountAccess** — granular per-member access permissions for specific email accounts
- **Email / EmailBody / Attachment** — synced messages, bodies, and file metadata
- **Label / AccountLabel / EmailLabel** — workspace and account-level labels applied to messages
- **EmailActivityLog** — detailed audit log of email operations
- **PushSubscription** — Web Push endpoints per organization user
- **FavoriteEmail** — starred/favorited emails tracking per user account

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Docker** & **Docker Compose** (for PostgreSQL, Redis, Meilisearch)

### 1. Clone & Install

```bash
git clone https://github.com/kawing11a/email-manager.git
cd email-manager
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values. Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `MEILI_HOST` | Meilisearch URL |
| `MEILI_MASTER_KEY` | Meilisearch admin key |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `ENCRYPTION_KEY` | 64-char hex key for encrypting stored credentials |

For OAuth accounts, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET`.

### 3. Start Services

```bash
# Start PostgreSQL, Redis, and Meilisearch
npm run services:up
```

### 4. Database Setup

```bash
npx prisma generate
npx prisma migrate deploy
```

To seed test data:

```bash
npm run db:seed
```

### 5. Run the App

```bash
# Development server (with experimental HTTPS for PWA & OAuth)
npm run dev
```

Open [https://localhost:3000](https://localhost:3000).

### 6. Run a Worker (optional)

Workers sync email accounts in the background:

```bash
npm run worker
```

## API Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user + organization |
| POST | `/api/auth/login` | Authenticate and receive JWT |
| POST | `/api/auth/logout` | Clear authentication session |
| GET | `/api/auth/me` | Fetch active user profile |
| GET | `/api/accounts` | List connected email accounts |
| POST | `/api/accounts` | Add an email account (IMAP/SMTP or OAuth) |
| DELETE | `/api/accounts/[id]` | Remove connected email account |
| POST | `/api/accounts/[id]/read-all` | Mark all emails in account as read |
| POST | `/api/accounts/[id]/reindex` | Trigger Meilisearch reindexing for account |
| GET | `/api/accounts/[id]/stats` | Fetch synchronization and message stats |
| GET | `/api/emails/search` | Full-text search across emails (Meilisearch) |
| GET | `/api/emails/thread` | Fetch email thread by thread ID |
| GET | `/api/labels` | List organization labels |
| POST | `/api/labels` | Create a label |
| GET | `/api/favourites` | Manage user favorite emails |
| GET | `/api/org` | Organization details |
| GET | `/api/org/members` | Organization members list |
| GET/POST | `/api/org/members/[userId]/accounts` | Manage member access control for accounts |
| GET | `/api/activity` | Fetch activity audit log |
| GET | `/api/dashboard` | Dashboard summary stats |
| GET | `/api/realtime` | SSE stream for live updates |
| GET | `/api/version` | Service Worker app version check |
| POST | `/api/notifications` | Register Web Push subscription |

## Dashboard Pages

| Route | Page |
|---|---|
| `/login` | Sign in page |
| `/register` | Sign up page |
| `/inbox` | Unified email inbox with search, context menus & thread viewer |
| `/new-emails` | Real-time incoming email feed |
| `/overview` | Analytics dashboard & overview statistics |
| `/labels` | Label & category management |
| `/settings` | Account, team access, and organization settings |
| `/activity` | System audit and activity logs |
| `/testing` | Integration test sandbox |

## Progressive Web App (PWA) Features

- **System Installation Check**: Utilizes `navigator.getInstalledRelatedApps()` and display mode media queries (`standalone`, `window-controls-overlay`) to detect if MailHub is installed on the user's OS.
- **Smart Install UI**: Displays an **Install MailHub App** button in the sidebar for browser tabs; automatically hides when accessed inside the installed PWA app or system.
- **Icon Generation**: Generated app icon suite available via `node scripts/generate-pwa-icons.js`.

## Docker

Build and run the full stack:

```bash
docker compose up --build
```

The Dockerfile uses a multi-stage build (`deps` → `build` → `runner`) producing a lean production image. Workers run as separate containers using the same image with `npm run worker` as the entrypoint.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & register pages
│   ├── (dashboard)/     # Authenticated dashboard pages
│   │   ├── activity/    # Activity log
│   │   ├── inbox/       # Email inbox & thread viewer
│   │   ├── labels/      # Label management
│   │   ├── new-emails/  # Live incoming email feed
│   │   ├── overview/    # Dashboard stats
│   │   ├── settings/    # Settings & team account access control
│   │   └── testing/     # Testing sandbox
│   ├── api/             # REST API routes
│   │   ├── accounts/    # Email account CRUD & member access
│   │   ├── activity/    # Activity audit log
│   │   ├── auth/        # Auth endpoints (login, logout, me, password)
│   │   ├── dashboard/   # Summary statistics
│   │   ├── emails/      # Email search, threads, and actions
│   │   ├── favourites/  # Favorites management
│   │   ├── labels/      # Label management
│   │   ├── notifications/# Push subscriptions
│   │   ├── org/         # Organization & team member management
│   │   ├── realtime/    # Server-Sent Events stream
│   │   └── version/     # PWA / App version check
│   ├── layout.tsx       # Root layout with local Geist font loading
│   └── manifest.ts      # Web App Manifest for PWA
├── components/
│   ├── email/           # Email list, thread viewer, compose modal, context menu
│   ├── labels/          # Label assignment picker & list components
│   ├── providers/       # OAuth provider integration components
│   ├── pwa/             # PWA Install button & instruction modal
│   ├── search/          # Meilisearch query bar
│   ├── settings/        # Settings, account access modal, accounts list
│   └── sidebar/         # Dynamic navigation sidebar with PWA install integration
├── hooks/               # Custom React hooks (usePWAInstall, PWA updates, SSE, queries)
├── lib/
│   ├── accounts/        # Account management logic
│   ├── auth/            # JWT + session utilities
│   ├── db/              # Prisma client
│   ├── gmail/           # Gmail OAuth integration
│   ├── imap/            # IMAP connection manager & sync logic
│   ├── queue/           # BullMQ job definitions
│   ├── search/          # Meilisearch client
│   ├── smtp/            # SMTP sending client
│   ├── crypto.ts        # AES credential encryption
│   ├── redis.ts         # Redis client singleton
│   └── validation/      # Zod validation schemas
├── stores/              # Zustand state stores (UI, sync, accounts)
└── worker.ts            # BullMQ worker entry point
scripts/                 # Database seed & PWA icon generation scripts
prisma/
├── schema.prisma        # Database schema
└── migrations/          # Migration history
```

## License

Private — all rights reserved.
