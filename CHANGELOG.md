# Changelog

All notable changes to **Mailhub** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
