# Email AI Toolbox, Compose AI Draft, & Email Detail Explanation Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build AI-driven features for Email Manager: an AI Toolbox action menu, an AI Draft Writer in Compose Modal, and an AI Explanation panel in Email Detail.

**Architecture:** Extend backend Next.js API routes with `/api/ai/draft`, `/api/ai/explain`, and `/api/ai/toolbox` using the existing multi-provider LLM infrastructure (`summary-service.ts` / `callLlmApi`). Create modular frontend components (`EmailToolbox.tsx`, `ComposeAiWriter.tsx`, `EmailExplainPanel.tsx`) integrated cleanly into `EmailList.tsx`, `ComposeModal.tsx`, and `EmailViewer.tsx`.

**Tech Stack:** Next.js (App Router, API Routes), TypeScript, Tailwind CSS / Vanilla CSS, React, Lucide Icons, Jest / React Testing Library.

---

### Task 1: Backend AI API Routes (`/api/ai/draft`, `/api/ai/explain`, `/api/ai/toolbox`)

**Files:**
- Create: `src/lib/ai/llm-client.ts`
- Create: `src/app/api/ai/draft/route.ts`
- Create: `src/app/api/ai/explain/route.ts`
- Create: `src/app/api/ai/toolbox/route.ts`
- Create: `src/__tests__/app/api/ai/ai-routes.test.ts`

**Step 1: Write failing unit tests for AI API endpoints**
Create test file `src/__tests__/app/api/ai/ai-routes.test.ts` mocking fetch/LLM responses to verify endpoint requests for draft generation, email explanation, and toolbox tools.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/app/api/ai/ai-routes.test.ts`

**Step 3: Implement LLM client helper and API endpoints**
- Implement `src/lib/ai/llm-client.ts` reusing provider configuration (OpenAI, Claude, Ollama).
- Implement `src/app/api/ai/draft/route.ts` (drafting & rewriting).
- Implement `src/app/api/ai/explain/route.ts` (plain language breakdown, takeaways, action items, sentiment, jargon).
- Implement `src/app/api/ai/toolbox/route.ts` (tone check, extract action items, translate, spam check).

**Step 4: Run test to verify pass**
Run: `npx jest src/__tests__/app/api/ai/ai-routes.test.ts`

**Step 5: Commit**
`git add src/lib/ai/llm-client.ts src/app/api/ai/ src/__tests__/app/api/ai/`
`git commit -m "feat(ai): add backend AI API endpoints for draft, explain, and toolbox"`

---

### Task 2: AI Compose Draft Assistant (`ComposeAiWriter.tsx`)

**Files:**
- Create: `src/components/email/ComposeAiWriter.tsx`
- Modify: `src/components/email/ComposeModal.tsx`
- Create: `src/__tests__/components/email/ComposeAiWriter.test.tsx`

**Step 1: Write failing test for ComposeAiWriter component**
Test rendering of prompt input, tone/length selectors, draft generation API call, and insertion callback.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/components/email/ComposeAiWriter.test.tsx`

**Step 3: Implement ComposeAiWriter component & integrate into ComposeModal**
- Build `ComposeAiWriter.tsx` drawer/popover.
- Integrate trigger button and state into `ComposeModal.tsx`.

**Step 4: Run test to verify pass**
Run: `npx jest src/__tests__/components/email/ComposeAiWriter.test.tsx`

**Step 5: Commit**
`git add src/components/email/ComposeAiWriter.tsx src/components/email/ComposeModal.tsx src/__tests__/components/email/ComposeAiWriter.test.tsx`
`git commit -m "feat(compose): add AI Draft Writer assistant to ComposeModal"`

---

### Task 3: Email Detail AI Explanation Panel (`EmailExplainPanel.tsx`)

**Files:**
- Create: `src/components/email/EmailExplainPanel.tsx`
- Modify: `src/components/email/EmailViewer.tsx`
- Create: `src/__tests__/components/email/EmailExplainPanel.test.tsx`

**Step 1: Write failing test for EmailExplainPanel**
Test rendering of summary, key takeaways, action items, sentiment badge, and jargon terms.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/components/email/EmailExplainPanel.test.tsx`

**Step 3: Implement EmailExplainPanel and integrate into EmailViewer**
- Build collapsible/flyout `EmailExplainPanel.tsx`.
- Add "✨ AI Explain" button to `EmailViewer.tsx` toolbar to toggle the panel.

**Step 4: Run test to verify pass**
Run: `npx jest src/__tests__/components/email/EmailExplainPanel.test.tsx`

**Step 5: Commit**
`git add src/components/email/EmailExplainPanel.tsx src/components/email/EmailViewer.tsx src/__tests__/components/email/EmailExplainPanel.test.tsx`
`git commit -m "feat(email): add AI Explanation side panel to EmailViewer"`

---

### Task 4: Email AI Toolbox (`EmailToolbox.tsx`)

**Files:**
- Create: `src/components/email/EmailToolbox.tsx`
- Modify: `src/components/email/EmailList.tsx`
- Modify: `src/components/email/EmailViewer.tsx`
- Create: `src/__tests__/components/email/EmailToolbox.test.tsx`

**Step 1: Write failing test for EmailToolbox component**
Test rendering of AI quick tool options and trigger handlers.

**Step 2: Run test to verify failure**
Run: `npx jest src/__tests__/components/email/EmailToolbox.test.tsx`

**Step 3: Implement EmailToolbox component & integrate into EmailList & EmailViewer**
- Build `EmailToolbox.tsx` popover menu.
- Integrate into top actions of `EmailList.tsx` and `EmailViewer.tsx`.

**Step 4: Run test to verify pass**
Run: `npx jest src/__tests__/components/email/EmailToolbox.test.tsx`

**Step 5: Commit**
`git add src/components/email/EmailToolbox.tsx src/components/email/EmailList.tsx src/components/email/EmailViewer.tsx src/__tests__/components/email/EmailToolbox.test.tsx`
`git commit -m "feat(email): add Email AI Toolbox dropdown menu"`
