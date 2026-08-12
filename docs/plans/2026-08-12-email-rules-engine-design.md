# Email Rules Engine Design

**Date**: 2026-08-12  
**Status**: Approved  

---

## 1. Overview
The Email Rules Engine allows users to automate inbox actions based on incoming or existing emails. Rules can match against email headers/content (e.g. sender, recipient, subject, body keywords, attachments) and labels, performing automated actions like applying/removing labels, marking emails as read/starred/high-risk, or triggering webhook notifications.

---

## 2. Data Model (Prisma)

A new `EmailRule` model is associated with an `Organization` and optionally scoped to an `EmailAccount` (null = all organization accounts):

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

### 2.1 Conditions JSON Structure
```typescript
export type MatchType = 'ALL' | 'ANY';

export type ConditionField = 'from' | 'to' | 'cc' | 'subject' | 'body' | 'hasAttachment' | 'hasLabelId';

export type ConditionOperator = 
  | 'contains' 
  | 'not_contains' 
  | 'equals' 
  | 'not_equals' 
  | 'starts_with' 
  | 'ends_with' 
  | 'matches_regex';

export interface RuleCriterion {
  field: ConditionField;
  operator: ConditionOperator;
  value: string | boolean;
}

export interface RuleConditions {
  matchType: MatchType;
  criteria: RuleCriterion[];
}
```

### 2.2 Actions JSON Structure
```typescript
export interface RuleActions {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  markAsRead?: boolean;
  markAsStarred?: boolean;
  markAsHighRisk?: boolean;
  triggerWebhookId?: string;
}
```

---

## 3. Rule Evaluation Engine (`src/lib/rules/engine.ts`)

### 3.1 Condition Evaluation Logic
- `evaluateCondition(emailData, criterion)`: Evaluates string operations case-insensitively.
  - `from`: Checks `email.fromAddress` and `email.fromName`.
  - `to` / `cc`: Checks array of email addresses in `toAddresses` / `ccAddresses`.
  - `subject`: Checks `email.subject`.
  - `body`: Checks `email.bodyText`.
  - `hasAttachment`: Checks boolean `email.hasAttachments` or attachment presence.
  - `hasLabelId`: Checks `email.emailLabels` array for the target `labelId`.
- `evaluateRule(emailData, rule)`: Combines criteria using `matchType` (`ALL` vs `ANY`).

### 3.2 Action Execution Logic
- `applyRuleActions(emailId, actions, prisma)`:
  - Upserts `EmailLabel` entries for `addLabelIds`.
  - Deletes `EmailLabel` entries for `removeLabelIds`.
  - Updates `isRead`, `isStarred`, `isHighRisk` on `Email`.
  - Emits activity log or webhook trigger if applicable.

---

## 4. API Endpoints

1. `GET /api/rules`: List organization rules with sorting by `priority` ascending.
2. `POST /api/rules`: Create a rule with validated `conditions` and `actions` schemas.
3. `GET /api/rules/[id]`: Retrieve single rule details.
4. `PUT /api/rules/[id]`: Update rule properties (name, priority, isActive, conditions, actions).
5. `DELETE /api/rules/[id]`: Delete a rule.
6. `POST /api/rules/[id]/run`: Execute a rule retroactively against existing emails for the scoped account(s).
7. `POST /api/rules/test`: Dry-run evaluation against test email payload.

---

## 5. Frontend & UI Integration

1. **Rules Settings Page (`/settings/rules`)**:
   - Lists existing rules with status toggle, edit modal, delete confirmation, and reorder controls.
   - Run retroactively button with execution count feedback.
2. **Rule Modal (`RuleModal.tsx`)**:
   - Form for Name, Description, Account Scope, and Stop Processing option.
   - Dynamic Conditions builder with Add/Remove condition rows.
   - Dynamic Actions builder with multi-select Label badges, flags toggles, and webhook options.
3. **Quick Rule Creation Shortcuts**:
   - In Email View toolbar: "Create Rule" modal pre-filled with email's sender / subject.
   - In Label Settings page: "Automate Label" button pre-filling `addLabelIds: [currentLabel.id]`.
