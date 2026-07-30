# Design Document: Email Account Signatures Feature

**Date:** 2026-07-30  
**Status:** Approved  

---

## 1. Overview & Objectives

Implement comprehensive email signature support for multi-account email management:
1. **Multiple Signatures per Account**: Allow saving multiple signatures per email account with designated default signatures.
2. **Independent Settings Management Page**: Dedicated page under `/settings/signatures` to manage, create, edit, delete, and set default signatures per account.
3. **Compose Email Integration**: Signature selector dropdown in composer, auto-insertion of default signature, auto-replacement on account switch, and inline `SignatureModal` launcher directly inside the composer.

---

## 2. Data Model & Architecture

### Prisma Schema (`prisma/schema.prisma`)

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

Add `signatures Signature[]` to the `EmailAccount` model.

### Validation (`src/lib/validation/schemas.ts`)

```ts
export const signatureSchema = z.object({
  name: z.string().min(1, 'Signature name is required').max(100),
  contentHtml: z.string(),
  isDefault: z.boolean().default(false),
});
```

---

## 3. API Endpoints

* `GET /api/accounts/[accountId]/signatures` — Returns signatures for an account, sorted by default status then name.
* `POST /api/accounts/[accountId]/signatures` — Create signature. If `isDefault` is true, clears default status from existing signatures for that account.
* `PATCH /api/signatures/[id]` — Edit signature details. Handle default flag switching atomically.
* `DELETE /api/signatures/[id]` — Delete signature.

---

## 4. UI Components & Pages

### 1. Independent Settings Page (`src/app/(dashboard)/settings/signatures/page.tsx`)
* Tab bar / Account selector for switching between email accounts.
* List/Card grid of signatures for selected account (Name, HTML preview, Default badge).
* Actions: Create, Edit, Set Default, Delete.

### 2. Reusable Signature Editor Modal (`src/components/signatures/SignatureModal.tsx`)
* Modal with Account Selector, Signature Name field, TipTap Rich Text Editor, and "Set as Default" checkbox.
* Reusable across the `/settings/signatures` page and the composer modal.

### 3. Composer Integration (`ComposeModal.tsx`)
* Signature selector button in composer action bar.
* Wraps signatures in `<div data-signature="true" data-signature-id="...">...</div>`.
* Auto-inserts default signature on open and cleanly replaces signature block when switching `From` account.
* Quick action item `"⚙️ Manage Signatures..."` opens `SignatureModal` inline without losing compose draft state.

---

## 5. Verification & Testing

* **API Unit & Integration Tests**: Test CRUD endpoints for signatures and single-default constraint enforcement.
* **Component Testing**: Test signature selection, account switching replacement logic in TipTap composer, and modal toggles.
