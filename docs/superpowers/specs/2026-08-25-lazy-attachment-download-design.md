# Lazy Attachment Download Design

**Date:** 2026-08-25

## Goal

Stop persisting all received-email attachment bytes during synchronization. Keep received attachment metadata and provider references, then download attachment content from IMAP or Gmail only when a user accesses it or when an automated rule forwards the message.

Compose and draft uploads remain temporarily stored locally because they need to be available for sending and draft synchronization.

## Current Context

The application currently parses synchronized messages and writes every parsed attachment to `.storage/attachments`. The attachment API reads those files. Rule-based forwarding sends the message body but does not retrieve or include received attachments.

The workspace already contains uncommitted changes related to attachment storage and access control. The implementation must preserve those edits and adjust the current working-tree behavior rather than assuming a clean baseline.

## Chosen Approach

Use provider-specific lazy retrieval with a shared service:

1. Synchronization stores email metadata, body, and attachment metadata only.
2. Synchronization stores enough provider identity to locate the source message later.
3. Synchronization stores an explicit attachment ordinal and provider-specific MIME/API reference.
4. The download route retrieves the requested attachment through a shared service after authorization.
5. Rule forwarding retrieves all received attachments through the same service and passes them to the sender.
6. Draft and sent attachments continue to use local `storagePath` files.

This approach avoids storing received attachment bytes and avoids downloading unrelated attachments when a user requests one. It is more involved than reparsing a full raw message on demand, but it reduces provider bandwidth and memory usage.

## Data Model

Add nullable fields needed for lazy retrieval:

- Email provider message identity, retaining the exact Gmail message ID when applicable.
- Attachment ordinal within the parsed message.
- IMAP MIME part path, when applicable.
- Gmail attachment ID, when applicable.

Existing `storagePath` remains nullable and is retained for draft/sent attachments and legacy received records. New received-email attachment rows leave it null.

Existing rows must remain readable. If an older received row has no provider reference, the API may use its existing local file as a compatibility fallback. New synchronization must not recreate local files for received attachments.

## Shared Retrieval Interface

Create or extend a server-only attachment retrieval module with a provider-independent operation equivalent to:

```ts
getReceivedAttachment(emailId: string, attachmentId: string): Promise<{
  filename: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
}>;
```

The service owns provider dispatch, source-message lookup, reference validation, and conversion of provider responses into the common result. It must not bypass account access checks; callers perform authorization before invoking it, and the service validates that the attachment belongs to the requested email.

### IMAP

Use the stored account, folder/mailbox, UID, and MIME part path. Open a short-lived authenticated IMAP connection, select the mailbox, and fetch only the requested MIME part. Do not fetch or persist unrelated attachments.

### Gmail

Use the stored exact Gmail message ID and Gmail attachment ID. Fetch the attachment data through the Gmail API and decode it into a `Buffer`. If Gmail exposes the content inline instead of by attachment ID, use the stored part reference to retrieve and decode the inline body data.

## Synchronization Changes

IMAP and Gmail synchronization continue to parse the message envelope/body needed by the application, but attachment content is not written to `.storage/attachments`. The parser/provider mapping must expose stable attachment metadata and the references needed by the retrieval service.

The sync transaction creates or updates attachment metadata and references. It must preserve stable attachment IDs for an existing email where possible, avoid stale rows when the source message's attachment set changes, and never require filesystem work for received attachments.

Any existing missing-file repair path for received messages becomes unnecessary for new records and must not download attachment files as a background repair operation.

## Download API

Keep the existing authorization behavior, including unified-account filtering before attachment lookup. After the email and attachment are proven accessible, use the shared retrieval service. Use the local-file fallback only for legacy records that lack provider references.

Responses:

- `200`: fetched content with safe `Content-Type`, `Content-Disposition`, and actual `Content-Length`.
- `404`: email/attachment is inaccessible, missing, or no longer exists at the provider.
- `502`: provider retrieval failed after the request was authorized.
- `500`: unexpected local server failure.

Filename header construction must avoid header injection and preserve a usable filename for non-ASCII names.

## Forwarding Changes

When a rule contains `forwardTo`, load all received attachment contents using the shared retrieval service before calling the sender. Include the original filename and content type in the sender input.

If any received attachment cannot be retrieved, do not send a partial forward. Log the provider error and report the forwarding failure through the existing rule-processing error path. Body-only forwards remain unchanged for messages without attachments.

Local draft/sent attachments continue to be read from their `storagePath` files.

## Error Handling and Security

- Authorization must complete before provider connections or attachment reads.
- Provider errors must not expose credentials or raw provider responses to the client.
- Attachment references must be scoped to the email and account being served.
- Provider disappearance of a message or attachment is reported as not found to the user.
- Forwarding failures must not silently omit attachments.
- Received attachment content must not be left in durable local storage by synchronization or retrieval.

## Testing

Add or update tests for:

1. IMAP sync creates attachment metadata without writing received attachment files.
2. Gmail sync creates attachment metadata without writing received attachment files.
3. IMAP retrieval selects the requested MIME part.
4. Gmail retrieval decodes the requested attachment.
5. Unauthorized and unified-account requests stop before attachment lookup/provider access.
6. Missing provider content returns the documented not-found behavior.
7. Provider failures map to the documented download error.
8. Rule forwarding includes received attachments.
9. Rule forwarding does not send a partial message when retrieval fails.
10. Draft and sent attachments still use local storage and can be sent/synchronized.
11. Legacy received records can still use the local-file compatibility fallback.

Run the focused Jest suites first, then the complete test suite and the project's type/build checks.

## Scope Boundaries

This change does not alter compose UX, draft autosave payloads, sent-mail storage, email body persistence, provider authentication, or general attachment display behavior beyond switching the content source from local received files to provider retrieval.
