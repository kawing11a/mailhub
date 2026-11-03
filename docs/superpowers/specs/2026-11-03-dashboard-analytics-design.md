# Dashboard Analytics Design

## Goal

Replace the current message feed dashboard with a privacy-preserving operational overview for account owners and organization admins.

## Approved experience

Keep the existing My Data / System scope switch. My Data is limited to accounts the signed-in user can access. System is available to admins and is restricted to the current organization.

The dashboard presents:

- Account health: total, active, attention needed, and last successful sync, identified by the account's configured label.
- Email analysis: daily received and sent counts for the last seven days, plus unread count and unread share.
- System health in the admin System view: CPU, memory, disk, live network receive/send rate, and existing sync/search queue counts.
- A refreshed-at timestamp and clear unavailable states when a host measurement cannot be collected.

The dashboard must not display or return email subjects, snippets, body text, sender/recipient details, activity metadata, or account email addresses. The API should return only aggregate email metrics, account labels and health fields, and authorized system metrics. Existing role and accessible-account checks remain in force.

## Data and implementation boundaries

The dashboard API remains a Next.js Route Handler and remains uncached. The route calculates email aggregates from the authenticated account filter. System resource collection belongs in a server-only helper so host-specific probing and fallbacks do not leak into the UI or user-scope response. The page renders aggregates and status rows only; it does not fetch individual emails.

Resource readings describe the runtime/container hosting the web application and its mounted storage. Network is shown as a live receive/send rate when the runtime exposes usable interface counters. Unsupported readings are represented as unavailable, never fabricated. Queue health remains sourced from BullMQ counts. Resource values are returned only for an authorized admin System-scope request.

## Refresh and failure behavior

Continue the current ten-second dashboard refresh. If an individual host metric is unavailable, render that metric as unavailable while preserving the remaining dashboard. If aggregate data cannot be loaded, preserve the current page-level error behavior. Do not include provider error messages or email data in metric responses.

## Suggested future widgets

Possible follow-up widgets are storage growth over time, provider breakdown, sync success/failure trend, and oldest account sync age. They are recommendations and are outside this change.

## Review checklist

- No message-level fields are selected by or returned from the dashboard endpoint.
- A member cannot retrieve organization-wide data or system metrics.
- Email metrics follow accessible-account scope for members and organization scope for admins.
- Runtime metrics degrade per metric when unsupported.
- The seven-day trend, unread share, account health, and system health are understandable without opening messages.
