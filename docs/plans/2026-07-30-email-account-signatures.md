# Email Account Signatures Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement multiple rich-text email signatures per email account with auto-insertion in composer, an independent management page under settings, and an inline signature editor modal.

**Architecture:** Add a `Signature` model to Prisma connected to `EmailAccount`. Provide CRUD API routes with default signature management. Create a reusable `SignatureModal` component for both `/settings/signatures` and composer inline editing. Update `ComposeModal` to auto-insert and swap signatures via DOM tagging.

**Tech Stack:** Next.js App Router, Prisma, PostgreSQL, TipTap (Rich Text), Zod, Tailwind CSS, Jest / React Testing Library.

---

### Task 1: Prisma Schema & Client Generation

**Files:**
- Modify: `prisma/schema.prisma`
- Commands: `npx prisma generate`, `npx prisma db push`

**Step 1: Update Prisma schema**
Add `Signature` model and `signatures Signature[]` relation in `prisma/schema.prisma`:
```prisma
model Signature {
  id          String   @id @default(uuid()) @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  name        String   @db.VarChar(100)
  contentHtml String   @map("content_html") @db.Text
  isDefault   Boolean  @default(false) @map("is_default")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  account     EmailAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([accountId])
  @@map("signatures")
}
```

**Step 2: Generate client and push DB changes**
Run: `npx prisma generate`
Expected: Prisma Client generated successfully.

**Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): add Signature model to schema"
```

---

### Task 2: Validation Schemas

**Files:**
- Create: `src/__tests__/lib/validation/signature-schema.test.ts`
- Modify: `src/lib/validation/schemas.ts`

**Step 1: Write failing test for signature schema**
Create `src/__tests__/lib/validation/signature-schema.test.ts`:
```ts
import { signatureSchema } from '@/lib/validation/schemas';

describe('signatureSchema', () => {
  it('validates valid signature data', () => {
    const input = { name: 'Work Signature', contentHtml: '<p>Best,</p>', isDefault: true };
    const result = signatureSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const input = { name: '', contentHtml: '<p>Best,</p>' };
    const result = signatureSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npx jest src/__tests__/lib/validation/signature-schema.test.ts`
Expected: FAIL (signatureSchema not exported/found).

**Step 3: Implement signatureSchema**
Add to `src/lib/validation/schemas.ts`:
```ts
export const signatureSchema = z.object({
  name: z.string().min(1, 'Signature name is required').max(100),
  contentHtml: z.string(),
  isDefault: z.boolean().default(false),
});
```

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/lib/validation/signature-schema.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/validation/schemas.ts src/__tests__/lib/validation/signature-schema.test.ts
git commit -m "feat(validation): add Zod validation schema for email signatures"
```

---

### Task 3: Backend API Routes

**Files:**
- Create: `src/__tests__/app/api/signatures-route.test.ts`
- Create: `src/app/api/accounts/[id]/signatures/route.ts`
- Create: `src/app/api/signatures/[id]/route.ts`
- Create: `src/app/api/signatures/[id]/set-default/route.ts`

**Step 1: Write failing integration test for signature API routes**
Create `src/__tests__/app/api/signatures-route.test.ts`:
```ts
import { GET as getAccountSignatures, POST as createSignature } from '@/app/api/accounts/[id]/signatures/route';
import { PATCH as updateSignature, DELETE as deleteSignature } from '@/app/api/signatures/[id]/route';

describe('Signature API Routes', () => {
  it('exports API route handlers', () => {
    expect(typeof getAccountSignatures).toBe('function');
    expect(typeof createSignature).toBe('function');
    expect(typeof updateSignature).toBe('function');
    expect(typeof deleteSignature).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**
Run: `npx jest src/__tests__/app/api/signatures-route.test.ts`
Expected: FAIL (modules not found).

**Step 3: Implement API Route handlers**

1. `src/app/api/accounts/[id]/signatures/route.ts`:
   - `GET`: Fetch signatures for account sorted by `isDefault` desc then `name` asc.
   - `POST`: Validate payload using `signatureSchema`. If `isDefault` is true, set `isDefault: false` on all existing signatures for this account before creating.

2. `src/app/api/signatures/[id]/route.ts`:
   - `PATCH`: Update signature. If `isDefault` set to true, clear `isDefault` on other signatures of the same account.
   - `DELETE`: Remove signature record.

3. `src/app/api/signatures/[id]/set-default/route.ts`:
   - `POST`: Set signature as default for its account inside a Prisma transaction.

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/app/api/signatures-route.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/app/api/accounts/\[id\]/signatures/route.ts src/app/api/signatures/\[id\]/route.ts src/app/api/signatures/\[id\]/set-default/route.ts src/__tests__/app/api/signatures-route.test.ts
git commit -m "feat(api): implement signature management CRUD endpoints"
```

---

### Task 4: Custom React Hook `useSignatures`

**Files:**
- Create: `src/__tests__/hooks/useSignatures.test.ts`
- Create: `src/hooks/useSignatures.ts`

**Step 1: Write failing unit test for `useSignatures`**
Create `src/__tests__/hooks/useSignatures.test.ts` testing fetch and mutation state functions.

**Step 2: Run test to verify it fails**
Run: `npx jest src/__tests__/hooks/useSignatures.test.ts`
Expected: FAIL.

**Step 3: Implement `useSignatures` hook**
`src/hooks/useSignatures.ts` fetching signatures via SWR / fetch, providing `createSignature`, `updateSignature`, `deleteSignature`, `setDefaultSignature`.

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/hooks/useSignatures.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/hooks/useSignatures.ts src/__tests__/hooks/useSignatures.test.ts
git commit -m "feat(hooks): add useSignatures custom React hook"
```

---

### Task 5: Reusable `SignatureModal` Component

**Files:**
- Create: `src/__tests__/components/SignatureModal.test.tsx`
- Create: `src/components/signatures/SignatureModal.tsx`

**Step 1: Write failing unit test for `SignatureModal`**
Test rendering modal with TipTap editor, name input, and save callback.

**Step 2: Run test to verify it fails**
Run: `npx jest src/__tests__/components/SignatureModal.test.tsx`
Expected: FAIL.

**Step 3: Implement `SignatureModal`**
`src/components/signatures/SignatureModal.tsx` with TipTap editor toolbar, title input, account selector, and default checkbox.

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/components/SignatureModal.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/signatures/SignatureModal.tsx src/__tests__/components/SignatureModal.test.tsx
git commit -m "feat(components): create SignatureModal rich-text editor component"
```

---

### Task 6: Independent Settings Page (`/settings/signatures`)

**Files:**
- Create: `src/app/(dashboard)/settings/signatures/page.tsx`
- Modify: `src/app/(dashboard)/settings/layout.tsx` (Add "Signatures" tab navigation link)
- Create: `src/__tests__/app/settings/signatures-page.test.tsx`

**Step 1: Write failing test for signatures settings page**

**Step 2: Run test to verify it fails**
Run: `npx jest src/__tests__/app/settings/signatures-page.test.tsx`
Expected: FAIL.

**Step 3: Implement Settings Page & Update Settings Layout Nav**
Add `signatures` tab item to `settings/layout.tsx`. Build account tab switcher and signature grid cards in `settings/signatures/page.tsx`.

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/app/settings/signatures-page.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/app/\(dashboard\)/settings/signatures/page.tsx src/app/\(dashboard\)/settings/layout.tsx src/__tests__/app/settings/signatures-page.test.tsx
git commit -m "feat(settings): add independent signatures management settings page"
```

---

### Task 7: Compose Modal Integration

**Files:**
- Create: `src/__tests__/components/ComposeModal-signatures.test.tsx`
- Modify: `src/components/email/ComposeModal.tsx`

**Step 1: Write failing test for composer signature insertion & account switch replacement**

**Step 2: Run test to verify it fails**
Run: `npx jest src/__tests__/components/ComposeModal-signatures.test.tsx`
Expected: FAIL.

**Step 3: Update `ComposeModal.tsx`**
- Add signature picker dropdown button in composer action bar.
- Auto-insert default signature on load / compose open.
- Handle `<div data-signature="true">` clean DOM swap when switching `fromId`.
- Add `"⚙️ Manage Signatures..."` option in dropdown to trigger `SignatureModal` inline without closing draft.

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/components/ComposeModal-signatures.test.tsx`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/email/ComposeModal.tsx src/__tests__/components/ComposeModal-signatures.test.tsx
git commit -m "feat(composer): integrate signature picker dropdown, auto-insertion, and inline edit modal"
```
