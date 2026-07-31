# Compose Modal Fullscreen, Resizable/Draggable & Content Width Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Refactor `ComposeModal.tsx` and `globals.css` to make the full-screen composer render as a centered Gmail-style modal dialog with a translucent dark backdrop, enable 8-direction resizing and header dragging in all display modes, and remove content width limits (`max-width: 65ch`) so text spans the full available width of the composer modal.

**Architecture:** Update CSS definitions for `.ProseMirror` in `globals.css` to set `max-width: none` and enable text wrapping (`word-break: break-word; overflow-wrap: anywhere;`). Update `ComposeModal.tsx` modal styling calculation to handle Gmail-style centered expanded mode with backdrop overlay, render resize handles and enable dragging across all modes, and add `max-w-none` to editor attributes.

**Tech Stack:** Next.js, React, TipTap, Tailwind CSS, Lucide icons.

---

### Task 1: CSS & TipTap Editor Width Refactor

**Files:**
- Modify: `src/app/globals.css:5-7, 137-146`
- Modify: `src/components/email/ComposeModal.tsx:190-197, 914-917`

**Step 1: Update `src/app/globals.css` ProseMirror rules**
Ensure `.ProseMirror` and editor contents span 100% width without `max-width` limitations:
```css
.ProseMirror {
  width: 100% !important;
  max-width: none !important;
  min-height: 100%;
  box-sizing: border-box;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #374151;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.ProseMirror p, .tiptap p, .prose p, .email-content p {
  max-width: none !important;
}
```

**Step 2: Update TipTap editor attributes in `ComposeModal.tsx`**
Update `editorProps.attributes.class`:
```tsx
attributes: {
  class: 'outline-none focus:outline-none focus-visible:outline-none min-h-[200px] w-full max-w-none px-4 py-3',
},
```
And wrap `EditorContent` div with `w-full max-w-none`.

**Step 3: Verification**
Inspect `ComposeModal.tsx` and check syntax with `npm run build` or dev server.

---

### Task 2: Gmail-Style Centered Fullscreen & Universal Resize/Drag

**Files:**
- Modify: `src/components/email/ComposeModal.tsx:78-158, 509-563, 581-605`

**Step 1: Refactor modal position and style calculation in `ComposeModal.tsx`**
- In `isFullScreen` mode:
  Render centered modal:
  `top: modalPos ? modalPos.y : '50%'`
  `left: modalPos ? modalPos.x : '50%'`
  `transform: modalPos ? 'none' : 'translate(-50%, -50%)'`
  `width: modalSize.w` (default max-width e.g. `min(1200px, 92vw)`),
  `height: modalSize.h` (default height e.g. `min(860px, 88vh)`),
  `borderRadius: '12px'`,
  `boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'`.
- Render semi-transparent dark backdrop overlay (`<div className="fixed inset-0 bg-black/40 z-40" onClick={() => setIsFullScreen(false)} />`) when `isFullScreen` is true.

**Step 2: Enable Drag & Resize in both floating and expanded modes**
- Allow `handleHeaderMouseDown` and `handleResizeMouseDown` to run regardless of `isFullScreen` state.
- Render edge & corner resize handles unconditionally (z-index above contents).
- Maintain minimum resize bounds (`MIN_W = 400`, `MIN_H = 320`).

**Step 3: Test and verify layout, dragging, resizing, and content width**
- Verify floating mode, fullscreen toggle, centered layout, dragging, resizing, and text expansion across full editor width.

---
