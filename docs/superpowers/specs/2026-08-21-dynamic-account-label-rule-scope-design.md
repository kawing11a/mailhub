# Dynamic Account-Label Scope for Email Rules

**Date:** 2026-08-24

**Status:** Approved

## Goal

Allow an email rule to target every email account carrying a selected account label, with the rule following future account-label assignments and removals automatically.

## Existing Context

`EmailRule` currently supports two effective scopes:

- `accountId = null`: all organization accounts.
- `accountId = <id>`: one account.
- No multi-account scope: the UI only offers a single-account dropdown.

Account labels already exist as a many-to-many relationship between `Label` and `EmailAccount` through `AccountLabel`. The rule scope must use that existing relationship rather than copying account IDs into a rule.

## Chosen Design

Add an optional `accountLabelId` to `EmailRule`, while retaining `accountId` for backward compatibility:

| `accountId` | `accountLabelId` | Meaning |
|---|---|---|
| null | null | All organization accounts |
| set | null | One specific account |
| null | set | All accounts currently assigned the selected label |

The UI presents these as three mutually exclusive target modes: All accounts, Specific account, and Account label. A rule cannot submit both a specific account and an account label.

The selected label is stored by ID. Account membership is resolved at evaluation time, so assigning or removing the label from an account changes the rule’s target set without editing the rule.

## Data Model

Extend `EmailRule` with:

```prisma
accountLabelId String? @map("account_label_id") @db.Uuid

accountLabel Label? @relation("EmailRuleAccountLabel", fields: [accountLabelId], references: [id], onDelete: Cascade)
```

Add the matching relation on `Label`:

```prisma
accountScopedRules EmailRule[] @relation("EmailRuleAccountLabel")
```

Create a migration adding the nullable `account_label_id` column and foreign key. Existing rules remain unchanged. The existing organization-level validation for `accountId` will be mirrored for `accountLabelId`.

## Rule Evaluation

### New incoming email

When loading active rules for an incoming email, include rules that are:

- organization-wide (`accountId` and `accountLabelId` are null),
- scoped to the email’s account (`accountId = email.accountId`), or
- scoped to a label currently assigned to the email’s account.

The evaluator will receive the account’s current label IDs as part of its evaluation input and reject a label-scoped rule when the target label is absent. This keeps scope enforcement in the pure evaluator as well as in the database query.

### Retroactive “Run now”

The run endpoint will select accounts using the same three scope cases. For a label-scoped rule, it will query accounts whose `accountLabels` contains `accountLabelId`, then evaluate only emails belonging to those accounts.

### Rule testing

The dry-run endpoint will accept optional sample account label IDs so a label-scoped rule can be tested deterministically. Existing samples without label IDs continue to work for all-account and specific-account rules.

## API Contract

`POST /api/rules` and `PUT /api/rules/[id]` accept:

```ts
accountId?: string | null;
accountLabelId?: string | null;
```

Validation rules:

- Each supplied ID must be a UUID.
- The account must belong to the authenticated organization.
- The label must belong to the authenticated organization.
- Both IDs cannot be non-null in the same request.
- Sending `accountLabelId: null` clears label scope.
- Omitting a field during `PUT` preserves its existing value.

All rule responses include the selected account label’s `id`, `name`, and `color` when present, matching the existing account relation response shape.

## UI Behavior

In `RuleModal`:

1. Replace the single target dropdown with a scope mode selector.
2. Show a specific-account selector only for the account mode.
3. Show an account-label selector only for the label mode.
4. Display the label color/name in the rule list summary.
5. When editing an existing rule, infer the mode from `accountId` and `accountLabelId`.
6. For quick rule creation from an email, default to that email’s specific account scope.

The account-label picker uses the existing `/api/labels` response, which already exposes label IDs, names, colors, and account assignments. No account IDs are copied into the rule payload.

## Testing

Add regression coverage for:

- Evaluating a label-scoped rule when the email account has the target label.
- Rejecting the same rule after the account label is removed.
- API validation for organization-owned labels and mutually exclusive scope IDs.
- Retroactive execution selecting accounts through `accountLabels`.
- Rule modal rendering the three target modes and submitting `accountLabelId`.
- Existing all-account and specific-account rules retaining their current behavior.

## Acceptance Criteria

- An administrator can create a rule targeted to an account label from Email Rules settings.
- The saved rule does not contain a copied list of account IDs.
- Adding the label to another account causes future matching emails on that account to be eligible automatically.
- Removing the label prevents future matching emails on that account from being eligible automatically.
- “Run now” uses the current label assignments.
- Existing rules continue to load, edit, evaluate, and run without migration data changes beyond the nullable column.
