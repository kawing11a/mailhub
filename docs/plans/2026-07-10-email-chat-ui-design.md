# Email as a Chat UI Design

## Overview
This feature introduces a "Chat Mode" to the email thread view, parsing long, heavily quoted email chains into clean chat bubbles. This makes reading back-and-forth email communications much faster and visually similar to modern messaging apps like Slack or WhatsApp.

## Architecture & Approach
We have selected **Approach 2 (Client-Side Parsing)** for the initial rollout, which allows us to deliver the feature quickly without backend changes. We have also defined a roadmap to upgrade to **Approach 1 (Server-Side Parsing)** in the future for better performance.

### 1. User Interface
- **Toggle Button**: A toggle will be added to the top of the email thread view (e.g., switching between a "Mail" icon and a "Message Circle" icon).
- **State Persistence**: The user's preference (Chat vs. Classic Mode) will be saved in local state (e.g., Zustand or localStorage) to persist across different email threads.
- **Chat Bubbles**: In Chat Mode, the interface will render emails as chat bubbles. The current user's replies will appear on the right side in a primary color, and incoming emails from others will appear on the left in a neutral color.

### 2. Client-Side Parsing (Initial Engine)
- A utility function (e.g., `parseEmailToChat()`) will run on the frontend when Chat Mode is active.
- This function will process the raw HTML/text email body and strip out:
  - Blockquotes (`<blockquote>`)
  - Horizontal rules
  - Standard reply boilerplate ("On [Date], [Name] wrote:")
  - Common email signatures
- A lightweight library like `email-reply-parser` (adapted for the browser) or custom regex utilities will handle the text extraction.

## Roadmap to Server-Side Parsing
To ensure maximum scalability and rendering performance, the feature will eventually be upgraded to parse emails on the backend.

- **Phase 1 (Current Rollout)**: Client-side parsing only. Zero database or backend changes required.
- **Phase 2 (Backend Upgrade)**: Update the Prisma schema to add a `chatBody` string field to the `EmailBody` model. The BullMQ email ingestion worker will be updated to run the parsing utility upon fetching new emails, saving the clean text to the database.
- **Phase 3 (Frontend Cutover)**: The frontend will be updated to consume `email.body.chatBody` directly, removing the client-side parsing overhead.
