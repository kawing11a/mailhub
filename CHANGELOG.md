# Changelog

All notable changes to **Mailhub** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-09-03

### Added
- **AI Email Assistance** - label summaries, message explanations, compose/rewrite tools, action-item and tone analysis, translation, and configurable OpenAI-compatible providers.
- **Summary Notifications** - deliver generated label summaries through Telegram, WeCom, or generic webhooks, with per-channel delivery tracking.
- **Email Automation Rules** - ordered rules with organization, account, and account-label scopes; `ALL`, `ANY`, and unconditional matching; label, read, star, risk, webhook, and forwarding actions.
- **Adaptive Spam Training** - train from spam/ham feedback and import or export the portable classifier dataset.
- **Account Ownership and Sharing** - explicit account owners and granular per-member mailbox access across dashboard, search, labels, signatures, AI, and mail operations.
- **Lazy Attachment Retrieval** - keep provider references instead of storing every received attachment locally, then download on demand or when forwarding.
- **Credential Testing** - verify IMAP and SMTP settings before saving an account.

### Fixed
- Email sync now bounds database and persistence concurrency, retries transient PostgreSQL failures, and advances sync watermarks only after complete persistence.
- Initial sync jobs now use partition-specific queues and deterministic job IDs while preserving existing `workerPartition` assignments and forwarding legacy jobs safely.
- Gmail polling no longer overlaps per account; IMAP connections now reconnect on errors and periodically reconcile missed messages.
- Tightened account-level authorization across settings, API routes, notifications, OAuth callbacks, AI operations, and related mailbox resources.
- Improved Gmail mailbox matching, attachment-provider error reporting, outbound mail validation, and admin bootstrap consistency.
- Excluded local worktrees, mail storage, certificates, and development metadata from the Docker build context.
- Removed unused legacy IMAP packages and pruned development dependencies from the runtime Docker image.

### Changed
- Updated Next.js to `16.3.4`, aligned its ESLint configuration, and refreshed TipTap, Mailparser, and Tailwind dependencies to security-fixed releases.
- Refresh-token handling now retries expired API requests automatically, with a seven-day access-token and one-month refresh-token window.
- AI summarization uses cleaned email text, adaptive chunking, and Meilisearch with a database fallback for larger workloads.
- Added database pool, sync concurrency, provider polling, and reconciliation controls to `.env.example` and documented worker partition capacity planning.
- Updated `docker-compose.yml` image tags and Docker examples to `kawing11a/mailhub:0.1.5`.

### Upgrade notes
- Run `npx prisma migrate deploy` before starting the new web and worker containers. This release adds account ownership, user-scoped push subscriptions, email rules, AI experiment/notification data, and lazy attachment reference fields.
- Keep a worker running for every `workerPartition` already assigned to an email account; adding workers does not rebalance existing accounts automatically.

## [0.1.4] - 2026-08-04

### Added
- **Flexible Compose Window** - compose can now be centered, moved, resized, or expanded to fullscreen, with the editor adapting to the available width.

### Fixed
- **Gmail BCC Delivery** - BCC recipients are preserved in raw messages sent through the Gmail API.
- **Read State Outside the Inbox** - sent and other non-inbox messages no longer appear unread or offer actions that would mark them unread.

### Changed
- Refreshed the application-wide visual system, including navigation, dashboard, authentication, settings, email selection, compose, and overlay surfaces.
- Gmail initial synchronization now imports the complete available message history instead of limiting results to the previous 90 days.
- Updated `docker-compose.yml` image tags to `kawing11a/mailhub:0.1.4`.

## [0.1.3] - 2026-07-31

### Added
- **Fullscreen Compose Modal & Full Width Editor** – expanded the compose window experience to support clean fullscreen writing and auto-expanding rich text editor widths.

### Fixed
- **Filter Scoping for Email Accounts** – quick filters (`readStatus`, `accountScope`, `favouriteEmailsOnly`) are now strictly scoped to unified inbox views (`all` / `new-emails`). Viewing individual email accounts now displays all emails for that account without interference from unified inbox filters.

### Changed
- Updated `docker-compose.yml` image tags to `kawing11a/mailhub:0.1.3`.

## [0.1.2] - 2026-07-30

### Added
- **Email Signatures** – full CRUD management page under Settings; auto-insert on compose with per-account defaults.
- **Signature picker dropdown** in the composer; inline edit modal accessible without leaving the compose window.
- **Rich-text formatting toolbar** in the compose editor (headings, bold, italic, lists, blockquotes, code blocks, links).
- **Image support in signatures** – upload local files or embed via URL.
- **Image resize handles** in the editor – drag corners, paste from clipboard, set quick width presets.
- **ICS calendar event parsing** – visualised inline for `.ics` attachments in email viewer.
- **SMTP sender service** – reliable outbound email delivery with nodemailer integration.

### Fixed
- **Real-time email updates** – SSE `event:` and `data:` fields are now sent in the same block so `new_email` events fire correctly without requiring a manual page refresh.
- Signature auto-insertion no longer duplicates or unexpectedly resets the editor when async network fetches resolve late.
- Fresh `PrismaClient` is instantiated automatically when the cached global instance is missing the signature model.
- Composer default signature insertion works reliably even under async network delays.

### Changed
- `readStatus` filter defaults to `unread` for the All Emails view (previously required manual toggling).
- Signature selector uses a searchable account dropdown instead of horizontal tabs for better scalability.
- Signature modal and settings page redesigned to match app-wide modal standards.
- Email account tags in list and viewer are larger and bolder for improved visibility.
- Updated `docker-compose.yml` image tags to `kawing11a/mailhub:0.1.2`.

## [0.1.1] - 2026-07-29
### Changed
- Defaulted `readStatus` filter in `EmailList` component to `unread` for All Emails view, and `all` for account Inbox view.
- Updated `docker-compose.yml` configuration to use explicit Docker Hub version tags (`kawing11a/mailhub:0.1.1`).

## [0.1.0] - 2026-07-29

### Added
- **Initial Open Source Release** of Mailhub self-hosted email management web platform.
- Multi-account IMAP synchronization with background sync engine using BullMQ & Redis.
- Full-text search engine integration powered by Meilisearch.
- Fast, responsive Next.js 16 (App Router) interface with modern UI, dark mode, and mobile layout support.
- Attachment handling, draft saving, rich text TipTap editor, label assignment, and account settings interface.
- Admin setup CLI script (`npm run create-admin`) for easily configuring user credentials.
- Containerized deployment files (`Dockerfile`, `docker-compose.yml`).
- Published Docker Hub image (`kawing11a/mailhub:v0.1.0` and `kawing11a/mailhub:latest`).
