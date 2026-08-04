# AI Email Summary by Labels & Webhook Notifications Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement an experimental AI-powered email summarization engine that summarizes emails under specified labels and dispatches formatted summaries to configured notification webhooks (Telegram, WeCom, Generic Webhook).

**Architecture:** Asynchronous background processing leveraging BullMQ and Redis queues (`src/worker.ts`), with configurable LLM providers (OpenAI, Claude, Ollama, Custom API) and multi-channel webhook notification adapters.

**Tech Stack:** Next.js 16 (App Router), Prisma ORM, BullMQ, Redis, React 19, Tailwind CSS, TypeScript.

---

### Task 1: Database Schema & Prisma Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Test/Run: `npx prisma db push` or `npx prisma migrate dev`

**Step 1: Update Prisma schema**
Add `ExperimentSetting`, `NotificationWebhook`, and `EmailSummaryRun` models to `prisma/schema.prisma`.

**Step 2: Run Prisma DB Push / Migration**
Run command: `npx prisma db push`
Expected output: Prisma schema updated successfully and client generated.

**Step 3: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(db): add ExperimentSetting, NotificationWebhook, and EmailSummaryRun models"
```

---

### Task 2: Notification Webhook Adapters

**Files:**
- Create: `src/lib/notifications/types.ts`
- Create: `src/lib/notifications/telegram-adapter.ts`
- Create: `src/lib/notifications/wecom-adapter.ts`
- Create: `src/lib/notifications/generic-adapter.ts`
- Create: `src/lib/notifications/index.ts`
- Create: `src/__tests__/lib/notifications/webhook-adapters.test.ts`

**Step 1: Write failing tests for Webhook Adapters**
Test formatting and HTTP payload structure for Telegram (Markdown `chat_id`), WeCom (`msgtype: markdown`), and Generic Webhooks.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/lib/notifications/webhook-adapters.test.ts`
Expected: FAIL with missing modules.

**Step 3: Implement Webhook Adapters**
Implement `sendTelegramNotification`, `sendWeComNotification`, and `sendGenericWebhookNotification`.

**Step 4: Run tests to verify pass**
Run: `npx jest src/__tests__/lib/notifications/webhook-adapters.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/notifications/ src/__tests__/lib/notifications/
git commit -m "feat(notifications): implement Telegram, WeCom, and Generic webhook adapters"
```

---

### Task 3: AI LLM Summarization Service

**Files:**
- Create: `src/lib/ai/summary-service.ts`
- Create: `src/__tests__/lib/ai/summary-service.test.ts`

**Step 1: Write failing test for LLM Summary Service**
Mock fetch/API responses and test prompting, message formatting, and handling custom/OpenAI/Ollama endpoints.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/lib/ai/summary-service.test.ts`
Expected: FAIL with module not found.

**Step 3: Implement LLM Summary Service**
Implement `generateEmailBatchSummary` supporting configurable provider, API key, base URL, and model.

**Step 4: Run test to verify pass**
Run: `npx jest src/__tests__/lib/ai/summary-service.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/ai/summary-service.ts src/__tests__/lib/ai/
git commit -m "feat(ai): implement multi-provider LLM email summarization service"
```

---

### Task 4: BullMQ Queue & Background Worker Handler

**Files:**
- Create: `src/lib/queue/summary-queue.ts`
- Modify: `src/worker.ts`

**Step 1: Define `email-summary-queue` BullMQ Queue**
Create queue instance and producer helpers in `src/lib/queue/summary-queue.ts`.

**Step 2: Add Worker job processor in `src/worker.ts`**
Attach job handler for `processEmailSummaryJob`:
1. Fetch target emails from Prisma by label ID & filter.
2. Call AI LLM Summary Service.
3. Dispatch summary to selected webhook channels via Webhook Adapters.
4. Record execution logs in `EmailSummaryRun`.

**Step 3: Verify worker code builds clean**
Run: `npx tsx --no-warnings src/worker.ts` (dry check/test instantiation)

**Step 4: Commit**
```bash
git add src/lib/queue/summary-queue.ts src/worker.ts
git commit -m "feat(queue): add BullMQ email summary background queue worker"
```

---

### Task 5: Backend API Routes for Experiments & Summarizer

**Files:**
- Create: `src/app/api/experiments/settings/route.ts`
- Create: `src/app/api/experiments/webhooks/route.ts`
- Create: `src/app/api/experiments/webhooks/[id]/route.ts`
- Create: `src/app/api/experiments/webhooks/test/route.ts`
- Create: `src/app/api/experiments/summary/trigger/route.ts`
- Create: `src/app/api/experiments/summary/[id]/route.ts`

**Step 1: Implement Experimental Settings API**
`GET` and `PUT` handlers for organization AI settings.

**Step 2: Implement Webhook Management & Test API**
Handlers for listing, creating, deleting, and testing webhooks.

**Step 3: Implement Summary Trigger & Status API**
`POST /api/experiments/summary/trigger` (enqueues job) and `GET /api/experiments/summary/[id]` (polls status).

**Step 4: Commit**
```bash
git add src/app/api/experiments/
git commit -m "feat(api): add REST endpoints for experiment settings, webhooks, and summary job trigger"
```

---

### Task 6: Experimental Settings UI Page

**Files:**
- Create: `src/app/(dashboard)/settings/experiments/page.tsx`
- Modify: `src/app/(dashboard)/settings/layout.tsx`

**Step 1: Add "Experimental" tab to settings layout navigation**
Modify navigation tabs array in `src/app/(dashboard)/settings/layout.tsx`.

**Step 2: Build Experimental Settings UI component**
Include AI Config Card (Provider selector, API key input, base URL, model name, test button) and Webhook Channels Card (Add Webhook Modal, active channels list, test message trigger, delete action).

**Step 3: Test route rendering**
Verify `/settings/experiments` renders cleanly without layout shift or errors.

**Step 4: Commit**
```bash
git add src/app/\(dashboard\)/settings/
git commit -m "feat(ui): add Experimental settings tab with AI provider & Webhook configuration"
```

---

### Task 7: "Summarize by Label" Modal & UI Action

**Files:**
- Create: `src/components/labels/summarize-label-modal.tsx`
- Modify: `src/app/(dashboard)/labels/page.tsx`
- Modify: `src/components/labels/label-header-actions.tsx` (if present)

**Step 1: Create `SummarizeLabelModal` Component**
Build modal with label selector, time range filter, email limit dropdown, webhook destination checkboxes, live progress status polling, and markdown summary display with copy button.

**Step 2: Add "AI Summary" trigger button to Labels views**
Attach trigger button on label management page and label headers.

**Step 3: Commit**
```bash
git add src/components/labels/ src/app/\(dashboard\)/labels/
git commit -m "feat(ui): add Summarize by Label modal with real-time job progress and results view"
```

---

### Task 8: End-to-End Verification

**Step 1: Build & Type Check**
Run: `npm run build`
Expected: Successful Next.js production build without TypeScript or linting errors.

**Step 2: Run Unit & Integration Tests**
Run: `npm test`
Expected: All tests pass cleanly.

**Step 3: Final Commit**
```bash
git commit -m "chore: complete AI email summary by labels and webhook notifications feature"
```
