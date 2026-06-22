# MailHub Phase 1: Core Infrastructure — Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build the foundational infrastructure for MailHub — project scaffolding, database schema with org model, JWT authentication, organization/account CRUD with credential encryption, a basic single-account IMAP connection manager with IDLE, and SMTP sending.

**Architecture:** Next.js 14+ App Router with co-located API Route Handlers. PostgreSQL via Prisma ORM for data persistence. Redis for session cache and BullMQ job queues. Credential encryption via AES-256-GCM. IMAP connections via `imapflow` with IDLE support. SMTP sending via `nodemailer`.

**Tech Stack:** Next.js 14+, TypeScript, Prisma, PostgreSQL 16, Redis, BullMQ, imapflow, nodemailer, zod, jose, ioredis, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-06-21-mailhub-design.md`

---

## Task 1: Project Scaffolding + Docker Compose

**Files:**
- Create: `package.json` (via `npx create-next-app`)
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env.local`
- Create: `.gitignore`
- Create: `tsconfig.json` (auto-generated)

**Step 1: Scaffold Next.js project**

Run:
```bash
npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Expected: Next.js project scaffolded in current directory with App Router, TypeScript, Tailwind CSS, ESLint, and `src/` directory.

**Step 2: Create Docker Compose for local dev services**

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: mailhub-postgres
    environment:
      POSTGRES_USER: mailhub
      POSTGRES_PASSWORD: mailhub_dev
      POSTGRES_DB: mailhub
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mailhub']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: mailhub-redis
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  meilisearch:
    image: getmeili/meilisearch:latest
    container_name: mailhub-meilisearch
    environment:
      MEILI_MASTER_KEY: 'mailhub_meili_dev_key'
      MEILI_ENV: development
    ports:
      - '7700:7700'
    volumes:
      - meilisearch_data:/meili_data

volumes:
  postgres_data:
  redis_data:
  meilisearch_data:
```

**Step 3: Create environment files**

Create `.env.example`:
```env
# Database
DATABASE_URL=postgresql://mailhub:mailhub_dev@localhost:5432/mailhub

# Redis
REDIS_URL=redis://localhost:6379

# Meilisearch
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=mailhub_meili_dev_key

# Encryption (32 bytes = 64 hex chars)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# JWT
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_EXPIRES_IN=7d

# OAuth2 - Google (fill in for Gmail support)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback

# OAuth2 - Microsoft (fill in for Outlook support)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/oauth/microsoft/callback

# App
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-nextauth-secret

# Attachment Storage
ATTACHMENT_STORAGE_PATH=./storage/attachments
```

Copy `.env.example` to `.env.local` with the same dev values.

**Step 4: Install core dependencies**

Run:
```bash
npm install prisma @prisma/client ioredis bullmq imapflow nodemailer mailparser zod jose zustand @tanstack/react-query @tanstack/react-virtual meilisearch bcryptjs
```

Run:
```bash
npm install -D @types/nodemailer @types/mailparser @types/bcryptjs
```

**Step 5: Start Docker services and verify**

Run:
```bash
docker compose up -d
```

Run:
```bash
docker compose ps
```

Expected: All 3 services (postgres, redis, meilisearch) healthy and running.

**Step 6: Verify Next.js dev server starts**

Run:
```bash
npm run dev
```

Expected: Next.js dev server running on `http://localhost:3000`. Stop with Ctrl+C.

**Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js project with Docker Compose (postgres, redis, meilisearch)"
```

---

## Task 2: Prisma Schema + Database Migrations

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db/prisma.ts`

**Step 1: Initialize Prisma**

Run:
```bash
npx prisma init --datasource-provider postgresql
```

Expected: Creates `prisma/schema.prisma` and updates `.env` with `DATABASE_URL`.

**Step 2: Write the full Prisma schema**

Replace `prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             String    @id @default(uuid()) @db.Uuid
  email          String    @unique @db.VarChar(255)
  name           String    @db.VarChar(255)
  passwordHash   String    @map("password_hash")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  memberships    OrganizationMember[]
  activityLogs   EmailActivityLog[]

  @@map("users")
}

model Organization {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(255)
  slug      String   @unique @db.VarChar(100)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  members       OrganizationMember[]
  emailAccounts EmailAccount[]
  labels        Label[]
  activityLogs  EmailActivityLog[]

  @@map("organizations")
}

model OrganizationMember {
  organizationId String       @map("organization_id") @db.Uuid
  userId         String       @map("user_id") @db.Uuid
  role           String       @default("member") @db.VarChar(20)
  joinedAt       DateTime     @default(now()) @map("joined_at") @db.Timestamptz

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([organizationId, userId])
  @@map("organization_members")
}

model EmailAccount {
  id              String    @id @default(uuid()) @db.Uuid
  organizationId  String    @map("organization_id") @db.Uuid
  label           String    @db.VarChar(100)
  emailAddress    String    @map("email_address") @db.VarChar(255)
  provider        String    @db.VarChar(50)
  color           String?   @db.VarChar(7)
  avatarInitials  String?   @map("avatar_initials") @db.VarChar(3)
  isActive        Boolean   @default(true) @map("is_active")
  lastSyncedAt    DateTime? @map("last_synced_at") @db.Timestamptz
  workerPartition String?   @map("worker_partition") @db.VarChar(50)

  // IMAP/SMTP credentials (encrypted)
  imapHost           String?  @map("imap_host") @db.VarChar(255)
  imapPort           Int?     @map("imap_port")
  imapSecure         Boolean? @default(true) @map("imap_secure")
  smtpHost           String?  @map("smtp_host") @db.VarChar(255)
  smtpPort           Int?     @map("smtp_port")
  smtpSecure         Boolean? @default(true) @map("smtp_secure")
  username           String?  @db.VarChar(255)
  passwordEncrypted  String?  @map("password_encrypted")

  // OAuth credentials (encrypted)
  oauthProvider     String?   @map("oauth_provider") @db.VarChar(50)
  oauthAccessToken  String?   @map("oauth_access_token")
  oauthRefreshToken String?   @map("oauth_refresh_token")
  oauthTokenExpiry  DateTime? @map("oauth_token_expiry") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  emails         Email[]
  accountLabels  AccountLabel[]
  activityLogs   EmailActivityLog[]

  @@unique([organizationId, emailAddress])
  @@map("email_accounts")
}

model Email {
  id               String    @id @default(uuid()) @db.Uuid
  accountId        String    @map("account_id") @db.Uuid
  messageId        String    @map("message_id") @db.VarChar(512)
  uid              BigInt?
  threadId         String?   @map("thread_id") @db.VarChar(512)
  folder           String    @db.VarChar(100)
  subject          String?
  snippet          String?   @db.VarChar(300)
  fromAddress      String?   @map("from_address") @db.VarChar(512)
  fromName         String?   @map("from_name") @db.VarChar(255)
  toAddresses      Json?     @map("to_addresses")
  ccAddresses      Json?     @map("cc_addresses")
  bccAddresses     Json?     @map("bcc_addresses")
  replyTo          String?   @map("reply_to") @db.VarChar(512)
  inReplyTo        String?   @map("in_reply_to") @db.VarChar(512)
  referencesHeader String?   @map("references_header")
  isRead           Boolean   @default(false) @map("is_read")
  isStarred        Boolean   @default(false) @map("is_starred")
  isDraft          Boolean   @default(false) @map("is_draft")
  hasAttachments   Boolean   @default(false) @map("has_attachments")
  sizeBytes        Int?      @map("size_bytes")
  receivedAt       DateTime? @map("received_at") @db.Timestamptz
  sentAt           DateTime? @map("sent_at") @db.Timestamptz
  rawHeaders       Json?     @map("raw_headers")
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz

  account      EmailAccount   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  body         EmailBody?
  attachments  Attachment[]
  emailLabels  EmailLabel[]
  activityLogs EmailActivityLog[]

  @@unique([accountId, messageId])
  @@index([accountId, folder, receivedAt(sort: Desc)])
  @@index([receivedAt(sort: Desc)])
  @@index([threadId])
  @@index([messageId])
  @@map("emails")
}

model EmailBody {
  emailId  String @id @map("email_id") @db.Uuid
  bodyHtml String? @map("body_html")
  bodyText String? @map("body_text")

  email Email @relation(fields: [emailId], references: [id], onDelete: Cascade)

  @@map("email_bodies")
}

model Attachment {
  id          String   @id @default(uuid()) @db.Uuid
  emailId     String   @map("email_id") @db.Uuid
  filename    String?  @db.VarChar(512)
  contentType String?  @map("content_type") @db.VarChar(255)
  sizeBytes   Int?     @map("size_bytes")
  storagePath String?  @map("storage_path")
  cid         String?  @db.VarChar(255)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  email Email @relation(fields: [emailId], references: [id], onDelete: Cascade)

  @@map("attachments")
}

model Label {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  name            String   @db.VarChar(100)
  color           String   @default("#3B82F6") @db.VarChar(7)
  description     String?
  icon            String?  @db.VarChar(50)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  accountLabels AccountLabel[]
  emailLabels   EmailLabel[]

  @@unique([organizationId, name])
  @@map("labels")
}

model AccountLabel {
  accountId String @map("account_id") @db.Uuid
  labelId   String @map("label_id") @db.Uuid

  account EmailAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  label   Label        @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([accountId, labelId])
  @@map("account_labels")
}

model EmailLabel {
  emailId String @map("email_id") @db.Uuid
  labelId String @map("label_id") @db.Uuid

  email Email @relation(fields: [emailId], references: [id], onDelete: Cascade)
  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([emailId, labelId])
  @@map("email_labels")
}

model EmailActivityLog {
  id              String   @id @default(uuid()) @db.Uuid
  organizationId  String   @map("organization_id") @db.Uuid
  userId          String   @map("user_id") @db.Uuid
  accountId       String?  @map("account_id") @db.Uuid
  emailId         String?  @map("email_id") @db.Uuid
  action          String   @db.VarChar(50)
  metadata        Json?
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization Organization  @relation(fields: [organizationId], references: [id])
  user         User          @relation(fields: [userId], references: [id])
  account      EmailAccount? @relation(fields: [accountId], references: [id])
  email        Email?        @relation(fields: [emailId], references: [id])

  @@index([organizationId, createdAt(sort: Desc)])
  @@index([accountId, createdAt(sort: Desc)])
  @@map("email_activity_log")
}
```

**Step 3: Create Prisma client singleton**

Create `src/lib/db/prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Step 4: Run migration**

Run:
```bash
npx prisma migrate dev --name init
```

Expected: Migration created and applied. Tables created in PostgreSQL.

**Step 5: Verify schema with Prisma Studio**

Run:
```bash
npx prisma studio
```

Expected: Prisma Studio opens in browser showing all tables. Close with Ctrl+C.

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add Prisma schema with full database model (org, accounts, emails, labels, audit)"
```

---

## Task 3: Shared Utilities — Crypto, Validation Schemas, Redis Client

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/lib/redis.ts`
- Create: `src/lib/validation/schemas.ts`
- Create: `src/lib/validation/index.ts`
- Test: `src/__tests__/lib/crypto.test.ts`

**Step 1: Write failing tests for crypto module**

Create `src/__tests__/lib/crypto.test.ts`:
```typescript
import { encrypt, decrypt } from '@/lib/crypto';

describe('crypto', () => {
  const originalEnv = process.env;

  beforeAll(() => {
    // 64-char hex string = 32 bytes for AES-256
    process.env.ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('encrypts and decrypts a string correctly', () => {
    const plaintext = 'my-secret-password';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same-input';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it('encrypted format is iv:authTag:ciphertext (hex)', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    const tampered = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
```

**Step 2: Install test dependencies and configure Jest**

Run:
```bash
npm install -D jest ts-jest @types/jest @jest/globals
```

Create `jest.config.ts`:
```typescript
import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: pathsToModuleNameMapper(
    { '@/*': ['./src/*'] },
    { prefix: '<rootDir>/' }
  ),
  testMatch: ['**/__tests__/**/*.test.ts'],
};

export default config;
```

Add to `package.json` scripts:
```json
"test": "jest",
"test:watch": "jest --watch"
```

**Step 3: Run test to verify it fails**

Run:
```bash
npm test -- --testPathPattern=crypto
```

Expected: FAIL — `Cannot find module '@/lib/crypto'`

**Step 4: Implement crypto module**

Create `src/lib/crypto.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid ciphertext format. Expected iv:authTag:ciphertext');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
```

**Step 5: Run test to verify it passes**

Run:
```bash
npm test -- --testPathPattern=crypto
```

Expected: PASS — all 4 tests pass.

**Step 6: Create Redis client singleton**

Create `src/lib/redis.ts`:
```typescript
import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
```

**Step 7: Create Zod validation schemas**

Create `src/lib/validation/schemas.ts`:
```typescript
import { z } from 'zod';

// --- Auth schemas ---

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().min(1, 'Organization name is required').max(255),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// --- Organization schemas ---

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

// --- Email Account schemas ---

export const createAccountSchema = z.object({
  label: z.string().min(1).max(100),
  emailAddress: z.string().email(),
  provider: z.enum(['imap', 'gmail', 'outlook']),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color')
    .optional(),
  avatarInitials: z.string().max(3).optional(),

  // IMAP/SMTP fields (required if provider is 'imap')
  imapHost: z.string().optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
}).refine(
  (data) => {
    if (data.provider === 'imap') {
      return !!(data.imapHost && data.imapPort && data.smtpHost && data.smtpPort && data.username && data.password);
    }
    return true;
  },
  { message: 'IMAP/SMTP fields are required for imap provider' }
);

export const updateAccountSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  avatarInitials: z.string().max(3).optional(),
  isActive: z.boolean().optional(),
});

// --- Email operation schemas ---

export const sendEmailSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
});

export const updateEmailSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
});

// --- Label schemas ---

export const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#3B82F6'),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

// --- Query schemas ---

export const emailListQuerySchema = z.object({
  folder: z.enum(['INBOX', 'SENT', 'DRAFTS', 'TRASH']).default('INBOX'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
  unreadOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  labelId: z.string().uuid().optional(),
});

// --- Type exports ---

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type EmailListQuery = z.infer<typeof emailListQuerySchema>;
```

Create `src/lib/validation/index.ts`:
```typescript
export * from './schemas';
```

**Step 8: Commit**

```bash
git add .
git commit -m "feat: add crypto module (AES-256-GCM), Redis client, and Zod validation schemas"
```

---

## Task 4: JWT Authentication — Middleware + Auth API Routes

**Files:**
- Create: `src/lib/auth/jwt.ts`
- Create: `src/lib/auth/middleware.ts`
- Create: `src/lib/auth/types.ts`
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Test: `src/__tests__/lib/auth/jwt.test.ts`
- Test: `src/__tests__/api/auth.test.ts`

**Step 1: Write failing test for JWT module**

Create `src/__tests__/lib/auth/jwt.test.ts`:
```typescript
import { createToken, verifyToken } from '@/lib/auth/jwt';

describe('jwt', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
    process.env.JWT_EXPIRES_IN = '1h';
  });

  it('creates and verifies a token', async () => {
    const payload = { userId: '123', organizationId: '456', role: 'admin' };
    const token = await createToken(payload);
    expect(typeof token).toBe('string');

    const verified = await verifyToken(token);
    expect(verified.userId).toBe('123');
    expect(verified.organizationId).toBe('456');
    expect(verified.role).toBe('admin');
  });

  it('rejects an invalid token', async () => {
    await expect(verifyToken('invalid-token')).rejects.toThrow();
  });

  it('rejects a tampered token', async () => {
    const payload = { userId: '123', organizationId: '456', role: 'member' };
    const token = await createToken(payload);
    const tampered = token.slice(0, -5) + 'xxxxx';
    await expect(verifyToken(tampered)).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- --testPathPattern=jwt
```

Expected: FAIL — `Cannot find module '@/lib/auth/jwt'`

**Step 3: Create auth types**

Create `src/lib/auth/types.ts`:
```typescript
export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: 'admin' | 'member';
}

export interface AuthenticatedUser extends JWTPayload {
  email: string;
  name: string;
}
```

**Step 4: Implement JWT module**

Create `src/lib/auth/jwt.ts`:
```typescript
import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from './types';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(secret);
}

function getExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '7d';
}

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(getExpiresIn())
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    userId: payload.userId as string,
    organizationId: payload.organizationId as string,
    role: payload.role as 'admin' | 'member',
  };
}
```

**Step 5: Run test to verify it passes**

Run:
```bash
npm test -- --testPathPattern=jwt
```

Expected: PASS — all 3 tests pass.

**Step 6: Create auth middleware**

Create `src/lib/auth/middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './jwt';
import type { JWTPayload } from './types';

export async function authenticate(
  req: NextRequest
): Promise<JWTPayload | NextResponse> {
  // Check HTTP-only cookie first, then Authorization header
  const token =
    req.cookies.get('auth-token')?.value ||
    req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    return await verifyToken(token);
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
}

export function requireAdmin(auth: JWTPayload): NextResponse | null {
  if (auth.role !== 'admin') {
    return NextResponse.json(
      { error: 'Admin access required' },
      { status: 403 }
    );
  }
  return null;
}

export function apiResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
```

**Step 7: Create auth API routes**

Create `src/app/api/auth/register/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken } from '@/lib/auth/jwt';
import { registerSchema } from '@/lib/validation';
import { apiError, apiResponse } from '@/lib/auth/middleware';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 422);
    }

    const { email, name, password, organizationName } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return apiError('Email already registered', 409);
    }

    // Create user, org, and membership in a transaction
    const passwordHash = await hash(password, 12);
    const slug = slugify(organizationName) + '-' + Date.now().toString(36);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash },
      });

      const org = await tx.organization.create({
        data: { name: organizationName, slug },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'admin',
        },
      });

      return { user, org };
    });

    const token = await createToken({
      userId: result.user.id,
      organizationId: result.org.id,
      role: 'admin',
    });

    const response = apiResponse(
      {
        user: { id: result.user.id, email, name },
        organization: { id: result.org.id, name: organizationName, slug },
      },
      201
    );

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return apiError('Internal server error', 500);
  }
}
```

Create `src/app/api/auth/login/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken } from '@/lib/auth/jwt';
import { loginSchema } from '@/lib/validation';
import { apiError, apiResponse } from '@/lib/auth/middleware';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 422);
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true },
          take: 1, // Default to first org
        },
      },
    });

    if (!user || !(await compare(password, user.passwordHash))) {
      return apiError('Invalid email or password', 401);
    }

    const membership = user.memberships[0];
    if (!membership) {
      return apiError('No organization found for this user', 403);
    }

    const token = await createToken({
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role as 'admin' | 'member',
    });

    const response = apiResponse({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
    });

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return apiError('Internal server error', 500);
  }
}
```

Create `src/app/api/auth/me/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) return apiError('User not found', 404);

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { id: true, name: true, slug: true },
    });

    return apiResponse({
      user,
      organization: org,
      role: auth.role,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return apiError('Internal server error', 500);
  }
}
```

**Step 8: Commit**

```bash
git add .
git commit -m "feat: add JWT auth (register, login, me) with middleware and auth types"
```

---

## Task 5: Organization Management API

**Files:**
- Create: `src/app/api/org/route.ts`
- Create: `src/app/api/org/members/route.ts`
- Create: `src/app/api/org/members/[userId]/route.ts`

**Step 1: Create org detail + update route**

Create `src/app/api/org/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { updateOrgSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const org = await prisma.organization.findUnique({
    where: { id: auth.organizationId },
    include: {
      _count: { select: { members: true, emailAccounts: true } },
    },
  });

  if (!org) return apiError('Organization not found', 404);

  return apiResponse({
    id: org.id,
    name: org.name,
    slug: org.slug,
    memberCount: org._count.members,
    accountCount: org._count.emailAccounts,
    createdAt: org.createdAt,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  const org = await prisma.organization.update({
    where: { id: auth.organizationId },
    data: parsed.data,
  });

  return apiResponse(org);
}
```

**Step 2: Create members list + invite route**

Create `src/app/api/org/members/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { inviteMemberSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: auth.organizationId },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return apiResponse(
    members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.joinedAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  const { email, role } = parsed.data;

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Create a placeholder user with a random password (they'll reset it)
    const tempPasswordHash = await hash(
      Math.random().toString(36).slice(2),
      12
    );
    user = await prisma.user.create({
      data: { email, name: email.split('@')[0], passwordHash: tempPasswordHash },
    });
  }

  // Check if already a member
  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: auth.organizationId,
        userId: user.id,
      },
    },
  });
  if (existing) return apiError('User is already a member', 409);

  await prisma.organizationMember.create({
    data: {
      organizationId: auth.organizationId,
      userId: user.id,
      role,
    },
  });

  return apiResponse(
    { userId: user.id, email: user.email, name: user.name, role },
    201
  );
}
```

**Step 3: Create member update/remove route**

Create `src/app/api/org/members/[userId]/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { updateMemberRoleSchema } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { userId } = await params;

  const body = await req.json();
  const parsed = updateMemberRoleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  // Prevent self-demotion
  if (userId === auth.userId && parsed.data.role !== 'admin') {
    return apiError('Cannot change your own role', 400);
  }

  try {
    await prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: auth.organizationId,
          userId,
        },
      },
      data: { role: parsed.data.role },
    });
    return apiResponse({ success: true });
  } catch {
    return apiError('Member not found', 404);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { userId } = await params;

  // Prevent self-removal
  if (userId === auth.userId) {
    return apiError('Cannot remove yourself from the organization', 400);
  }

  try {
    await prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId: auth.organizationId,
          userId,
        },
      },
    });
    return apiResponse({ success: true });
  } catch {
    return apiError('Member not found', 404);
  }
}
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add organization management API (CRUD, members, invite)"
```

---

## Task 6: Email Account CRUD API with Credential Encryption

**Files:**
- Create: `src/app/api/accounts/route.ts`
- Create: `src/app/api/accounts/[id]/route.ts`
- Create: `src/app/api/accounts/[id]/test/route.ts`
- Create: `src/app/api/accounts/[id]/stats/route.ts`
- Create: `src/lib/accounts/service.ts`

**Step 1: Create account service layer**

Create `src/lib/accounts/service.ts`:
```typescript
import { prisma } from '@/lib/db/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import type { CreateAccountInput, UpdateAccountInput } from '@/lib/validation';
import type { EmailAccount } from '@prisma/client';

// Color palette for auto-assigning account colors
const ACCOUNT_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function getInitials(label: string): string {
  return label
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

export async function createAccount(
  organizationId: string,
  input: CreateAccountInput
): Promise<EmailAccount> {
  // Auto-assign color if not provided
  const accountCount = await prisma.emailAccount.count({
    where: { organizationId },
  });
  const color = input.color || ACCOUNT_COLORS[accountCount % ACCOUNT_COLORS.length];
  const avatarInitials = input.avatarInitials || getInitials(input.label);

  return prisma.emailAccount.create({
    data: {
      organizationId,
      label: input.label,
      emailAddress: input.emailAddress,
      provider: input.provider,
      color,
      avatarInitials,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      username: input.username,
      passwordEncrypted: input.password ? encrypt(input.password) : null,
    },
  });
}

export async function getDecryptedAccount(accountId: string): Promise<
  EmailAccount & { decryptedPassword: string | null }
> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw new Error('Account not found');

  return {
    ...account,
    decryptedPassword: account.passwordEncrypted
      ? decrypt(account.passwordEncrypted)
      : null,
  };
}

export function sanitizeAccount(account: EmailAccount) {
  // Strip sensitive fields before returning to client
  const {
    passwordEncrypted,
    oauthAccessToken,
    oauthRefreshToken,
    username,
    ...safe
  } = account;
  return safe;
}

export async function updateAccount(
  accountId: string,
  organizationId: string,
  input: UpdateAccountInput
): Promise<EmailAccount> {
  return prisma.emailAccount.update({
    where: { id: accountId, organizationId },
    data: input,
  });
}

export async function deleteAccount(
  accountId: string,
  organizationId: string
): Promise<void> {
  await prisma.emailAccount.delete({
    where: { id: accountId, organizationId },
  });
}

export async function getAccountStats(accountId: string) {
  const [unreadCount, totalCount, lastSynced] = await Promise.all([
    prisma.email.count({
      where: { accountId, folder: 'INBOX', isRead: false },
    }),
    prisma.email.count({ where: { accountId } }),
    prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { lastSyncedAt: true },
    }),
  ]);

  return {
    unreadCount,
    totalCount,
    lastSyncedAt: lastSynced?.lastSyncedAt,
  };
}
```

**Step 2: Create account list + create route**

Create `src/app/api/accounts/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError, requireAdmin } from '@/lib/auth/middleware';
import { createAccountSchema } from '@/lib/validation';
import { createAccount, sanitizeAccount } from '@/lib/accounts/service';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const accounts = await prisma.emailAccount.findMany({
    where: { organizationId: auth.organizationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      label: true,
      emailAddress: true,
      provider: true,
      color: true,
      avatarInitials: true,
      isActive: true,
      lastSyncedAt: true,
      createdAt: true,
    },
  });

  return apiResponse(accounts);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  try {
    const account = await createAccount(auth.organizationId, parsed.data);
    return apiResponse(sanitizeAccount(account), 201);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes('Unique constraint')
    ) {
      return apiError('An account with this email address already exists', 409);
    }
    console.error('Create account error:', error);
    return apiError('Internal server error', 500);
  }
}
```

**Step 3: Create account detail, update, delete routes**

Create `src/app/api/accounts/[id]/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { updateAccountSchema } from '@/lib/validation';
import { sanitizeAccount, updateAccount, deleteAccount } from '@/lib/accounts/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const account = await prisma.emailAccount.findFirst({
    where: { id, organizationId: auth.organizationId },
  });

  if (!account) return apiError('Account not found', 404);
  return apiResponse(sanitizeAccount(account));
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const body = await req.json();
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  try {
    const account = await updateAccount(id, auth.organizationId, parsed.data);
    return apiResponse(sanitizeAccount(account));
  } catch {
    return apiError('Account not found', 404);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  try {
    await deleteAccount(id, auth.organizationId);
    return apiResponse({ success: true });
  } catch {
    return apiError('Account not found', 404);
  }
}
```

**Step 4: Create account test connectivity route**

Create `src/app/api/accounts/[id]/test/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { getDecryptedAccount } from '@/lib/accounts/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const results = { imap: false, smtp: false, imapError: '', smtpError: '' };

  try {
    const account = await getDecryptedAccount(id);

    // Test IMAP
    if (account.imapHost && account.decryptedPassword) {
      try {
        const client = new ImapFlow({
          host: account.imapHost,
          port: account.imapPort || 993,
          secure: account.imapSecure ?? true,
          auth: {
            user: account.username || account.emailAddress,
            pass: account.decryptedPassword,
          },
          logger: false,
        });
        await client.connect();
        await client.logout();
        results.imap = true;
      } catch (e: unknown) {
        results.imapError = e instanceof Error ? e.message : 'IMAP connection failed';
      }
    }

    // Test SMTP
    if (account.smtpHost && account.decryptedPassword) {
      try {
        const transporter = createTransport({
          host: account.smtpHost,
          port: account.smtpPort || 587,
          secure: account.smtpSecure ?? false,
          auth: {
            user: account.username || account.emailAddress,
            pass: account.decryptedPassword,
          },
        });
        await transporter.verify();
        results.smtp = true;
      } catch (e: unknown) {
        results.smtpError = e instanceof Error ? e.message : 'SMTP connection failed';
      }
    }

    return apiResponse(results);
  } catch (error) {
    console.error('Test account error:', error);
    return apiError('Account not found', 404);
  }
}
```

**Step 5: Create account stats route**

Create `src/app/api/accounts/[id]/stats/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { getAccountStats } from '@/lib/accounts/service';
import { prisma } from '@/lib/db/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  // Verify account belongs to user's org
  const account = await prisma.emailAccount.findFirst({
    where: { id, organizationId: auth.organizationId },
    select: { id: true },
  });

  if (!account) return apiError('Account not found', 404);

  const stats = await getAccountStats(id);
  return apiResponse(stats);
}
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add email account CRUD API with credential encryption and connectivity test"
```

---

## Task 7: IMAP Connection Manager (Single Account + IDLE)

**Files:**
- Create: `src/lib/imap/connection-manager.ts`
- Create: `src/lib/imap/email-parser.ts`
- Create: `src/lib/imap/threading.ts`
- Test: `src/__tests__/lib/imap/threading.test.ts`

**Step 1: Write failing test for threading logic**

Create `src/__tests__/lib/imap/threading.test.ts`:
```typescript
import { resolveThreadId } from '@/lib/imap/threading';

// Mock Prisma
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    email: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db/prisma';

const mockFindFirst = prisma.email.findFirst as jest.Mock;

describe('resolveThreadId', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns own messageId when no references exist', async () => {
    const result = await resolveThreadId(
      '<new@example.com>',
      null,
      null,
      'org-1'
    );
    expect(result).toBe('<new@example.com>');
  });

  it('finds thread via inReplyTo', async () => {
    mockFindFirst.mockResolvedValue({
      threadId: '<root@example.com>',
    });

    const result = await resolveThreadId(
      '<reply@example.com>',
      '<original@example.com>',
      null,
      'org-1'
    );
    expect(result).toBe('<root@example.com>');
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageId: '<original@example.com>',
        }),
      })
    );
  });

  it('falls back to references header when inReplyTo not found', async () => {
    // First call (inReplyTo) returns null
    mockFindFirst.mockResolvedValueOnce(null);
    // Second call (references) returns a match
    mockFindFirst.mockResolvedValueOnce({ threadId: '<thread-root@example.com>' });

    const result = await resolveThreadId(
      '<new-reply@example.com>',
      '<unknown@example.com>',
      '<ref1@example.com> <ref2@example.com>',
      'org-1'
    );
    expect(result).toBe('<thread-root@example.com>');
  });

  it('creates new thread when no references match', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await resolveThreadId(
      '<orphan@example.com>',
      '<nonexistent@example.com>',
      null,
      'org-1'
    );
    expect(result).toBe('<orphan@example.com>');
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm test -- --testPathPattern=threading
```

Expected: FAIL — `Cannot find module '@/lib/imap/threading'`

**Step 3: Implement threading logic**

Create `src/lib/imap/threading.ts`:
```typescript
import { prisma } from '@/lib/db/prisma';

/**
 * Resolve the thread ID for an incoming email using RFC 2822 headers.
 * Cross-account threading: searches all accounts within the organization.
 *
 * Strategy:
 * 1. Check In-Reply-To header → look up that messageId
 * 2. Check References header → try each reference (oldest first)
 * 3. If no match → use own messageId as new thread root
 */
export async function resolveThreadId(
  messageId: string,
  inReplyTo: string | null,
  referencesHeader: string | null,
  organizationId: string
): Promise<string> {
  // 1. Try In-Reply-To
  if (inReplyTo) {
    const match = await prisma.email.findFirst({
      where: {
        messageId: inReplyTo,
        account: { organizationId },
      },
      select: { threadId: true },
    });
    if (match?.threadId) return match.threadId;
  }

  // 2. Try References header (space-separated list of message IDs)
  if (referencesHeader) {
    const references = referencesHeader.trim().split(/\s+/);
    for (const ref of references) {
      const match = await prisma.email.findFirst({
        where: {
          messageId: ref,
          account: { organizationId },
        },
        select: { threadId: true },
      });
      if (match?.threadId) return match.threadId;
    }
  }

  // 3. New thread — use own messageId
  return messageId;
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
npm test -- --testPathPattern=threading
```

Expected: PASS — all 4 tests pass.

**Step 5: Create email parser utility**

Create `src/lib/imap/email-parser.ts`:
```typescript
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';

interface ParsedEmailData {
  messageId: string;
  subject: string | null;
  snippet: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: Array<{ name: string; address: string }>;
  ccAddresses: Array<{ name: string; address: string }>;
  bccAddresses: Array<{ name: string; address: string }>;
  replyTo: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
  receivedAt: Date;
  sentAt: Date | null;
  rawHeaders: Record<string, string>;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
    cid: string | null;
  }>;
}

function extractAddresses(addr: AddressObject | AddressObject[] | undefined): Array<{ name: string; address: string }> {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  return list.flatMap((a) =>
    (a.value || []).map((v) => ({
      name: v.name || '',
      address: v.address || '',
    }))
  );
}

function makeSnippet(text: string | undefined, maxLength = 300): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export async function parseEmail(raw: Buffer | string): Promise<ParsedEmailData> {
  const parsed: ParsedMail = await simpleParser(raw);

  const rawHeaders: Record<string, string> = {};
  if (parsed.headers) {
    parsed.headers.forEach((value, key) => {
      rawHeaders[key] = typeof value === 'string' ? value : JSON.stringify(value);
    });
  }

  return {
    messageId: parsed.messageId || `<generated-${Date.now()}@mailhub>`,
    subject: parsed.subject || null,
    snippet: makeSnippet(parsed.text),
    fromAddress: parsed.from?.value?.[0]?.address || null,
    fromName: parsed.from?.value?.[0]?.name || null,
    toAddresses: extractAddresses(parsed.to),
    ccAddresses: extractAddresses(parsed.cc),
    bccAddresses: extractAddresses(parsed.bcc),
    replyTo: parsed.replyTo?.value?.[0]?.address || null,
    inReplyTo: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : null,
    referencesHeader: parsed.references
      ? (Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : parsed.references)
      : null,
    bodyHtml: parsed.html || null,
    bodyText: parsed.text || null,
    hasAttachments: (parsed.attachments?.length ?? 0) > 0,
    receivedAt: parsed.date || new Date(),
    sentAt: parsed.date || null,
    rawHeaders,
    attachments: (parsed.attachments || []).map((att) => ({
      filename: att.filename || 'untitled',
      contentType: att.contentType || 'application/octet-stream',
      size: att.size,
      content: att.content,
      cid: att.cid || null,
    })),
  };
}
```

**Step 6: Create IMAP Connection Manager**

Create `src/lib/imap/connection-manager.ts`:
```typescript
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { prisma } from '@/lib/db/prisma';
import { decrypt } from '@/lib/crypto';
import { parseEmail } from './email-parser';
import { resolveThreadId } from './threading';
import { redis } from '@/lib/redis';
import type { EmailAccount } from '@prisma/client';

interface ConnectionEntry {
  client: ImapFlow;
  accountId: string;
  organizationId: string;
  isConnected: boolean;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
}

const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const BASE_RECONNECT_DELAY_MS = 1000; // 1 second

export class IMAPConnectionManager {
  private connections: Map<string, ConnectionEntry> = new Map();

  /**
   * Initialize an IMAP connection for a single account.
   * Opens connection, enters IDLE on INBOX.
   */
  async initializeAccount(account: EmailAccount): Promise<void> {
    if (this.connections.has(account.id)) {
      console.log(`Account ${account.id} already connected, skipping`);
      return;
    }

    const password = account.passwordEncrypted
      ? decrypt(account.passwordEncrypted)
      : null;

    if (!account.imapHost || !password) {
      console.warn(`Account ${account.id} missing IMAP credentials, skipping`);
      return;
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort || 993,
      secure: account.imapSecure ?? true,
      auth: {
        user: account.username || account.emailAddress,
        pass: password,
      },
      logger: false,
    });

    const entry: ConnectionEntry = {
      client,
      accountId: account.id,
      organizationId: account.organizationId,
      isConnected: false,
      reconnectAttempts: 0,
    };

    this.connections.set(account.id, entry);

    // Handle connection events
    client.on('close', () => {
      console.log(`IMAP connection closed for account ${account.id}`);
      entry.isConnected = false;
      this.scheduleReconnect(account.id);
    });

    client.on('error', (err: Error) => {
      console.error(`IMAP error for account ${account.id}:`, err.message);
      entry.isConnected = false;
    });

    try {
      await client.connect();
      entry.isConnected = true;
      entry.reconnectAttempts = 0;
      console.log(`Connected to IMAP for account ${account.id} (${account.emailAddress})`);

      // Start IDLE on INBOX
      await this.startIDLE(account.id);
    } catch (error) {
      console.error(`Failed to connect account ${account.id}:`, error);
      entry.isConnected = false;
      this.scheduleReconnect(account.id);
    }
  }

  /**
   * Enter IDLE mode on INBOX, listening for new emails.
   */
  private async startIDLE(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) return;

    const { client } = entry;

    try {
      const lock = await client.getMailboxLock('INBOX');

      try {
        // Listen for new mail via EXISTS event
        client.on('exists', async (data: { path: string; count: number; prevCount: number }) => {
          if (data.path === 'INBOX' && data.count > data.prevCount) {
            console.log(
              `New email(s) in INBOX for account ${accountId}: ${data.count - data.prevCount} new`
            );
            await this.fetchNewEmails(accountId, data.prevCount + 1, data.count);
          }
        });

        // Enter IDLE — this keeps the connection alive
        // The exists event above handles new mail notifications
        console.log(`Entered IDLE for account ${accountId}`);
      } catch (idleError) {
        lock.release();
        throw idleError;
      }
    } catch (error) {
      console.error(`Failed to start IDLE for account ${accountId}:`, error);
    }
  }

  /**
   * Fetch and persist new emails by sequence numbers.
   */
  private async fetchNewEmails(
    accountId: string,
    startSeq: number,
    endSeq: number
  ): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) return;

    const { client, organizationId } = entry;

    try {
      const range = `${startSeq}:${endSeq}`;
      for await (const message of client.fetch(range, {
        source: true,
        uid: true,
      })) {
        await this.persistEmail(accountId, organizationId, message);
      }
    } catch (error) {
      console.error(`Failed to fetch new emails for account ${accountId}:`, error);
    }
  }

  /**
   * Parse and persist a single email to the database.
   */
  private async persistEmail(
    accountId: string,
    organizationId: string,
    message: FetchMessageObject
  ): Promise<void> {
    try {
      const rawSource = message.source;
      const parsed = await parseEmail(rawSource);

      // Resolve thread ID (cross-account)
      const threadId = await resolveThreadId(
        parsed.messageId,
        parsed.inReplyTo,
        parsed.referencesHeader,
        organizationId
      );

      // Persist email envelope + body in a transaction
      await prisma.$transaction(async (tx) => {
        const email = await tx.email.upsert({
          where: {
            accountId_messageId: {
              accountId,
              messageId: parsed.messageId,
            },
          },
          create: {
            accountId,
            messageId: parsed.messageId,
            uid: message.uid ? BigInt(message.uid) : null,
            threadId,
            folder: 'INBOX',
            subject: parsed.subject,
            snippet: parsed.snippet,
            fromAddress: parsed.fromAddress,
            fromName: parsed.fromName,
            toAddresses: parsed.toAddresses,
            ccAddresses: parsed.ccAddresses,
            bccAddresses: parsed.bccAddresses,
            replyTo: parsed.replyTo,
            inReplyTo: parsed.inReplyTo,
            referencesHeader: parsed.referencesHeader,
            hasAttachments: parsed.hasAttachments,
            receivedAt: parsed.receivedAt,
            sentAt: parsed.sentAt,
            rawHeaders: parsed.rawHeaders,
          },
          update: {}, // Skip if already exists
        });

        // Store body separately
        await tx.emailBody.upsert({
          where: { emailId: email.id },
          create: {
            emailId: email.id,
            bodyHtml: parsed.bodyHtml,
            bodyText: parsed.bodyText,
          },
          update: {},
        });
      });

      // Publish new email event via Redis for SSE
      await redis.publish(
        `new_email:${organizationId}`,
        JSON.stringify({
          event: 'new_email',
          accountId,
          messageId: parsed.messageId,
          subject: parsed.subject,
          from: parsed.fromAddress,
          folder: 'INBOX',
        })
      );

      console.log(`Persisted email: ${parsed.subject} (${parsed.messageId})`);
    } catch (error) {
      console.error(`Failed to persist email for account ${accountId}:`, error);
    }
  }

  /**
   * Schedule a reconnect with exponential backoff.
   */
  private scheduleReconnect(accountId: string): void {
    const entry = this.connections.get(accountId);
    if (!entry) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, entry.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    console.log(`Scheduling reconnect for account ${accountId} in ${delay}ms`);

    entry.reconnectTimer = setTimeout(async () => {
      entry.reconnectAttempts++;
      try {
        const account = await prisma.emailAccount.findUnique({
          where: { id: accountId },
        });
        if (account && account.isActive) {
          this.connections.delete(accountId);
          await this.initializeAccount(account);
        }
      } catch (error) {
        console.error(`Reconnect failed for account ${accountId}:`, error);
        this.scheduleReconnect(accountId);
      }
    }, delay);
  }

  /**
   * Disconnect a single account.
   */
  async destroyAccount(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry) return;

    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);

    try {
      if (entry.isConnected) {
        await entry.client.logout();
      }
    } catch {
      // Ignore logout errors
    }

    this.connections.delete(accountId);
    console.log(`Destroyed IMAP connection for account ${accountId}`);
  }

  /**
   * Graceful shutdown — close all connections.
   */
  async shutdown(): Promise<void> {
    console.log(`Shutting down IMAP Connection Manager (${this.connections.size} connections)`);
    const promises = Array.from(this.connections.keys()).map((id) =>
      this.destroyAccount(id)
    );
    await Promise.allSettled(promises);
  }

  /**
   * Get connection status for all accounts.
   */
  getStatus(): Array<{ accountId: string; isConnected: boolean }> {
    return Array.from(this.connections.entries()).map(([id, entry]) => ({
      accountId: id,
      isConnected: entry.isConnected,
    }));
  }
}

// Singleton instance
export const imapManager = new IMAPConnectionManager();
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add IMAP connection manager with IDLE, email parser, and cross-account threading"
```

---

## Task 8: SMTP Sender Service

**Files:**
- Create: `src/lib/smtp/sender.ts`
- Create: `src/app/api/accounts/[id]/emails/send/route.ts`
- Create: `src/lib/activity/log.ts`

**Step 1: Create activity logging utility**

Create `src/lib/activity/log.ts`:
```typescript
import { prisma } from '@/lib/db/prisma';

interface LogParams {
  organizationId: string;
  userId: string;
  accountId?: string;
  emailId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    await prisma.emailActivityLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        accountId: params.accountId,
        emailId: params.emailId,
        action: params.action,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch (error) {
    // Activity logging should never fail the main operation
    console.error('Failed to log activity:', error);
  }
}
```

**Step 2: Create SMTP sender service**

Create `src/lib/smtp/sender.ts`:
```typescript
import { createTransport, Transporter } from 'nodemailer';
import { prisma } from '@/lib/db/prisma';
import { getDecryptedAccount } from '@/lib/accounts/service';
import { logActivity } from '@/lib/activity/log';
import type { SendEmailInput } from '@/lib/validation';

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

function createSMTPTransporter(
  host: string,
  port: number,
  secure: boolean,
  user: string,
  pass: string
): Transporter {
  return createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendEmail(
  accountId: string,
  userId: string,
  organizationId: string,
  payload: SendEmailInput
): Promise<SendResult> {
  const account = await getDecryptedAccount(accountId);

  if (!account.smtpHost || !account.decryptedPassword) {
    throw new Error('SMTP credentials not configured for this account');
  }

  const transporter = createSMTPTransporter(
    account.smtpHost,
    account.smtpPort || 587,
    account.smtpSecure ?? false,
    account.username || account.emailAddress,
    account.decryptedPassword
  );

  const info = await transporter.sendMail({
    from: `"${account.label}" <${account.emailAddress}>`,
    to: payload.to.join(', '),
    cc: payload.cc?.join(', '),
    bcc: payload.bcc?.join(', '),
    subject: payload.subject,
    html: payload.bodyHtml,
    text: payload.bodyText,
    inReplyTo: payload.inReplyTo,
    references: payload.references,
  });

  // Persist sent email to DB
  const email = await prisma.$transaction(async (tx) => {
    const created = await tx.email.create({
      data: {
        accountId,
        messageId: info.messageId || `<sent-${Date.now()}@mailhub>`,
        folder: 'SENT',
        subject: payload.subject,
        snippet: (payload.bodyText || '').slice(0, 300),
        fromAddress: account.emailAddress,
        fromName: account.label,
        toAddresses: payload.to.map((a) => ({ name: '', address: a })),
        ccAddresses: payload.cc?.map((a) => ({ name: '', address: a })) ?? [],
        bccAddresses: payload.bcc?.map((a) => ({ name: '', address: a })) ?? [],
        inReplyTo: payload.inReplyTo,
        referencesHeader: payload.references,
        isRead: true,
        sentAt: new Date(),
        receivedAt: new Date(),
      },
    });

    // Store body
    await tx.emailBody.create({
      data: {
        emailId: created.id,
        bodyHtml: payload.bodyHtml,
        bodyText: payload.bodyText,
      },
    });

    return created;
  });

  // Audit log
  await logActivity({
    organizationId,
    userId,
    accountId,
    emailId: email.id,
    action: 'sent',
    metadata: { to: payload.to, subject: payload.subject },
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted as string[],
    rejected: info.rejected as string[],
  };
}
```

**Step 3: Create send email API route**

Create `src/app/api/accounts/[id]/emails/send/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { sendEmailSchema } from '@/lib/validation';
import { sendEmail } from '@/lib/smtp/sender';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Verify account belongs to user's org
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  const body = await req.json();
  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  try {
    const result = await sendEmail(
      accountId,
      auth.userId,
      auth.organizationId,
      parsed.data
    );
    return apiResponse(result, 201);
  } catch (error: unknown) {
    console.error('Send email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return apiError(message, 500);
  }
}
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add SMTP sender service with audit logging and send email API route"
```

---

## Task 9: Email List + Detail API Routes

**Files:**
- Create: `src/app/api/accounts/[id]/emails/route.ts`
- Create: `src/app/api/accounts/[id]/emails/[emailId]/route.ts`
- Create: `src/app/api/emails/thread/[threadId]/route.ts`

**Step 1: Create email list route (paginated)**

Create `src/app/api/accounts/[id]/emails/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { emailListQuerySchema } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Verify account belongs to user's org
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  // Parse query params
  const { searchParams } = req.nextUrl;
  const query = emailListQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!query.success) return apiError(query.error.errors[0].message, 422);

  const { folder, page, limit, unreadOnly, labelId } = query.data;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Record<string, unknown> = {
    accountId,
    folder,
  };
  if (unreadOnly) where.isRead = false;
  if (labelId) {
    where.emailLabels = { some: { labelId } };
  }

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        messageId: true,
        threadId: true,
        folder: true,
        subject: true,
        snippet: true,
        fromAddress: true,
        fromName: true,
        toAddresses: true,
        isRead: true,
        isStarred: true,
        isDraft: true,
        hasAttachments: true,
        receivedAt: true,
        sentAt: true,
        emailLabels: {
          include: { label: { select: { id: true, name: true, color: true } } },
        },
      },
    }),
    prisma.email.count({ where }),
  ]);

  return apiResponse({
    emails,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
```

**Step 2: Create email detail + update + delete routes**

Create `src/app/api/accounts/[id]/emails/[emailId]/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { updateEmailSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activity/log';

interface RouteParams {
  params: Promise<{ id: string; emailId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  // Verify account belongs to user's org
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  const email = await prisma.email.findFirst({
    where: { id: emailId, accountId },
    include: {
      body: true,
      attachments: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          cid: true,
        },
      },
      emailLabels: {
        include: { label: { select: { id: true, name: true, color: true } } },
      },
    },
  });

  if (!email) return apiError('Email not found', 404);

  // Mark as read if not already
  if (!email.isRead) {
    await prisma.email.update({
      where: { id: emailId },
      data: { isRead: true },
    });
  }

  return apiResponse(email);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  const body = await req.json();
  const parsed = updateEmailSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  // Verify ownership chain
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  try {
    const updated = await prisma.email.update({
      where: { id: emailId, accountId },
      data: parsed.data,
    });
    return apiResponse(updated);
  } catch {
    return apiError('Email not found', 404);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  const email = await prisma.email.findFirst({
    where: { id: emailId, accountId },
  });
  if (!email) return apiError('Email not found', 404);

  if (email.folder === 'TRASH') {
    // Permanent delete
    await prisma.email.delete({ where: { id: emailId } });
  } else {
    // Move to trash
    await prisma.email.update({
      where: { id: emailId },
      data: { folder: 'TRASH' },
    });
  }

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    accountId,
    emailId,
    action: 'deleted',
    metadata: { subject: email.subject, fromTrash: email.folder === 'TRASH' },
  });

  return apiResponse({ success: true });
}
```

**Step 3: Create thread view route (cross-account)**

Create `src/app/api/emails/thread/[threadId]/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { threadId } = await params;

  // Fetch all emails in thread across all org accounts
  const emails = await prisma.email.findMany({
    where: {
      threadId,
      account: { organizationId: auth.organizationId },
    },
    orderBy: { receivedAt: 'asc' },
    include: {
      body: true,
      account: {
        select: { id: true, label: true, emailAddress: true, color: true, avatarInitials: true },
      },
      attachments: {
        select: { id: true, filename: true, contentType: true, sizeBytes: true, cid: true },
      },
    },
  });

  if (emails.length === 0) return apiError('Thread not found', 404);

  return apiResponse({
    threadId,
    messageCount: emails.length,
    accountCount: new Set(emails.map((e) => e.accountId)).size,
    emails,
  });
}
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add email list, detail, update, delete, and cross-account thread API routes"
```

---

## Task 10: Activity Log API Route

**Files:**
- Create: `src/app/api/activity/route.ts`

**Step 1: Create activity log route**

Create `src/app/api/activity/route.ts`:
```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const accountId = searchParams.get('accountId');
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    organizationId: auth.organizationId,
  };
  if (accountId) where.accountId = accountId;

  const [logs, total] = await Promise.all([
    prisma.emailActivityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        account: { select: { id: true, label: true, emailAddress: true, color: true } },
      },
    }),
    prisma.emailActivityLog.count({ where }),
  ]);

  return apiResponse({
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
```

**Step 2: Commit**

```bash
git add .
git commit -m "feat: add activity log API route with pagination and account filter"
```

---

## Task 11: Integration Verification

**Files:**
- Modify: `src/app/page.tsx` (replace default Next.js page)

**Step 1: Run all tests**

Run:
```bash
npm test
```

Expected: All tests pass (crypto: 4 tests, jwt: 3 tests, threading: 4 tests).

**Step 2: Start dev server and verify API health**

Run:
```bash
docker compose up -d
npm run dev
```

**Step 3: Test registration endpoint manually**

Run (in another terminal):
```bash
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"admin@test.com\",\"name\":\"Admin User\",\"password\":\"password123\",\"organizationName\":\"Test Org\"}"
```

Expected: 201 response with user and org details, `auth-token` cookie set.

**Step 4: Test login endpoint**

Run:
```bash
curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@test.com\",\"password\":\"password123\"}"
```

Expected: 200 response with user details and auth token.

**Step 5: Test accounts endpoint (with auth)**

Using the token from login:
```bash
curl http://localhost:3000/api/accounts -H "Authorization: Bearer <token>"
```

Expected: 200 response with empty array `[]`.

**Step 6: Verify database tables exist**

Run:
```bash
npx prisma studio
```

Expected: All 12 tables visible and queryable. Close with Ctrl+C.

**Step 7: Commit and tag Phase 1 completion**

```bash
git add .
git commit -m "chore: Phase 1 integration verification complete"
git tag v0.1.0-phase1 -m "Phase 1: Core Infrastructure complete"
```

---

## Summary

Phase 1 delivers:

| Component | Status |
|-----------|--------|
| Next.js project scaffold | ✅ |
| Docker Compose (PG, Redis, Meilisearch) | ✅ |
| Prisma schema (12 tables) | ✅ |
| AES-256-GCM credential encryption | ✅ |
| Zod validation schemas | ✅ |
| JWT authentication (register, login, me) | ✅ |
| Auth middleware (authenticate, requireAdmin) | ✅ |
| Organization CRUD + member management | ✅ |
| Email account CRUD + connectivity test | ✅ |
| IMAP Connection Manager (single account, IDLE) | ✅ |
| Email parser (mailparser) | ✅ |
| Cross-account threading (RFC 2822) | ✅ |
| SMTP sender with audit logging | ✅ |
| Email list/detail/update/delete API | ✅ |
| Cross-account thread view API | ✅ |
| Activity log API | ✅ |

**Next phase:** Phase 2 — Multi-Account Engine + Meilisearch Search. Scale IMAP manager to multi-worker with partitioning, add OAuth2 integration, full folder sync jobs, Meilisearch indexing pipeline, and SSE real-time notifications.
