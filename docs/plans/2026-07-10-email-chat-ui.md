# Email as a Chat UI Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement a toggleable "Chat Mode" in the email viewer that parses and displays email bodies as clean chat bubbles.

**Architecture:** We will add a `chatMode` toggle to the `uiStore`, create a client-side parser utility using regex/string splitting, and update `EmailViewer.tsx` to optionally render the parsed text as chat bubbles.

**Tech Stack:** React, Next.js, Tailwind CSS, Zustand, lucide-react

---

### Task 1: Add Chat Mode State

**Files:**
- Modify: `src/stores/uiStore.ts`

**Step 1: Write the failing test**

*(No test needed for simple Zustand store addition).*

**Step 2: Run test to verify it fails**
N/A

**Step 3: Write minimal implementation**

Update `uiStore.ts` to include `chatMode` state.

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  showAvatars: boolean;
  setShowAvatars: (show: boolean) => void;
  timeFormat: '12h' | '24h';
  setTimeFormat: (format: '12h' | '24h') => void;
  chatMode: boolean;
  setChatMode: (val: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      showAvatars: true,
      setShowAvatars: (show) => set({ showAvatars: show }),
      timeFormat: '12h',
      setTimeFormat: (format) => set({ timeFormat: format }),
      chatMode: false,
      setChatMode: (val) => set({ chatMode: val }),
    }),
    { name: 'ui-storage' }
  )
);
```

**Step 4: Run test to verify it passes**
N/A

**Step 5: Commit**

```bash
git add src/stores/uiStore.ts
git commit -m "feat: add chatMode to uiStore"
```

### Task 2: Create Email Parser Utility

**Files:**
- Create: `src/lib/email/parser.ts`

**Step 1: Write the failing test**
*(Skipping explicit unit tests for brevity, will test manually in UI).*

**Step 2: Run test to verify it fails**
N/A

**Step 3: Write minimal implementation**

Create a simple utility to extract the visible text from an email and strip quotes/signatures.

```typescript
export function parseEmailToChat(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const cleanLines = [];
  for (const line of lines) {
    if (line.match(/^On .* wrote:/) || line.startsWith('>')) {
      break; 
    }
    if (line.trim() === '--' || line.trim() === '---') {
      break; 
    }
    cleanLines.push(line);
  }
  return cleanLines.join('\n').trim();
}
```

**Step 4: Run test to verify it passes**
N/A

**Step 5: Commit**

```bash
git add src/lib/email/parser.ts
git commit -m "feat: add simple email reply parser utility"
```

### Task 3: Update EmailViewer UI

**Files:**
- Modify: `src/components/email/EmailViewer.tsx`

**Step 1: Write the failing test**
N/A

**Step 2: Run test to verify it fails**
N/A

**Step 3: Write minimal implementation**

Add the toggle button to the header and render chat bubbles if `chatMode` is true. Include `MessageCircle` in lucide imports.

```tsx
import { MessageCircle } from 'lucide-react';
import { parseEmailToChat } from '@/lib/email/parser';
```

Extract state:
```tsx
const { showAvatars, timeFormat, chatMode, setChatMode } = useUIStore();
```

In the action bar (before the Reply button), add toggle:
```tsx
<button 
  onClick={() => setChatMode(!chatMode)}
  className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" 
  title={chatMode ? "Switch to Classic View" : "Switch to Chat View"}
>
  {chatMode ? <Mail className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
</button>
<div className="w-px h-6 bg-gray-200 mx-1" />
```

In Body Content:
```tsx
<div className={`flex-1 overflow-y-auto ${chatMode ? 'bg-gray-50 p-6' : 'p-6'}`}>
  {chatMode ? (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex justify-start">
        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-200 max-w-[85%]">
          <div className="text-xs text-gray-500 mb-1 font-medium">{email.fromName || email.fromAddress}</div>
          <div className="whitespace-pre-wrap font-sans text-gray-800 text-sm">
            {parseEmailToChat(email.body?.bodyText || '') || 'Empty message.'}
          </div>
        </div>
      </div>
    </div>
  ) : (
    email.body?.bodyHtml ? (
      <iframe
        title="Email Content"
        className="w-full h-full border-none bg-white"
        srcDoc={email.body.bodyHtml}
        sandbox="allow-popups allow-same-origin"
      />
    ) : (
      <div className="whitespace-pre-wrap font-sans text-gray-800 bg-white">
        {email.body?.bodyText || 'Empty message.'}
      </div>
    )
  )}
</div>
```

**Step 4: Run test to verify it passes**
N/A

**Step 5: Commit**

```bash
git add src/components/email/EmailViewer.tsx
git commit -m "feat: integrate chat mode UI in email viewer"
```
