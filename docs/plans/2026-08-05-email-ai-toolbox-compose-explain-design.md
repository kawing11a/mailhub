# Email AI Toolbox, Compose Draft Assistant, & Email Detail Explanation Design

## 1. Overview
This design introduces three AI-powered features to enhance email productivity:
1. **Email AI Toolbox**: A multi-functional action bar / dropdown in email list and email viewer providing quick AI actions (Summarize, Extract Action Items, Tone Analyzer, Translate, Spam Check) and quick batch tools.
2. **AI Draft Assistant in Compose Modal**: An interactive AI writer popover drawer inside `ComposeModal.tsx` for prompt-to-draft generation, tone/length customization, and rewriting/polishing existing draft text.
3. **AI Email Explanation in Email Detail**: An "AI Explain" button in `EmailViewer.tsx` toolbar opening a collapsible side panel/flyout with plain-language summaries, key takeaways, action items, sentiment/urgency, and jargon definitions.

---

## 2. System Architecture & API Endpoints

### 2.1 Backend AI API Routes (`src/app/api/ai/...`)

1. **`POST /api/ai/draft`**:
   - **Input**: `{ prompt: string, tone?: string, length?: string, action?: 'generate' | 'rewrite' | 'expand' | 'shorten' | 'proofread', existingText?: string, replyContext?: { subject: string, body: string } }`
   - **Output**: `{ result: string, status: 'success' }`
   - Uses `summary-service.ts` or new `ai-helper.ts` to query configured LLM provider (OpenAI, Claude, Ollama, or Custom).

2. **`POST /api/ai/explain`**:
   - **Input**: `{ emailId?: string, subject?: string, bodyText?: string }`
   - **Output**: Structured JSON:
     ```json
     {
       "summary": "Plain language explanation...",
       "takeaways": ["Point 1", "Point 2"],
       "actionItems": ["Action item 1"],
       "sentiment": "Urgent / Formal / Friendly",
       "jargon": [{ "term": "ETA", "definition": "Estimated Time of Arrival" }]
     }
     ```

3. **`POST /api/ai/toolbox`**:
   - **Input**: `{ tool: 'extract_tasks' | 'tone_check' | 'translate' | 'spam_check', emailId?: string, text?: string, targetLanguage?: string }`
   - **Output**: Tool-specific structured result object.

---

## 3. UI Component Specifications

### 3.1 Email AI Toolbox (`EmailToolbox.tsx`)
- Placed in `EmailList.tsx` (top toolbar) and `EmailViewer.tsx` (header actions).
- Provides a styled dropdown menu with Lucide icons for AI Quick Tools:
  - ✨ **AI Summarize Selection / Email**
  - 📋 **Extract Action Items**
  - 🎭 **Analyze Tone & Sentiment**
  - 🌐 **Translate Email**
  - 🛡️ **Check Spam & Phishing Risk**

### 3.2 Compose Modal AI Writer (`ComposeAiWriter.tsx`)
- Integrated directly into `ComposeModal.tsx` toolbar beside formatting tools.
- Displays a popover drawer with:
  - **Prompt Input Area**: "What would you like to say?"
  - **Tone Selectors**: Professional, Friendly, Formal, Concise, Persuasive.
  - **Length Controls**: Short, Medium, Detailed.
  - **Actions**: "Generate Draft", "Insert into Editor", "Refine Selection" (Proofread, Expand, Shorten).

### 3.3 Email Detail AI Explanation Panel (`EmailExplainPanel.tsx`)
- Triggered by an **"✨ AI Explain"** button in `EmailViewer.tsx` top toolbar.
- Opens a slick flyout panel alongside the email body featuring:
  - 💡 **Plain English Summary**
  - 📌 **Key Takeaways & Action Items**
  - 🏷️ **Tone & Urgency Badge**
  - 📖 **Jargon & Term Dictionary**

---

## 4. Error Handling & Fallbacks
- Handles missing or invalid LLM API keys gracefully by displaying an inline banner directing users to AI Settings.
- Shows loading spinners and skeleton placeholders during AI generation.
- Supports provider fallbacks (e.g. OpenAI -> Ollama/Claude if configured).

---

## 5. Verification Plan
- Unit tests for backend AI API handlers (`draft`, `explain`, `toolbox`).
- UI testing for modal drawer rendering, prompt generation insertion into rich text editor, and explanation flyout toggling.
