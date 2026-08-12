# Email Rules Engine Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build a complete Email Rules Engine allowing users to create, manage, and execute automated rules based on email criteria (sender, recipient, subject, body, attachments) and labels (assigning/removing labels, marking read/starred/high-risk).

**Architecture:** A Prisma `EmailRule` schema stores rule definitions (conditions and actions). A pure-function evaluator (`src/lib/rules/engine.ts`) parses criteria and applies actions. Next.js App Router API routes expose CRUD, dry-run testing, and retroactive batch execution. A frontend Settings page (`/settings/rules`) and interactive `RuleModal` enable managing rules with quick-creation shortcuts from email and label views.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Prisma ORM, PostgreSQL, React Query (@tanstack/react-query), TailwindCSS, Lucide Icons, Jest, React Testing Library.

---

### Task 1: Prisma Schema Definition for `EmailRule`

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `prisma/schema.prisma`

**Step 1: Add `EmailRule` model to schema**
In `prisma/schema.prisma`, add:
```prisma
model EmailRule {
  id             String    @id @default(uuid()) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String    @db.VarChar(150)
  description    String?   @db.Text
  isActive       Boolean   @default(true) @map("is_active")
  priority       Int       @default(0)
  stopProcessing Boolean   @default(false) @map("stop_processing")

  accountId      String?   @map("account_id") @db.Uuid

  conditions     Json
  actions        Json

  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  account        EmailAccount? @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@index([organizationId, isActive, priority])
  @@map("email_rules")
}
```
And add `rules EmailRule[]` to `Organization` and `EmailAccount` models.

**Step 2: Generate Prisma Client**
Run: `npx prisma generate`
Expected: Successfully generated Prisma Client.

**Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(rules): add EmailRule prisma schema"
```

---

### Task 2: Rule Evaluator & Execution Engine (TDD)

**Files:**
- Create: `src/lib/rules/types.ts`
- Create: `src/lib/rules/engine.ts`
- Create: `src/__tests__/lib/rules/engine.test.ts`

**Step 1: Write failing unit tests for Rule Engine**
Create `src/__tests__/lib/rules/engine.test.ts` covering:
- Condition matching on `from`, `to`, `subject`, `body`, `hasAttachment`, `hasLabelId` with operators (`contains`, `equals`, `starts_with`, `ends_with`, `not_contains`, `matches_regex`).
- `matchType: "ALL"` vs `matchType: "ANY"`.
- Rule action generation (`addLabelIds`, `removeLabelIds`, `markAsRead`, `markAsStarred`, `markAsHighRisk`).

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/lib/rules/engine.test.ts`
Expected: FAIL (engine module not found).

**Step 3: Implement `src/lib/rules/types.ts` and `src/lib/rules/engine.ts`**
Implement typed rule schemas and evaluation functions:
- `evaluateCondition(email, criterion): boolean`
- `evaluateRule(email, rule): boolean`
- `applyRuleActions(emailId, actions, prisma): Promise<void>`

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/lib/rules/engine.test.ts`
Expected: PASS (all tests green).

**Step 5: Commit**
```bash
git add src/lib/rules/ src/__tests__/lib/rules/
git commit -m "feat(rules): implement rule evaluation engine with unit tests"
```

---

### Task 3: Backend API Endpoints for Rules CRUD & Execution

**Files:**
- Create: `src/app/api/rules/route.ts`
- Create: `src/app/api/rules/[id]/route.ts`
- Create: `src/app/api/rules/[id]/run/route.ts`
- Create: `src/app/api/rules/test/route.ts`
- Create: `src/__tests__/app/api/rules-routes.test.ts`

**Step 1: Write failing API route tests**
Test GET, POST, PUT, DELETE `/api/rules`, test evaluation `/api/rules/test`, and retroactive execution `/api/rules/[id]/run`.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/app/api/rules-routes.test.ts`
Expected: FAIL (routes not found).

**Step 3: Implement API routes**
Implement organization auth checks, validation of conditions/actions JSON, and database mutations.

**Step 4: Run test to verify it passes**
Run: `npx jest src/__tests__/app/api/rules-routes.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/app/api/rules/ src/__tests__/app/api/rules-routes.test.ts
git commit -m "feat(rules): add API endpoints for rule management and batch execution"
```

---

### Task 4: Frontend Rule Builder Modal & Settings Management Page

**Files:**
- Create: `src/components/rules/RuleModal.tsx`
- Create: `src/app/(dashboard)/settings/rules/page.tsx`
- Modify: `src/app/(dashboard)/settings/layout.tsx`
- Create: `src/__tests__/components/rules/RuleModal.test.tsx`

**Step 1: Add Rules tab to Settings navigation**
In `src/app/(dashboard)/settings/layout.tsx`, add `{ name: 'Rules', href: '/settings/rules', icon: Filter }`.

**Step 2: Build `RuleModal.tsx`**
Interactive modal featuring:
- Dynamic Condition Rows (`field`, `operator`, `value`, `Add/Delete Condition`).
- Match Logic Selector (`All conditions` / `Any condition`).
- Action controls (`Add labels`, `Remove labels`, `Mark read`, `Star`, `High Risk`).
- Account Scope dropdown (`All Accounts` or specific connected email account).

**Step 3: Build `/settings/rules/page.tsx`**
Listing view featuring:
- Active/Inactive toggle switches.
- Priority order badges.
- Edit and Delete buttons.
- "Run on Existing Emails" retroactive button with toast notification of modified count.

**Step 4: Run component tests**
Run: `npx jest src/__tests__/components/rules/`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/components/rules/ src/app/\(dashboard\)/settings/
git commit -m "feat(rules): add rules settings page and interactive rule modal"
```

---

### Task 5: Quick Rule Creation Shortcuts & Full Verification

**Files:**
- Modify: `src/app/(dashboard)/settings/labels/page.tsx` (Add "Create Rule for Label" shortcut)
- Modify: `src/components/email/EmailDetail.tsx` (or toolbar with "Create Rule from Email" shortcut)

**Step 1: Integrate shortcut in Label settings**
Add quick button to open `RuleModal` with label pre-selected in `actions.addLabelIds`.

**Step 2: Run full test suite**
Run: `npm test`
Expected: All test suites pass.

**Step 3: Commit**
```bash
git add .
git commit -m "feat(rules): connect quick rule shortcuts and verify test suite"
```
