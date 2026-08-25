# Lazy Attachment Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist only received attachment metadata and provider references, download received attachment content on demand for downloads and forwarding, and preserve local storage for draft/sent uploads.

**Architecture:** Add nullable provider-reference fields to `Email` and `Attachment`, plus a stable attachment ordinal. IMAP and Gmail sync will populate those fields without writing received attachment files. A server-only retrieval service will dispatch to IMAP MIME-part or Gmail attachment retrieval, with a legacy local-file fallback. The attachment route and rule forwarder will share that service.

**Tech Stack:** Next.js 16 App Router route handlers, TypeScript, Prisma 7/PostgreSQL, ImapFlow, Gmail REST API, mailparser, Nodemailer, Jest/ts-jest.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` before editing route handlers, per `AGENTS.md`.
- Preserve all existing uncommitted user changes; do not reset, checkout, clean, or overwrite unrelated files.
- Received-email attachment bytes must not be written to durable local storage by synchronization or on-demand retrieval.
- Draft and sent attachment uploads continue using `.storage/attachments` and `storagePath`.
- Authorization must finish before provider access in the download route.
- Rule forwarding must fail before sending if any received attachment cannot be retrieved; partial forwards are forbidden.
- Every behavior change follows RED/GREEN/REFACTOR: write a failing test, run it, implement the smallest fix, rerun focused tests, then refactor.

---

### Task 1: Add provider reference fields and attachment reference types

**Files:**
- Modify: `prisma/schema.prisma:108-173`
- Create: `prisma/migrations/20260825120000_add_lazy_attachment_references/migration.sql`
- Create: `src/lib/email/attachment-references.ts`
- Test: `src/__tests__/lib/email/attachment-references.test.ts`

**Interfaces:**
- Produces `ReceivedAttachmentReference` with `ordinal`, `imapPart`, and `gmailAttachmentId` fields.
- Produces Prisma fields `Email.providerMessageId`, `Attachment.ordinal`, `Attachment.imapPart`, and `Attachment.gmailAttachmentId`, all nullable except `ordinal` if the migration backfills it. Keep `Attachment.storagePath` nullable and unchanged for local draft/sent records.

- [ ] **Step 1: Write the failing reference-shape tests.**

```ts
import { buildAttachmentReference } from '@/lib/email/attachment-references';

describe('buildAttachmentReference', () => {
  it('creates an ordinal-only reference for a received attachment without a provider part', () => {
    expect(buildAttachmentReference({ ordinal: 2 })).toEqual({
      ordinal: 2,
      imapPart: null,
      gmailAttachmentId: null,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure.**

Run: `npm test -- --runInBand src/__tests__/lib/email/attachment-references.test.ts`

Expected: FAIL because `buildAttachmentReference` does not exist.

- [ ] **Step 3: Add the minimal type and builder.**

```ts
export interface ReceivedAttachmentReference {
  ordinal: number;
  imapPart: string | null;
  gmailAttachmentId: string | null;
}

export function buildAttachmentReference(input: {
  ordinal: number;
  imapPart?: string | null;
  gmailAttachmentId?: string | null;
}): ReceivedAttachmentReference {
  return {
    ordinal: input.ordinal,
    imapPart: input.imapPart ?? null,
    gmailAttachmentId: input.gmailAttachmentId ?? null,
  };
}
```

- [ ] **Step 4: Add the Prisma fields and migration.**

Add to `Email`:

```prisma
providerMessageId String? @map("provider_message_id") @db.VarChar(512)
```

Add to `Attachment`:

```prisma
ordinal           Int?    @map("ordinal")
imapPart          String? @map("imap_part") @db.VarChar(255)
gmailAttachmentId String? @map("gmail_attachment_id") @db.VarChar(512)
```

The migration must add the four nullable columns with `IF NOT EXISTS`, then backfill `ordinal` per email using `created_at` order so legacy rows can be matched deterministically. Do not delete `storage_path`.

Use this SQL shape for the backfill:

```sql
ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "provider_message_id" VARCHAR(512);

ALTER TABLE "attachments"
  ADD COLUMN IF NOT EXISTS "ordinal" INTEGER,
  ADD COLUMN IF NOT EXISTS "imap_part" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "gmail_attachment_id" VARCHAR(512);

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "email_id" ORDER BY "created_at", "id") - 1 AS "ordinal"
  FROM "attachments"
)
UPDATE "attachments" AS a
SET "ordinal" = numbered."ordinal"
FROM numbered
WHERE a."id" = numbered."id" AND a."ordinal" IS NULL;
```

- [ ] **Step 5: Run the focused test and Prisma validation.**

Run: `npm test -- --runInBand src/__tests__/lib/email/attachment-references.test.ts` and `npx prisma validate`

Expected: PASS and a valid Prisma schema.

- [ ] **Step 6: Commit the task.**

```bash
git add prisma/schema.prisma prisma/migrations/20260825120000_add_lazy_attachment_references/migration.sql src/lib/email/attachment-references.ts src/__tests__/lib/email/attachment-references.test.ts
git commit -m "feat: add lazy attachment references"
```

### Task 2: Extract provider attachment references and stop received sync writes

**Files:**
- Modify: `src/lib/imap/email-parser.ts`
- Modify: `src/lib/imap/connection-manager.ts:1-12, 665-840, 973-1042`
- Modify: `src/lib/gmail/sync-manager.ts:1-12, 140-290`
- Modify: `src/lib/gmail/api.ts:150-180`
- Modify: `src/lib/email/attachment-storage.ts`
- Modify: `src/__tests__/lib/email/attachment-storage.test.ts`
- Create: `src/__tests__/lib/imap/attachment-references.test.ts`
- Create: `src/__tests__/lib/gmail/attachment-references.test.ts`

**Interfaces:**
- Produces `extractImapAttachmentReferences(bodyStructure)` returning ordered `{ ordinal, imapPart }` entries for attachment MIME nodes, including nested multipart nodes.
- Produces `extractGmailAttachmentReferences(payload)` returning ordered `{ ordinal, gmailAttachmentId }` entries for attachment MIME parts.
- `persistEmail` in both sync managers writes attachment metadata/reference fields and never calls `reconcileAttachmentFiles` for received mail.

- [ ] **Step 1: Write failing IMAP and Gmail reference extraction tests.**

```ts
it('returns nested IMAP attachment MIME parts in message order', () => {
  expect(extractImapAttachmentReferences({
    type: 'multipart',
    childNodes: [
      { part: '1', type: 'text', disposition: 'inline' },
      {
        part: '2', type: 'multipart', childNodes: [
          { part: '2.1', type: 'application', disposition: 'attachment', dispositionParameters: { filename: 'a.pdf' } },
          { part: '2.2', type: 'image', disposition: 'inline', id: '<cid-1>' },
        ],
      },
    ],
  })).toEqual([
    { ordinal: 0, imapPart: '2.1' },
    { ordinal: 1, imapPart: '2.2' },
  ]);
});

it('returns Gmail attachment IDs in payload order', () => {
  expect(extractGmailAttachmentReferences({
    mimeType: 'multipart/mixed',
    parts: [{
      partId: '1', mimeType: 'application/pdf',
      filename: 'a.pdf', body: { attachmentId: 'gmail-att-1' },
    }],
  })).toEqual([{ ordinal: 0, gmailAttachmentId: 'gmail-att-1' }]);
});
```

- [ ] **Step 2: Run the tests and verify they fail for the missing extractors.**

Run: `npm test -- --runInBand src/__tests__/lib/imap/attachment-references.test.ts src/__tests__/lib/gmail/attachment-references.test.ts`

Expected: FAIL because the extraction functions are not implemented.

- [ ] **Step 3: Implement recursive IMAP and Gmail extraction.**

Treat an IMAP node as an attachment when it has a filename/disposition of `attachment`, or is an inline non-text node with a content ID. Traverse `childNodes` depth-first and retain only nodes with a usable `part`. For Gmail, traverse `parts` depth-first and retain filename-bearing non-text parts with `body.attachmentId`; preserve inline content references for parts that have data but no attachment ID.

- [ ] **Step 4: Run the reference tests and verify they pass.**

Run: `npm test -- --runInBand src/__tests__/lib/imap/attachment-references.test.ts src/__tests__/lib/gmail/attachment-references.test.ts`

Expected: PASS.

- [ ] **Step 5: Change IMAP sync to fetch body structure and persist references only.**

Request `{ source: true, uid: true, bodyStructure: true }` in the sync fetch. Match parsed attachment order to `extractImapAttachmentReferences(message.bodyStructure)`. Replace the `reconcileAttachmentFiles` call with metadata/reference construction; create/update each row with `storagePath: null`, `ordinal`, and `imapPart`. Set `providerMessageId` to null for IMAP rows. Remove the missing-file repair scan and its filesystem imports because new received records have no durable attachment files.

- [ ] **Step 6: Change Gmail sync and API metadata retrieval.**

Add `fetchMessageFull(accessToken, messageId)` to `src/lib/gmail/api.ts`, requesting `format=full`, and use `extractGmailAttachmentReferences` to associate Gmail attachment IDs with parsed attachment order. Persist the exact `gmailMessageId` in `Email.providerMessageId`, set `storagePath: null`, and store `gmailAttachmentId`/`ordinal`. Keep the existing raw fetch for body/header parsing until the sync tests prove the full-payload parser can replace it without changing body behavior.

- [ ] **Step 7: Replace the storage helper test with a no-write sync metadata test.**

Assert that the received metadata builder returns rows with `storagePath: null` and that `fs.writeFile` is never called for received attachments. Keep local-file helpers available for draft/sent compatibility only.

- [ ] **Step 8: Run focused sync/parser tests and type-check.**

Run: `npm test -- --runInBand src/__tests__/lib/imap/attachment-references.test.ts src/__tests__/lib/gmail/attachment-references.test.ts src/__tests__/lib/email/attachment-storage.test.ts src/__tests__/lib/imap/email-parser.test.ts` and `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Commit the task.**

```bash
git add src/lib/imap/email-parser.ts src/lib/imap/connection-manager.ts src/lib/gmail/sync-manager.ts src/lib/gmail/api.ts src/lib/email/attachment-storage.ts src/__tests__/lib/email/attachment-storage.test.ts src/__tests__/lib/imap/attachment-references.test.ts src/__tests__/lib/gmail/attachment-references.test.ts
git commit -m "feat: stop storing received attachments"
```

### Task 3: Build the shared provider retrieval service

**Files:**
- Create: `src/lib/email/attachment-retrieval.ts`
- Modify: `src/lib/gmail/api.ts:150-180`
- Test: `src/__tests__/lib/email/attachment-retrieval.test.ts`

**Interfaces:**
- Produces `getReceivedAttachment(emailId: string, attachmentId: string): Promise<RetrievedAttachment>`.
- Produces `readStoredAttachment(attachment): Promise<RetrievedAttachment>` for legacy received rows and draft/sent rows.
- `RetrievedAttachment` is `{ filename: string; contentType: string; sizeBytes: number; content: Buffer }`.

- [ ] **Step 1: Write failing retrieval tests for IMAP, Gmail, legacy storage, and missing provider data.**

```ts
it('fetches only the stored IMAP MIME part', async () => {
  mockEmailWithImapReference();
  mockWithImapConnection(async (client) => {
    await client.mailboxOpen('INBOX', { readOnly: true });
    return await client.download(42, '2.1', { uid: true });
  });

  await expect(getReceivedAttachment('email-1', 'att-1')).resolves.toMatchObject({
    filename: 'report.pdf',
    content: Buffer.from('pdf'),
  });
  expect(mockDownload).toHaveBeenCalledWith(42, '2.1', { uid: true });
});

it('uses Gmail attachment data without writing a file', async () => {
  mockEmailWithGmailReference();
  mockFetchGmailAttachment.mockResolvedValue(Buffer.from('pdf'));

  await expect(getReceivedAttachment('email-1', 'att-1')).resolves.toMatchObject({
    content: Buffer.from('pdf'),
  });
  expect(fs.writeFile).not.toHaveBeenCalled();
});

it('uses storage only when a legacy/local attachment has a storage path', async () => {
  mockLegacyAttachment();
  mockFsReadFile.mockResolvedValue(Buffer.from('legacy'));
  await expect(getReceivedAttachment('email-1', 'att-1')).resolves.toMatchObject({
    content: Buffer.from('legacy'),
  });
});
```

- [ ] **Step 2: Run the focused retrieval test and verify it fails because the service is absent.**

Run: `npm test -- --runInBand src/__tests__/lib/email/attachment-retrieval.test.ts`

Expected: FAIL because `getReceivedAttachment` is not defined.

- [ ] **Step 3: Implement the common lookup and local fallback.**

Load the email with its account and requested attachment in one scoped query. Throw typed `AttachmentNotFoundError` when the email/attachment is missing or no provider/local reference exists. For legacy/local rows, read the validated storage path and return the actual byte length.

- [ ] **Step 4: Implement IMAP retrieval.**

Use `withImapConnection(accountId, operation)`, resolve the stored folder with `resolveMailboxPathOn` when necessary, open it read-only, call `client.download(String(email.uid), attachment.imapPart, { uid: true })`, collect the returned stream into a `Buffer`, and release the mailbox lock/connection in `finally`. Map a false/missing result to `AttachmentNotFoundError`.

- [ ] **Step 5: Implement Gmail retrieval.**

Add `fetchGmailAttachment(accessToken, messageId, attachmentId)` to `src/lib/gmail/api.ts`. Call Gmail's `/messages/{messageId}/attachments/{attachmentId}` endpoint, base64url-decode `data`, and return a `Buffer`. Use `getValidAccessToken(accountId)` in the retrieval service. Map Gmail 404 responses to `AttachmentNotFoundError` and other provider failures to `AttachmentProviderError`.

- [ ] **Step 6: Run retrieval tests and verify all pass.**

Run: `npm test -- --runInBand src/__tests__/lib/email/attachment-retrieval.test.ts`

Expected: PASS, with no filesystem writes from provider retrieval.

- [ ] **Step 7: Commit the task.**

```bash
git add src/lib/email/attachment-retrieval.ts src/lib/gmail/api.ts src/__tests__/lib/email/attachment-retrieval.test.ts
git commit -m "feat: add lazy attachment retrieval"
```

### Task 4: Switch the attachment download route to lazy retrieval

**Files:**
- Modify: `src/app/api/accounts/[id]/emails/[emailId]/attachments/[attachmentId]/route.ts`
- Modify: `src/__tests__/app/api/mail-access-routes.test.ts`
- Test: `src/__tests__/app/api/attachment-download-route.test.ts` if route-specific coverage is split out

**Interfaces:**
- Consumes `getReceivedAttachment` and `readStoredAttachment` from Task 3.
- Produces the same successful binary response shape as the current route, with provider content and actual byte length.

- [ ] **Step 1: Write failing route tests for provider retrieval and error mapping.**

```ts
it('retrieves a received attachment after access is verified', async () => {
  mockAccessibleEmail();
  mockGetReceivedAttachment.mockResolvedValue({
    filename: 'report.pdf', contentType: 'application/pdf',
    sizeBytes: 3, content: Buffer.from('pdf'),
  });

  const response = await getAttachment(requestFor('att-1'));

  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Length')).toBe('3');
  expect(await response.text()).toBe('pdf');
  expect(mockGetReceivedAttachment).toHaveBeenCalledWith('email-1', 'att-1');
});

it('returns 404 when the provider no longer has the attachment', async () => {
  mockAccessibleEmail();
  mockGetReceivedAttachment.mockRejectedValue(new AttachmentNotFoundError());
  expect((await getAttachment(requestFor('att-1'))).status).toBe(404);
});

it('returns 502 for an authorized provider failure', async () => {
  mockAccessibleEmail();
  mockGetReceivedAttachment.mockRejectedValue(new AttachmentProviderError());
  expect((await getAttachment(requestFor('att-1'))).status).toBe(502);
});
```

- [ ] **Step 2: Run the route test and verify it fails because the route still requires a storage path.**

Run: `npm test -- --runInBand src/__tests__/app/api/mail-access-routes.test.ts`

Expected: FAIL because the route does not invoke provider retrieval for `storagePath: null` records.

- [ ] **Step 3: Update the route after the existing access query.**

Select the email's account ID and the complete attachment metadata needed by the retrieval service. Keep the current `all`/`new-emails` authorization query before attachment lookup. Call `getReceivedAttachment` for provider-backed received rows and `readStoredAttachment` for legacy/local rows. Remove direct `fs.access`, `fs.readFile`, and candidate-path logic from the provider path.

- [ ] **Step 4: Add safe content headers and typed error mapping.**

Use `Content-Type` from the retrieved metadata, `Content-Length` from `content.length`, and a sanitized `Content-Disposition` filename that strips CR/LF and uses a quoted ASCII fallback plus `filename*` for UTF-8 names. Return 404/502/500 according to the approved design.

- [ ] **Step 5: Run route and access-control tests.**

Run: `npm test -- --runInBand src/__tests__/app/api/mail-access-routes.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts`

Expected: PASS, including the existing test that proves inaccessible unified attachments are rejected before attachment lookup.

- [ ] **Step 6: Commit the task.**

```bash
git add "src/app/api/accounts/[id]/emails/[emailId]/attachments/[attachmentId]/route.ts" src/__tests__/app/api/mail-access-routes.test.ts src/__tests__/app/api/attachment-download-route.test.ts
git commit -m "feat: download attachments on access"
```

### Task 5: Include lazily retrieved attachments in rule forwarding

**Files:**
- Modify: `src/lib/rules/engine.ts:1-10, 330-415`
- Modify: `src/__tests__/lib/rules/engine.test.ts`
- Test: `src/__tests__/lib/email/forwarding.test.ts` if the forwarding retrieval is extracted

**Interfaces:**
- Consumes `getReceivedAttachment(emailId, attachmentId)` from Task 3.
- Passes sender attachments as `{ filename, contentType, content }[]`, matching `sendEmail`/`SendEmailInput` in `src/lib/smtp/sender.ts`.

- [ ] **Step 1: Write failing forwarding tests.**

```ts
it('forwards all received attachments with the original message', async () => {
  mockRuleMatchWithAttachments();
  mockGetReceivedAttachment
    .mockResolvedValueOnce({ filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1, content: Buffer.from('a') })
    .mockResolvedValueOnce({ filename: 'b.png', contentType: 'image/png', sizeBytes: 1, content: Buffer.from('b') });

  await processRulesForNewEmail('email-1', 'account-1', 'org-1');

  expect(sendEmail).toHaveBeenCalledWith('account-1', expect.objectContaining({
    attachments: [
      { filename: 'a.pdf', contentType: 'application/pdf', content: Buffer.from('a') },
      { filename: 'b.png', contentType: 'image/png', content: Buffer.from('b') },
    ],
  }));
});

it('does not send a partial forward when an attachment cannot be retrieved', async () => {
  mockRuleMatchWithAttachments();
  mockGetReceivedAttachment.mockRejectedValue(new Error('provider unavailable'));

  await processRulesForNewEmail('email-1', 'account-1', 'org-1');

  expect(sendEmail).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused rule tests and verify the new assertions fail.**

Run: `npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts`

Expected: FAIL because the current forward payload has no `attachments` and does not call the retrieval service.

- [ ] **Step 3: Load attachment metadata in the rule query and retrieve all provider-backed attachments.**

Include `attachments: { select: { id, filename, contentType, storagePath, ...provider reference fields } }` in the email query used by `processRulesForNewEmail`. For each attachment, call the shared retrieval service; the service handles provider-backed and legacy/local rows. Build the sender attachment array before `sendEmail`.

- [ ] **Step 4: Keep body-only forwards unchanged and fail before sending on retrieval errors.**

Only add `attachments` when the list is non-empty. Let attachment retrieval errors reach the existing forward `catch` before `sendEmail` is called. Preserve current subject/body formatting and logging.

- [ ] **Step 5: Run rule, sender, and validation tests.**

Run: `npm test -- --runInBand src/__tests__/lib/rules/engine.test.ts src/__tests__/lib/smtp/sender.test.ts src/__tests__/lib/email/attachments.test.ts`

Expected: PASS, including existing sender attachment encoding tests.

- [ ] **Step 6: Commit the task.**

```bash
git add src/lib/rules/engine.ts src/__tests__/lib/rules/engine.test.ts src/__tests__/lib/email/forwarding.test.ts
git commit -m "feat: include attachments in rule forwards"
```

### Task 6: Verify draft/sent compatibility and complete the migration

**Files:**
- Modify: `src/app/api/accounts/[id]/emails/send/route.ts` only if the new nullable fields affect sent attachment creation
- Modify: `src/app/api/accounts/[id]/drafts/route.ts` only if the new nullable fields affect draft attachment creation
- Modify: `src/app/api/accounts/[id]/drafts/sync/route.ts` only if local-file reads need an explicit `storagePath` compatibility guard
- Modify: `src/__tests__/app/api/mail-access-routes.test.ts`
- Modify: `src/__tests__/lib/email/attachment-storage.test.ts`
- Create: `src/__tests__/app/api/attachment-compatibility.test.ts` if the existing suites cannot cover both paths clearly

**Interfaces:**
- Draft and sent rows continue to set `storagePath` and leave provider reference fields null.
- Legacy received rows with `storagePath` continue to download through the fallback.

- [ ] **Step 1: Write failing compatibility tests.**

```ts
it('keeps local draft attachments available to draft synchronization', async () => {
  mockDraftWithStoredAttachment();
  mockFsReadFile.mockResolvedValue(Buffer.from('draft'));
  await syncDraft(requestForDraft('draft-1'));
  expect(mockMailComposer).toHaveBeenCalledWith(expect.objectContaining({
    attachments: [expect.objectContaining({ content: Buffer.from('draft') })],
  }));
});

it('serves a legacy received attachment from its existing storage path', async () => {
  mockLegacyAccessibleEmail();
  mockReadStoredAttachment.mockResolvedValue({
    filename: 'legacy.pdf', contentType: 'application/pdf',
    sizeBytes: 6, content: Buffer.from('legacy'),
  });
  expect((await getAttachment(requestFor('att-legacy'))).status).toBe(200);
});
```

- [ ] **Step 2: Run the compatibility tests and confirm any regression.**

Run: `npm test -- --runInBand src/__tests__/app/api/mail-access-routes.test.ts src/__tests__/lib/email/attachment-storage.test.ts src/__tests__/app/api/related-mail-access-routes.test.ts`

Expected: Existing local-storage behavior remains green; any failure identifies a missing `storagePath` guard or changed Prisma select.

- [ ] **Step 3: Make only compatibility fixes.**

Keep `src/app/api/accounts/[id]/emails/send/route.ts`, `src/app/api/accounts/[id]/drafts/route.ts`, and `src/app/api/accounts/[id]/drafts/sync/route.ts` writing/reading local files for user-uploaded attachments. Do not reintroduce local writes into IMAP/Gmail received-mail sync.

- [ ] **Step 4: Run the complete verification set.**

Run:

```bash
npx prisma validate
npx tsc --noEmit
npm test -- --runInBand
npm run build
```

Expected: all commands pass. If the build requires the project environment, record the exact missing environment dependency rather than changing unrelated configuration.

- [ ] **Step 5: Review the final diff and commit only scoped changes.**

Run: `git diff --check` and `git status --short`.

Confirm that the diff contains only the lazy received-attachment implementation, its migration, tests, and required compatibility changes; leave unrelated pre-existing user modifications untouched.

Stage only the exact files changed by the completed tasks. Because this workspace starts with unrelated modifications, inspect `git diff --cached` and remove any unrelated hunks before committing. Do not use `git add prisma src` or another broad directory command.

```bash
git diff --check
git status --short
git diff --cached --check
git commit -m "feat: lazily download received attachments"
```
