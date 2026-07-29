# Changelog

All notable changes to **Mailhub** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
