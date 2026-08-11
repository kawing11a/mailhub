# AI Writer Context Optimization Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Extract clean, useful plain-text from email HTML, images, and attachments before passing previous reply context into AI writer and related AI tools to eliminate context bloat and improve generation quality.

**Architecture:** A reusable, robust email text extraction utility (`src/lib/email/clean-text.ts`) strips scripts, styles, embedded base64 data URLs, and HTML boilerplate while converting paragraphs and lists into clean markdown/text and enforcing safety character caps. Frontend composers (`ComposeModal.tsx`, `ComposeAiWriter.tsx`, `EmailViewer.tsx`, `EmailList.tsx`) and backend AI API endpoints (`/api/ai/draft`, `/api/ai/explain`, `/api/ai/toolbox`) integrate this extractor for defense-in-depth.

**Tech Stack:** Next.js App Router, TypeScript, Jest, Tiptap.

---

### Task 1: Create Clean Text Extractor Utility with Unit Tests

**Files:**
- Create: `src/lib/email/clean-text.ts`
- Test: `src/__tests__/lib/email/clean-text.test.ts`

**Step 1: Write the failing unit tests**
Create `src/__tests__/lib/email/clean-text.test.ts` to test:
- Stripping `<script>`, `<style>`, `<head>`, `<svg>`, `<noscript>`, and comments.
- Stripping inline base64 images (`<img src="data:image/png;base64,...">`) and regular `<img>` tags.
- Converting `<p>`, `<div>`, `<br>`, `<li>` into natural paragraph breaks and bullet points.
- Decoding HTML entities (e.g. `&nbsp;`, `&amp;`, `&quot;`, `&#39;`, `&#123;`, `&#x1F600;`).
- Collapsing redundant blank lines and trailing whitespace.
- Truncating text that exceeds `maxLength` with a clean truncation marker.

**Step 2: Run test to verify it fails**
Run: `npm test src/__tests__/lib/email/clean-text.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement `src/lib/email/clean-text.ts`**
Write `extractCleanEmailText(input?: string | null, options?: { maxLength?: number; preserveParagraphs?: boolean }): string` implementing all regex cleaners, entity decoders, paragraph formatters, and truncation.

**Step 4: Run test to verify it passes**
Run: `npm test src/__tests__/lib/email/clean-text.test.ts`
Expected: PASS

---

### Task 2: Backend AI API Route Sanitization

**Files:**
- Modify: `src/app/api/ai/draft/route.ts`
- Modify: `src/app/api/ai/explain/route.ts`
- Modify: `src/app/api/ai/toolbox/route.ts`
- Test: `src/__tests__/app/api/ai/ai-routes.test.ts`

**Step 1: Update API tests to verify bloated HTML with base64 images is sanitized**
Update `src/__tests__/app/api/ai/ai-routes.test.ts` with test cases passing heavy HTML / base64 image content in `replyContext.body` to `/api/ai/draft` and assert the LLM client receives cleaned text.

**Step 2: Run test to verify it fails/passes**
Run: `npm test src/__tests__/app/api/ai/ai-routes.test.ts`

**Step 3: Implement sanitization in AI routes**
In `src/app/api/ai/draft/route.ts`, `src/app/api/ai/explain/route.ts`, and `src/app/api/ai/toolbox/route.ts`, apply `extractCleanEmailText` to all input texts (`replyContext.body`, `existingText`, `bodyText`, `text`).

**Step 4: Run tests to verify all pass**
Run: `npm test src/__tests__/app/api/ai/ai-routes.test.ts`
Expected: PASS

---

### Task 3: Frontend Reply Context Sanitization

**Files:**
- Modify: `src/components/email/EmailViewer.tsx`
- Modify: `src/components/email/EmailList.tsx`
- Modify: `src/components/email/ComposeModal.tsx`
- Modify: `src/components/email/ComposeAiWriter.tsx`
- Test: `src/__tests__/components/email/ComposeAiWriter.test.ts`

**Step 1: Update frontend components to supply clean `replyToBody` and clean `replyContext`**
- In `EmailViewer.tsx`: set `replyToSubject` and `replyToBody: email.body?.bodyText || extractCleanEmailText(email.body?.bodyHtml)` for reply, reply-all, and forward actions.
- In `EmailList.tsx`: set `replyToSubject` and `replyToBody: fullEmail.body?.bodyText || extractCleanEmailText(fullEmail.body?.bodyHtml || fullEmail.snippet)` for reply and forward actions.
- In `ComposeModal.tsx`: pass `replySubject={composeDraft?.replyToSubject || composeDraft?.subject}` and `replyBody={composeDraft?.replyToBody || extractCleanEmailText(composeDraft?.bodyHtml)}`.
- In `ComposeAiWriter.tsx`: ensure clean payload transmission.

**Step 2: Run all tests to verify full project health**
Run: `npm test`
Expected: All test suites PASS
