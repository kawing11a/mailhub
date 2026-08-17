# Email Account Ownership and Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Allow admins and members to connect email accounts, assign ownership to the authorizing user, and optionally share newly connected accounts with non-admin members.

**Architecture:** Add an owner member relation to EmailAccount, retain MemberEmailAccountAccess for explicit grants, and centralize account visibility and access-management checks in src/lib/accounts/access.ts. Persist new accounts and owner access transactionally, expose an account-centric access API, and use a new client modal for optional sharing after OAuth and IMAP setup.

**Tech Stack:** Next.js 16.2.9 App Router route handlers, React 19 client components, Prisma 7 PostgreSQL migrations, Zod 4, TanStack Query 5, Jest 30, and TypeScript 5.

## Global Constraints

- Follow AGENTS.md and read the relevant local Next.js guide before writing application code.
- Use the existing App Router route-handler pattern with NextRequest, Response/NextResponse, and async params.
- Do not add dependencies.
- Preserve unrelated dirty worktree changes; only modify files listed in each task.
- Admins access every organization account without explicit access rows.
- The owner always has access and cannot be removed.
- Existing ownerless accounts are assigned to the earliest-joined admin in that organization.
- The sharing modal lists only non-admin members and can be skipped.
- Queue initial sync only after account and owner-access persistence succeeds.
- Account editing and deletion remain admin-only in this plan.

## File map

Create:
- prisma/migrations/20260817120000_add_email_account_owner/migration.sql
- src/lib/accounts/access.ts
- src/app/api/accounts/[id]/access/route.ts
- src/components/settings/ShareAccountAccessModal.tsx
- src/__tests__/lib/accounts/access.test.ts
- src/__tests__/lib/accounts/service.test.ts
- src/__tests__/app/api/accounts-create-route.test.ts
- src/__tests__/app/api/account-access-route.test.ts
- src/__tests__/app/api/account-ownership-callbacks.test.ts
- src/__tests__/components/share-account-access-modal.test.tsx

Modify:
- prisma/schema.prisma
- src/lib/accounts/service.ts
- src/lib/validation/schemas.ts
- src/app/api/accounts/route.ts
- src/app/api/accounts/[id]/route.ts
- src/app/api/accounts/test-credentials/route.ts
- src/app/api/accounts/oauth/google/callback/route.ts
- src/app/api/accounts/oauth/microsoft/callback/route.ts
- src/components/settings/AddAccountModal.tsx
- src/app/(dashboard)/settings/accounts/page.tsx
- src/hooks/useFavouriteMutations.tsx
- src/__tests__/app/api/accounts-route.test.ts

## Stable interfaces

~~~ts
export type AccountAuth = Pick<JWTPayload, 'userId' | 'organizationId' | 'role'>;

export function accountAccessWhere(auth: AccountAuth, accountId?: string): Prisma.EmailAccountWhereInput;

export function canManageAccountAccess(
  auth: AccountAuth,
  account: { organizationId: string; ownerUserId: string }
): boolean;
~~~

~~~ts
export async function createOwnedAccount(
  organizationId: string,
  ownerUserId: string,
  data: Omit<Prisma.EmailAccountUncheckedCreateInput, 'organizationId' | 'ownerUserId'>
): Promise<EmailAccount>;
~~~

~~~ts
type AccountAccessResponse = {
  account: {
    id: string;
    label: string;
    emailAddress: string;
    owner: { userId: string; name: string; email: string };
  };
  members: Array<{
    userId: string;
    name: string;
    email: string;
    hasAccess: boolean;
  }>;
};
type UpdateAccountAccessInput = { memberIds: string[] };
~~~

## Task 1: Schema and migration

**Files:** Modify prisma/schema.prisma; create the owner migration.

**Produces:** non-null EmailAccount.ownerUserId, the composite owner-to-OrganizationMember relation, and the reverse ownedEmailAccounts relation.

- [ ] Add ownedEmailAccounts EmailAccount[] with relation name EmailAccountOwner to OrganizationMember.
- [ ] Add ownerUserId and the named composite owner relation to EmailAccount. Keep the existing organization and memberAccess relations.
- [ ] Create the migration in this order: add nullable owner_user_id; update each account from the earliest admin ordered by joined_at and user_id; raise an exception if any account is still ownerless; set the column NOT NULL; add the composite foreign key to organization_members with RESTRICT delete behavior; add an owner index; insert missing owner rows into member_email_account_access with ON CONFLICT DO NOTHING.
- [ ] Run npx prisma validate. Expected: exit code 0.
- [ ] Commit only this task with git add prisma/schema.prisma prisma/migrations/20260817120000_add_email_account_owner/migration.sql and git commit -m "feat: add email account ownership".

## Task 2: Shared access predicates

**Files:** Create src/lib/accounts/access.ts and src/__tests__/lib/accounts/access.test.ts.

**Produces:** accountAccessWhere(auth, accountId?) and canManageAccountAccess(auth, account).

- [ ] Write failing tests for member owned-or-granted visibility; admin organization-wide visibility; owner/admin access-management permission; and cross-organization denial.
- [ ] Run npm test -- --runInBand src/__tests__/lib/accounts/access.test.ts; expected: fail because the module is absent.
- [ ] Implement accountAccessWhere to return organizationId, optional id, and for non-admins an OR of ownerUserId equals auth.userId and memberAccess containing auth.userId.
- [ ] Implement canManageAccountAccess as same-organization and admin role or ownerUserId equals auth.userId.
- [ ] Re-run the focused test; expected: pass.
- [ ] Commit the two files with git commit -m "feat: centralize account access rules".

## Task 3: IMAP creation and account visibility

**Files:** Modify src/lib/accounts/service.ts, src/app/api/accounts/route.ts, src/app/api/accounts/[id]/route.ts, src/app/api/accounts/test-credentials/route.ts, src/hooks/useFavouriteMutations.tsx, and src/__tests__/app/api/accounts-route.test.ts. Create service and create-route tests.

**Produces:** createOwnedAccount(organizationId, ownerUserId, data) and member-capable account creation.

- [ ] Write a service test with a mocked transaction. Assert account creation includes organizationId and ownerUserId, then assert memberEmailAccountAccess.create includes the owner user and account ID.
- [ ] Run the service test; expected: fail before implementation.
- [ ] Implement createOwnedAccount using prisma.$transaction: create the account with ownerUserId, create the owner access row, and return the account.
- [ ] Update createAccount to accept ownerUserId, preserve existing color/initials/partition/encryption behavior, and call createOwnedAccount.
- [ ] Remove requireAdmin from POST /api/accounts and call createAccount(auth.organizationId, auth.userId, parsed.data). Queue initial sync only after persistence resolves.
- [ ] Replace the inline member filter in GET /api/accounts with accountAccessWhere(auth). Select ownerUserId and return canManageAccess when the actor is admin or owner, without credentials.
- [ ] Extend SidebarAccount in src/hooks/useFavouriteMutations.tsx with ownerUserId and canManageAccess so the accounts page can render owner actions without untyped data.
- [ ] Make GET /api/accounts/[id] use accountAccessWhere(auth, id) and return 404 for an inaccessible account. Keep PUT and DELETE admin-only.
- [ ] Remove requireAdmin from POST /api/accounts/test-credentials; it has no account ID and only tests submitted credentials.
- [ ] Test member POST calls createAccount with the authenticated member ID and returns 201; test the list route uses the member visibility predicate.
- [ ] Run the focused service and account-route tests; expected: pass.
- [ ] Commit with git commit -m "feat: allow members to connect accounts".

## Task 4: OAuth ownership and reauthorization

**Files:** Modify both OAuth callback routes. Create src/__tests__/app/api/account-ownership-callbacks.test.ts.

**Produces:** new-account redirects with accountId and share=1; reauthorization redirects without share=1.

- [ ] Write Google and Microsoft tests for new member-owned account, owner reauthorization, admin reauthorization, and non-owner member rejection.
- [ ] Run the callback test; expected: fail before implementation.
- [ ] In each callback, derive ownership from verified auth.userId. State may provide label and organization validation but never ownership.
- [ ] Query existing accounts with organizationId_emailAddress and inspect ownerUserId before storing new credentials. Reject a non-admin whose userId is not the owner with error=unauthorized_reauthorization.
- [ ] For a new account, call createOwnedAccount(auth.organizationId, auth.userId, oauthAccountData), then enqueue initial sync.
- [ ] Redirect a newly created account to /settings/accounts?success=true&accountId=<id>&share=1; redirect reauthorization to /settings/accounts?success=true&accountId=<id>.
- [ ] Preserve existing encryption, provider settings, and OAuth error redirects.
- [ ] Run the new callback tests plus existing OAuth callback tests; expected: pass. Update only expectations affected by the new accountId query parameters.
- [ ] Commit with git commit -m "feat: assign OAuth account ownership".

## Task 5: Account-centric access API

**Files:** Modify src/lib/validation/schemas.ts. Create src/app/api/accounts/[id]/access/route.ts and its tests.

**Produces:** GET response with owner plus non-admin members and PUT replacement semantics.

- [ ] Add updateAccountAccessSchema = z.object({ memberIds: z.array(z.string().uuid()).max(500) }).
- [ ] Write failing route tests for owner/admin GET, non-owner 403, admin exclusion, cross-organization rejection, owner-row retention, and admin PUT.
- [ ] Run the route test; expected: fail because the route is absent.
- [ ] GET: authenticate; find the account in the actor organization; require canManageAccountAccess; load owner details, role=member organization members, and this account's access rows; map hasAccess from a Set; never return admins or credentials.
- [ ] PUT: parse the schema; require owner/admin; validate every requested ID is a same-organization role=member; reject mismatches without mutation.
- [ ] In one transaction delete only non-owner rows, upsert the owner row, and create selected member rows with skipDuplicates. Return success and memberIds.
- [ ] Run focused tests; expected: pass.
- [ ] Commit with git commit -m "feat: add account access management API".

## Task 6: Optional sharing UI

**Files:** Create src/components/settings/ShareAccountAccessModal.tsx and its test. Modify AddAccountModal.tsx and settings/accounts/page.tsx.

**Produces:** optional sharing after both connection paths and a later Manage Access action for owners/admins.

- [ ] Write component tests for disabled checked owner, non-admin member rows, close-without-PUT, and PUT body memberIds.
- [ ] Run the component test; expected: fail because the component is absent.
- [ ] Implement props isOpen, accountId, and onClose. Query the access endpoint only while open, render owner and non-admin checkboxes, allow Skip/Close, PUT selected IDs, invalidate accounts/dashboard/emails, and keep the modal open on errors.
- [ ] Add onAccountCreated to AddAccountModal. Pass the returned IMAP account ID through handleSuccess before closing.
- [ ] In settings/accounts/page.tsx, show Connect Account to both roles, add sharingAccountId state, open the modal from the IMAP callback, and read OAuth success/accountId/share parameters before replacing the URL.
- [ ] Show Manage Access only when account.canManageAccess is true. Preserve admin-only edit and disconnect actions.
- [ ] Update the member empty state to invite the user to connect an account.
- [ ] Run the focused component and create-route tests; expected: pass.
- [ ] Commit with git commit -m "feat: add account sharing prompt".

## Task 7: Verification

- [ ] Read the local Next.js route-handler and client-component guides before implementation if not already read.
- [ ] Run npx prisma validate and npx tsc --noEmit; expected: both exit 0.
- [ ] Run all focused access, service, account-route, callback, and modal tests; expected: pass.
- [ ] Run npm test -- --runInBand; expected: all suites pass. Record unrelated pre-existing dirty-test failures without modifying them.
- [ ] Run npm run build; expected: Next.js build succeeds.
- [ ] Run git diff --check and git status --short --untracked-files=all. Confirm no credentials, OAuth tokens, or unrelated files entered feature commits.
