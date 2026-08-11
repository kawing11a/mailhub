# Spam Detection Labeling & Continuous Learning Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement an interactive spam labeling system ("Definite Spam" / "It's Safe") with real-time continuous Bayesian learning, exportable/importable generic JSON datasets for environment portability, and hybrid detection integrated into sync/check workflows.

**Architecture:** A local Naive Bayes classifier & trainer (`src/lib/ai/spam-classifier.ts`, `src/lib/ai/spam-trainer.ts`, `src/lib/ai/spam-store.ts`) handles feature tokenization, incremental probability adjustments, and portable generic JSON export/import. API routes (`/api/ai/spam/label`, `/api/ai/spam/dataset`, `/api/ai/spam/stats`) handle labeling and dataset migration. Frontend components (`EmailViewer.tsx`, `SpamSettingsTab.tsx`) provide one-click labeling, training status, and dataset management.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Lucide Icons, Jest, React Query.

---

### Task 1: Spam Classifier & Trainer with Portable Generic Dataset (TDD)

**Files:**
- Create: `src/lib/ai/spam-classifier.ts`
- Create: `src/lib/ai/spam-store.ts`
- Create: `src/lib/ai/spam-trainer.ts`
- Create: `src/__tests__/lib/ai/spam-classifier.test.ts`

**Step 1: Write the failing unit tests**
Create `src/__tests__/lib/ai/spam-classifier.test.ts` covering:
- Tokenizing text with financial/urgency indicators, domains, and n-grams.
- Calculating spam probability accurately with default seeds.
- Incremental training: adding a spam sample increases spam probability of its tokens; adding a safe sample decreases it.
- Exporting generic JSON dataset and importing it back, verifying restored model predictions.

**Step 2: Run test to verify it fails**
Run: `npm test src/__tests__/lib/ai/spam-classifier.test.ts`
Expected: FAIL

**Step 3: Implement `spam-classifier.ts`, `spam-store.ts`, and `spam-trainer.ts`**
- Implement tokenizer, probability formulas, model state store (in-memory with seed defaults and persistence), and training functions.

**Step 4: Run test to verify it passes**
Run: `npm test src/__tests__/lib/ai/spam-classifier.test.ts`
Expected: PASS

---

### Task 2: Backend AI Spam API Endpoints & Spam Checker Integration

**Files:**
- Modify: `src/lib/ai/spam-checker.ts`
- Create: `src/app/api/ai/spam/label/route.ts`
- Create: `src/app/api/ai/spam/dataset/route.ts`
- Create: `src/app/api/ai/spam/stats/route.ts`
- Create: `src/__tests__/app/api/ai/spam-routes.test.ts`

**Step 1: Write API tests**
Create `src/__tests__/app/api/ai/spam-routes.test.ts` testing:
- `POST /api/ai/spam/label` (labels email as spam or safe, triggers training, updates email risk flag in DB).
- `GET /api/ai/spam/dataset` (returns generic JSON dataset).
- `POST /api/ai/spam/dataset` (imports JSON dataset and rebuilds model).
- `GET /api/ai/spam/stats` (returns training stats and top tokens).

**Step 2: Implement API routes and enhance `checkIsHighRisk`**
- In `src/lib/ai/spam-checker.ts`, evaluate incoming emails through the learned Bayesian classifier first, falling back to LLM for ambiguous scores.
- Implement the three API routes.

**Step 3: Run API tests to verify they pass**
Run: `npm test src/__tests__/app/api/ai/spam-routes.test.ts`
Expected: PASS

---

### Task 3: Frontend Interactive Labeling & Settings Management

**Files:**
- Modify: `src/components/email/EmailViewer.tsx`
- Create: `src/components/settings/SpamSettingsTab.tsx`
- Modify: `src/app/(dashboard)/settings/experiments/page.tsx`
- Create: `src/__tests__/components/email/SpamFeedback.test.ts`

**Step 1: Implement UI in `EmailViewer.tsx`**
- In Security Warning Banner: Add **"Definite Spam"** (red button) and **"It's Safe"** (green button).
- In Email toolbar / actions: Add quick feedback options to label any email.
- Display instant toast feedback ("Feedback recorded. Model trained for future detections.").

**Step 2: Add Spam Model & Dataset Management in Settings**
- Add stats display (Total spam/ham trained, top keywords).
- Add "Export Training Data (JSON)" and "Import Training Data" file uploader.

**Step 3: Run all tests to verify full project health**
Run: `npm test`
Expected: All test suites PASS
