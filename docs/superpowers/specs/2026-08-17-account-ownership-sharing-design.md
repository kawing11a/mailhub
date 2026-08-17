# Email Account Ownership and Sharing Design

**Date:** 2026-08-17  
**Status:** Approved for implementation planning

## Goal

Update email-account setup so organization admins and members can connect accounts, the user who authorizes a new account becomes its owner, and the owner can optionally share the account with non-admin members immediately after setup.

This is the first permission-focused subproject. The broader dashboard, search, label, member-settings, rules, experimental, signature, and AI restrictions will build on this account-access foundation in later work.

## Confirmed behavior

- Admins and members can add Google, Microsoft, and custom IMAP/SMTP accounts.
- The user who authorizes a new account becomes its owner.
- The owner automatically receives access.
- Owner access is mandatory and cannot be removed.
- Admins automatically have access to every organization account.
- Existing accounts without an owner are assigned to the earliest-joined admin in their organization.
- After either OAuth or IMAP/SMTP setup succeeds, the application may show a sharing prompt.
- The sharing prompt can be skipped or closed.
- The sharing prompt lists only non-admin organization members.
- Owners can manage access only for accounts they own.
- Admins can manage access for every account.
- A member who is not an account owner cannot modify that account's access.
- Account editing and account deletion remain admin-only in this subproject.

## Data model

`EmailAccount` gains an owner reference to the organization member who owns it. The relation must use the account's `organizationId` and owner user ID together so an account cannot reference a user outside its organization.

The existing `MemberEmailAccountAccess` table remains the explicit access list for non-admin members. New-account creation writes the owner relation and the owner's access row in one transaction. Admins do not require access rows because their organization role grants access automatically.

The migration backfills owner data for existing accounts by selecting the earliest-joined admin in each organization, then ensures those owners have access rows. The migration must fail clearly if an organization has an ownerless account and no admin, rather than assigning an invalid owner.

## Authorization rules

Account access is evaluated centrally and reused by account APIs:

| Actor | Account access | Access-management rights |
| --- | --- | --- |
| Admin | Every account in the organization | Every account |
| Owner | The owned account, plus any other explicitly granted accounts | Owned accounts only |
| Non-owner member | Only accounts with an explicit access row | None for non-owned accounts |
| User outside organization | No access | None |

The owner is always treated as having access even if an access row is missing due to legacy data. The mutation endpoint still creates or restores the owner row and rejects attempts to remove it.

OAuth callbacks derive the acting user from the verified session token. Client-provided OAuth state may carry connection-form values needed to complete the flow, but it must not determine ownership or organization membership.

If OAuth authorization resolves to an existing account, an admin or that account's owner may reauthorize it. A non-owner member must receive an authorization error and must not update the account's stored credentials.

## Connection flow

### OAuth

1. A member or admin opens Connect Account and chooses Google or Microsoft.
2. The user enters the display label and starts OAuth.
3. The callback authenticates the session and validates the organization context.
4. For a new address, the callback creates the account with the authenticated user as owner, grants owner access, and queues initial sync.
5. For an existing address, the callback first verifies admin or owner rights, then updates credentials without changing ownership.
6. The callback redirects to the accounts page with the account ID and a share-prompt flag only when a new account was created.
7. The accounts page opens the optional sharing modal only for a newly created account, not for reauthorization.

### Custom IMAP/SMTP

1. A member or admin enters account details and tests credentials.
2. Successful testing enables account creation.
3. `POST /api/accounts` creates the account, assigns the authenticated user as owner, creates owner access, and queues initial sync transactionally.
4. The response includes the sanitized account ID.
5. The accounts page opens the optional sharing modal using that ID.

The duplicate-account response remains a conflict. A duplicate IMAP submission must not update the existing account or change ownership.

## Sharing UI and API

The sharing modal is account-centric rather than member-centric. It shows the account being shared, the current non-admin members with checkboxes, and the owner as a selected, disabled entry. Closing the modal leaves the account owner-only.

The modal uses:

- `GET /api/accounts/[id]/access` to load the account owner and eligible non-admin members with their current access state.
- `PUT /api/accounts/[id]/access` with the selected non-admin user IDs to replace that account's member access.

The access endpoint must verify:

- The account belongs to the authenticated user's organization.
- The actor is an admin or the account owner.
- Every selected user is a non-admin member of the same organization.
- The owner cannot be removed.

The existing admin member-to-account endpoint may remain for the existing admin members screen, but the new account-centric endpoint is the authority for owner-driven sharing.

## Account visibility and API enforcement in this phase

The existing list filtering for member account visibility will be retained and reused. The following account-specific reads and mutations must also enforce the centralized access rule before returning or changing data:

- Account detail reads.
- Account access reads and writes.
- Credential testing when an account ID is involved.
- Reauthorization of an existing OAuth account.

Admin-only edit and delete behavior remains unchanged. This phase does not attempt to complete every downstream account filter listed in the broader member-permission request; those consumers will use the same access helper in follow-up work.

## Error handling

- Unauthenticated requests return the existing authentication response.
- Non-members of the organization receive a forbidden response for account operations.
- Non-owner members attempting access changes receive a forbidden response.
- Attempts to remove the owner receive a validation error.
- Invalid or cross-organization account/user IDs are rejected without partial writes.
- Duplicate account creation returns the existing conflict response.
- OAuth rejection, invalid state, token exchange failure, and unauthorized reauthorization redirect to the existing accounts error flow without exposing credentials.
- Owner/access creation and initial account persistence must be atomic; queueing initial sync happens only after a successful persistence transaction.

## Testing strategy

Add or update tests for:

- Schema migration/backfill behavior for existing ownerless accounts.
- Member and admin account creation.
- Automatic owner relation and owner access creation.
- OAuth new-account ownership for Google and Microsoft.
- Existing-account reauthorization allowed for owner/admin and rejected for non-owner member.
- Access list filtering to non-admin same-organization members.
- Owner access being immutable.
- Owner access-management authorization and admin override.
- Cross-organization account and user rejection.
- Account detail access enforcement.
- The optional sharing prompt opening after both OAuth and IMAP setup and remaining skippable.

Verification will include the focused Jest tests, the repository's type/build checks, and a manual or automated UI check of both connection paths where provider credentials are available.

## Out of scope

This subproject does not implement the remaining member restrictions in the original request, including system-vs-personal dashboard data, search scoping across all endpoints, label visibility/creation semantics, hiding member settings, hiding rules and experimental pages, or account-scoped AI/signature enforcement. Those changes will be separate follow-up work built on the ownership/access foundation here.
