# MailHub

A multi-tenant email management platform built with Next.js 16. Connect IMAP/SMTP or Gmail OAuth accounts, sync emails via background workers, and manage everything from a unified dashboard with full-text search, labels, activity logs, and push notifications.

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL 16 + Prisma ORM 7 |
| **Search** | Meilisearch |
| **Queue / Cache** | Redis 7 + BullMQ |
| **Auth** | JWT (jose) + bcrypt |
| **Email Protocols** | IMAP (imapflow) · SMTP (nodemailer) · Gmail OAuth 2.0 |
| **UI** | React 19, Tailwind CSS 4, Lucide Icons, TipTap editor |
| **State** | Zustand + TanStack React Query |
| **Notifications** | Web Push (web-push + VAPID) |
| **Testing** | Jest + ts-jest |
| **Containerization** | Docker multi-stage build + Docker Compose |

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Next.js App │────▶│  PostgreSQL  │◀────│   Workers    │
│  (Frontend + │     │  (Prisma)    │     │  (BullMQ)    │
│   API Routes)│     └──────────────┘     └──────┬───────┘
└──────┬───────┘                                 │
       │             ┌──────────────┐            │
       ├────────────▶│  Meilisearch │◀───────────┤
       │             │  (Search)    │            │
       │             └──────────────┘            │
       │             ┌──────────────┐            │
       └────────────▶│    Redis     │◀───────────┘
                     │  (Queue/SSE) │
                     └──────────────┘
```

- **Next.js App** — serves the dashboard UI and exposes REST API routes.
- **Workers** — background processes that sync email via IMAP/Gmail, managed by BullMQ. Horizontally scalable with partition keys (`WORKER_PARTITION`).
- **Redis** — backs the BullMQ job queue and server-sent events for realtime updates.
- **Meilisearch** — powers instant full-text search across all synced emails.
- **PostgreSQL** — primary data store for users, organizations, email accounts, emails, labels, and activity logs.

## Data Model

Core entities managed via Prisma:

- **User** — authentication identity (email + password hash)
- **Organization** — multi-tenant workspace (slug-based)
- **OrganizationMember** — user ↔ org membership with roles
- **EmailAccount** — connected mailbox (IMAP/SMTP creds or OAuth tokens, encrypted at rest)
- **Email / EmailBody / Attachment** — synced messages, bodies, and file metadata
- **Label / AccountLabel / EmailLabel** — user-defined labels applied at account or email level
- **EmailActivityLog** — audit trail of actions (read, send, label, etc.)
- **PushSubscription** — Web Push endpoints per org
- **MemberEmailAccountAccess** — granular per-user access control to specific email accounts

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

For Gmail OAuth accounts, also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

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
# Development server (with experimental HTTPS)
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
| GET | `/api/accounts` | List connected email accounts |
| POST | `/api/accounts` | Add an email account (IMAP/SMTP or OAuth) |
| GET | `/api/emails/search` | Full-text search across emails (Meilisearch) |
| GET | `/api/emails/thread` | Fetch email thread by thread ID |
| GET | `/api/labels` | List organization labels |
| POST | `/api/labels` | Create a label |
| GET | `/api/activity` | Fetch activity log |
| GET | `/api/dashboard` | Dashboard summary stats |
| GET | `/api/realtime` | SSE stream for live updates |
| POST | `/api/notifications` | Register push subscription |
| GET | `/api/org` | Organization details |

## Dashboard Pages

| Route | Page |
|---|---|
| `/login` | Sign in |
| `/register` | Sign up |
| `/inbox` | Email inbox with search and thread view |
| `/overview` | Dashboard overview / stats |
| `/labels` | Label management |
| `/settings` | Account and organization settings |
| `/activity` | Activity audit log |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (HTTPS) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Jest in watch mode |
| `npm run worker` | Start background email sync worker |
| `npm run services:up` | Docker Compose up (Postgres, Redis, Meili) |
| `npm run services:down` | Docker Compose down |
| `npm run db:seed` | Seed database with test data |

## Docker

Build and run the full stack:

```bash
docker compose up --build
```

The Dockerfile uses a multi-stage build (deps → build → runner) producing a lean production image. Workers run as separate containers using the same image with `npm run worker` as the entrypoint.

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login & register pages
│   ├── (dashboard)/     # Authenticated dashboard pages
│   │   ├── inbox/       # Email inbox
│   │   ├── overview/    # Dashboard stats
│   │   ├── labels/      # Label management
│   │   ├── settings/    # Settings
│   │   └── activity/    # Activity log
│   └── api/             # REST API routes
│       ├── auth/        # Auth endpoints
│       ├── accounts/    # Email account CRUD
│       ├── emails/      # Email search & threads
│       ├── labels/      # Label CRUD
│       ├── activity/    # Activity log
│       ├── dashboard/   # Stats
│       ├── notifications/ # Push subscriptions
│       ├── realtime/    # SSE endpoint
│       └── org/         # Organization
├── components/
│   ├── email/           # Email list, thread, compose
│   ├── labels/          # Label components
│   ├── providers/       # OAuth provider UI
│   ├── search/          # Search bar
│   ├── settings/        # Settings panels
│   └── sidebar/         # Navigation sidebar
├── hooks/               # Custom React hooks
├── lib/
│   ├── accounts/        # Account management logic
│   ├── auth/            # JWT + session utilities
│   ├── db/              # Prisma client
│   ├── gmail/           # Gmail OAuth integration
│   ├── imap/            # IMAP sync logic
│   ├── queue/           # BullMQ job definitions
│   ├── search/          # Meilisearch client
│   ├── smtp/            # SMTP send logic
│   ├── crypto.ts        # AES encryption for credentials
│   ├── redis.ts         # Redis client singleton
│   └── validation/      # Zod schemas
├── stores/              # Zustand state stores
└── worker.ts            # BullMQ worker entry point
prisma/
├── schema.prisma        # Database schema
└── migrations/          # Migration history
```

## License

Private — all rights reserved.
