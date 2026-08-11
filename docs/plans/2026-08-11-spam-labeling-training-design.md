# Spam Detection Labeling & Continuous Learning System Design

## Problem & Objectives
1. **Interactive Spam Feedback**: When viewing emails (especially flagged high-risk emails), users should easily click **"Definite Spam"** or **"It's Safe"** to correct or reinforce detections.
2. **Real-time Online Training**: Every labeling action should immediately train the spam detection model for future email syncs and checks.
3. **Generic & Portable Dataset**: The training data and model state must be structured as a generic, portable JSON format that can be exported, copied, and imported into any other environment (e.g. dev, staging, production, or client instances).
4. **Hybrid Detection Engine**: Combines an ultra-fast local Bayesian statistical classifier (updated instantly on user feedback) with an optional LLM fallback for ambiguous cases.

---

## Architecture & Data Flow

```
[User in EmailViewer]
        │
        ├── Clicks "Definite Spam" or "It's Safe"
        ▼
[POST /api/ai/spam/label]
        │
        ├── 1. Saves training sample (subject, sender, tokens, label)
        ├── 2. Incrementally retrains Bayesian Token & Domain Weights
        ├── 3. Updates Email.isHighRisk & riskReason in Database
        ▼
[Spam Model State (Persisted in DB / Portable JSON Store)]
        │
        ▼ (Used during IMAP/Gmail Sync & Manual Checks)
[checkIsHighRisk(subject, snippet, fromAddress)]
        │
        ├── Step 1: Run Local Bayesian Classifier (<1ms, offline)
        ├── Step 2: If score >= 0.80 -> High Risk (Spam)
        ├── Step 3: If score <= 0.20 -> Safe (Ham)
        └── Step 4: If ambiguous (0.20 - 0.80) -> LLM Fallback (if enabled)
```

---

## Generic Portable JSON Schema

```json
{
  "version": "1.0",
  "exportedAt": "2026-08-11T20:45:00.000Z",
  "stats": {
    "totalSpam": 28,
    "totalHam": 95,
    "vocabularySize": 1420
  },
  "samples": [
    {
      "id": "c6a1b2...",
      "label": "spam",
      "fromAddress": "lottery@winner-notification.xyz",
      "fromDomain": "winner-notification.xyz",
      "subject": "URGENT: Claim your $1,000,000 prize now",
      "snippet": "Congratulations! Click here to claim your cash award.",
      "tokens": ["urgent", "claim", "$", "1,000,000", "prize", "cash", "award"],
      "createdAt": "2026-08-11T20:40:00.000Z"
    }
  ],
  "modelState": {
    "spamCount": 28,
    "hamCount": 95,
    "tokenSpamCounts": {
      "prize": 20,
      "claim": 18,
      "wire": 12,
      "lottery": 15
    },
    "tokenHamCounts": {
      "invoice": 32,
      "meeting": 28,
      "standup": 18,
      "report": 25
    },
    "domainScores": {
      "winner-notification.xyz": 0.98,
      "github.com": 0.02
    }
  }
}
```

---

## Component Breakdown

### 1. Spam Classifier Engine (`src/lib/ai/spam-classifier.ts`)
- **`tokenizeEmailText(text, fromAddress)`**: Extracts normalized unigrams, bigrams, domain features, currency symbols, and urgency indicators.
- **`calculateSpamProbability(tokens, modelState)`**: Computes token spam probabilities using smoothed Bayesian ratios and combines the strongest signals.
- Returns `{ isSpam: boolean, score: number, confidence: number, topSpamTriggers: string[], topSafeSignals: string[], reason: string }`.

### 2. Spam Trainer & Storage (`src/lib/ai/spam-trainer.ts` & `src/lib/ai/spam-store.ts`)
- **`recordSpamLabel({ emailId, subject, snippet, fromAddress, label, organizationId })`**:
  - Tokenizes email metadata.
  - Updates in-memory/persisted model weights (incrementing `tokenSpamCounts`/`tokenHamCounts`).
  - Updates email's `isHighRisk` flag in Prisma.
- **`exportGenericSpamData()`**: Exports full portable JSON dataset.
- **`importGenericSpamData(jsonData)`**: Merges or replaces dataset and rebuilds model state.
- **`getSpamStats()`**: Returns current counts and top spam/ham keywords.

### 3. API Endpoints
- **`POST /api/ai/spam/label`**: Label an email as `'spam'` or `'ham'` and triggers training.
- **`GET /api/ai/spam/dataset`**: Exports portable generic dataset JSON.
- **`POST /api/ai/spam/dataset`**: Imports generic dataset JSON from another environment.
- **`GET /api/ai/spam/stats`**: Retrieves stats and top tokens.

### 4. UI Enhancements
- **`EmailViewer.tsx`**:
  - In Security Warning Banner: Add **"Definite Spam"** (red) and **"It's Safe"** (green) buttons.
  - In Email actions dropdown: Add **"Report as Spam"** and **"Mark as Safe"** for any email.
  - Show instant training confirmation toast with model feedback.
- **`SpamSettingsTab.tsx` / Settings**:
  - Displays Model statistics: Total spam vs safe training samples, top spam keywords.
  - **Export Dataset Button**: Download `spam-training-data.json`.
  - **Import Dataset Button**: Drag-and-drop / file upload to import dataset from another environment.

---

## Verification & Testing Plan
1. **Unit Tests for Classifier & Trainer (`src/__tests__/lib/ai/spam-classifier.test.ts`)**:
   - Test tokenization with symbols, domains, and text.
   - Test Bayesian scoring on spam vs ham samples.
   - Test incremental training after labeling.
   - Test export and import of generic JSON dataset across environments.
2. **API Endpoint Tests (`src/__tests__/app/api/ai/spam-routes.test.ts`)**:
   - Test labeling emails as spam/ham.
   - Test dataset export & import.
3. **Integration with `checkIsHighRisk`**:
   - Verify `checkIsHighRisk` utilizes learned token weights.
4. **Full Test Suite Verification**:
   - Run `npm test` to ensure 100% test pass rate.
