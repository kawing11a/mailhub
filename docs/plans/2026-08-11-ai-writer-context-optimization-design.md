# AI Writer Context Extraction & Optimization Design

## Problem Statement
When generating AI draft replies in the compose modal, referencing the previous email's body currently includes raw HTML, CSS style blocks, scripts, and massive inline base64 images (`data:image/*;base64,...`). This bloats the request payload and prompt context sent to LLMs, resulting in:
1. LLM context length exceeded errors or payload size rejections.
2. High token costs and slow generation latency.
3. Confusion in LLM output due to CSS stylesheets, tracking pixels, and messy raw HTML tags.

## Goals
1. Extract clean, useful plain-text content from raw email HTML and text bodies.
2. Strip out base64 images, style sheets, script tags, SVG graphics, HTML comments, and unnecessary markup.
3. Preserve essential formatting (paragraphs, lists, blockquote structure, line breaks).
4. Decode all HTML entities properly into human-readable characters.
5. Provide a resilient multi-layer architecture (frontend pre-cleaning + backend API sanitization & intelligent truncation).

---

## Architecture & Data Flow

```
[EmailViewer / EmailList]
         │ (Reply / Reply All / Forward)
         ▼
[extractCleanEmailText(email.body.bodyHtml)]
         │
         ▼
[ComposeModal -> composeDraft.replyToBody]
         │
         ▼
[ComposeAiWriter]
         │ (JSON payload: clean replyContext.body & currentContent)
         ▼
[/api/ai/draft]
         │ (extractCleanEmailText backend validation & max-length protection)
         ▼
[LLM Call (llm-client)]
         │
         ▼
[Clean, High-Quality AI Draft Generated]
```

---

## Component Details

### 1. Dedicated Clean Text Extractor (`src/lib/email/clean-text.ts`)
- Function `extractCleanEmailText(input?: string | null, options?: { maxLength?: number; preserveParagraphs?: boolean }): string`
- Transformations:
  - Remove `<script>`, `<style>`, `<head>`, `<svg>`, `<noscript>`, `<meta>`, `<xml>` blocks.
  - Remove `<!-- comments -->`.
  - Strip inline base64 images (`<img src="data:...">`) and general `<img>` tags.
  - Convert `<br>`, `</p>`, `</div>`, `</tr>`, `</li>`, `</blockquote>`, `</h1-6>` into clean line breaks.
  - Convert `<li>` to bullet lists `- `.
  - Decode HTML entities (numeric, hex, and named entities).
  - Normalize whitespace, collapse redundant empty lines.
  - Truncate cleanly if exceeding `maxLength` (default 4,000 characters) with truncation notice.

### 2. Frontend Dispatchers (`EmailViewer.tsx`, `EmailList.tsx`, `ComposeModal.tsx`)
- In `EmailViewer.tsx` and `EmailList.tsx`:
  - Populate `replyToSubject` and `replyToBody` when initiating Reply, Reply All, or Forward actions.
  - `replyToBody` uses `email.body?.bodyText` or `extractCleanEmailText(email.body?.bodyHtml)`.
- In `ComposeModal.tsx`:
  - Pass `replySubject={composeDraft?.replyToSubject || composeDraft?.subject}`.
  - Pass `replyBody={composeDraft?.replyToBody || extractCleanEmailText(composeDraft?.bodyHtml)}`.

### 3. Backend AI Route Protection (`/api/ai/draft/route.ts`, `/api/ai/explain/route.ts`, `/api/ai/toolbox/route.ts`)
- In `/api/ai/draft/route.ts`:
  - Clean `replyContext.body` and `existingText` using `extractCleanEmailText` before formatting into prompt.
- In `/api/ai/explain/route.ts` and `/api/ai/toolbox/route.ts`:
  - Clean `bodyText` / `text` before sending to the LLM.

---

## Testing & Verification Plan
1. **Unit Tests for Extractor** (`src/__tests__/lib/email/clean-text.test.ts`):
   - Test stripping inline base64 images and styles.
   - Test HTML entity decoding (`&amp;`, `&quot;`, `&#39;`, `&nbsp;`, unicode).
   - Test paragraph and list structure preservation.
   - Test max length truncation.
2. **API Route Tests** (`src/__tests__/app/api/ai/ai-routes.test.ts`):
   - Verify `/api/ai/draft` sanitizes bloated HTML with base64 images before calling LLM.
   - Verify existing AI explain/toolbox tests pass with clean text.
3. **Full Test Suite & Build Verification**:
   - Run `npm test` to ensure all tests pass.
