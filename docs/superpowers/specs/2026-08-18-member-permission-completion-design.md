# Member Permission Completion Design

Date: 2026-08-18
Status: Approved design

## Goal

Complete the organization member-permission model so administrators retain organization-wide access while non-admin members see and operate only on accounts, emails, labels, signatures, and AI features they are authorized to use.

## Scope

This follow-up includes:

1. Integrating the existing account ownership/sharing implementation into the current main branch.
2. Enforcing account visibility consistently across dashboard, search, labels, signatures, and AI features.
3. Restricting member-only and admin-only settings pages and APIs.
4. Adding regression coverage for direct API access and UI navigation behavior.

The existing account-health and other dirty worktree changes are preserved and are not redesigned here.

## Permission model

- An administrator can access every email account in the same organization.
- A non-admin member can access an account only when they own it or have an explicit member access row.
- Organization membership and role are checked server-side for every protected API.
- UI visibility is convenience only; APIs independently enforce authorization.
- Account ownership/access changes are managed only by administrators or the account owner.
- The owner always retains access.

## Resource rules

### Dashboard

- Admins may request system or personal scope.
- Members requesting system scope receive HTTP 403.
- Member personal scope uses only accessible accounts.
- Counts, activity, recent emails, and account summaries all share the same account filter.

### Search

- Admins search all organization accounts.
- Members search only emails whose account is accessible to them.
- Search filters are applied in the API/search backend, not only in the client.

### Labels

- Admins see all organization labels and account assignments.
- Members see a label when at least one attached account is accessible to them.
- Members may create labels.
- Members may modify labels they can see.
- Members may attach only accessible accounts to labels.
- Member responses never reveal inaccessible label-account assignments.

### Settings

- Members do not see or access the Members management page/API.
- Members do not see or access Email Rules page/API.
- Members do not see or access Experimental page/API.
- Members retain access to account settings, accessible labels, signatures, preferences, and security settings according to each resource's authorization.
- Admin-only account edit/disconnect behavior remains unchanged.

### Signatures

- Members have full CRUD access to signatures for accessible accounts.
- Members receive 403 or 404 according to the existing resource-boundary convention for inaccessible accounts.
- Admins can manage signatures for every organization account.

### AI

- Every AI operation that acts on stored email/account data must carry or derive an account/email/label identifier.
- The server verifies that the referenced resource belongs to an accessible account before invoking the AI operation.
- Members may use summaries, explanations, drafting context, toolbox operations, and related AI features only for accessible accounts.
- Admins may use AI features across the organization.
- Requests with missing or inaccessible resource context fail safely before any model call.

## Architecture

### Shared authorization

Extend the existing account-access predicate module with reusable helpers:

- account visibility filter for a user;
- account access assertion for a specific account;
- accessible-account ID lookup where a backend requires a list;
- admin-only assertion for restricted settings.

All new route handlers use these helpers rather than duplicating role conditions.

### API boundaries

- Prisma queries include organization and account-access conditions at the query boundary.
- Search applies account filters before returning results.
- Label queries filter through label-account relations.
- Signature queries filter through account visibility.
- Rules and experimental routes reject non-admin members before database mutation.
- AI routes authorize resource IDs before reading email content or calling the provider.

### UI boundaries

- Settings navigation is role-aware.
- Restricted pages still render a server/client authorization fallback when opened directly.
- Member pages use the same API behavior as admins but receive filtered data.
- Existing account sharing UI remains the access-management entry point for owners/admins.

## Integration strategy

The prior account ownership/sharing branch is integrated first, preserving current main-branch changes. Conflicts are resolved by retaining existing account-health fields and behavior while applying owner/access fields and authorization predicates. No broad reset, checkout, or destructive cleanup is allowed.

## Error behavior

- Unauthenticated requests retain existing 401 behavior.
- Cross-organization or inaccessible resource requests use the existing route convention, with 403 for authenticated forbidden actions and 404 where resource concealment is already established.
- Restricted settings APIs return 403 for authenticated members.
- AI authorization failures happen before model calls.
- No credentials, tokens, or inaccessible account metadata are returned in errors or responses.

## Testing strategy

Add focused API tests for:

- member versus admin dashboard scopes;
- search account filtering;
- label visibility, mutation, and account-assignment restrictions;
- signature account filtering;
- rules and experimental member rejection;
- AI inaccessible-account rejection;
- direct access to restricted settings routes;
- preservation of admin organization-wide behavior.

Run existing account ownership/access tests after integration, then run the full Jest suite, Prisma validation/generation, TypeScript, and production build. Existing unrelated failures are recorded rather than modified unless they directly block this feature.

## Out of scope

- Redesigning account-health behavior.
- Replacing the search provider.
- Changing the AI provider or prompt content.
- Changing organization membership roles or invitation workflows.
- Changing administrator capabilities.

## Review follow-up report — 2026-08-18

- Closed the empty-list access-management disclosure in `PUT /api/org/members/[userId]/accounts` for non-admin actors when the target only owns inaccessible accounts.
- Added a regression test covering `accountIds: []` against a target with only an inaccessible owned account; expected result is HTTP 403 with no transaction.
- Focused verification run: `npm test -- --runTestsByPath src/__tests__/app/api/org-member-accounts-route.test.ts` → 9 tests passed.

