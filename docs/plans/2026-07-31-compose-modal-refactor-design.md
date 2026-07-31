# Compose Modal Fullscreen, Resizable/Draggable, & Content Width Design

## Overview
Refactor `ComposeModal.tsx` and `globals.css` to enhance the user experience of the email composition modal in three key areas:
1. Fullscreen mode styled as a centered Gmail-style modal instead of filling `90vw x 90vh` anchored at top/left `5%`.
2. Enable resizing and dragging seamlessly across modes.
3. Remove character width limits (`max-width: 65ch` / prose constraints) so email content expands across the entire composer width.

## Proposed Changes

### 1. CSS & TipTap Content Width (`src/app/globals.css`)
- Update `.ProseMirror` styling to set `width: 100% !important; max-width: none !important; word-break: break-word; overflow-wrap: anywhere;`.
- Ensure headings, paragraphs, and lists inside `.ProseMirror` take up full available width.

### 2. Composer Modal (`src/components/email/ComposeModal.tsx`)
- **Fullscreen Mode**:
  - Render as a centered modal with backdrop overlay `bg-black/40` when expanded.
  - Positioning: `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` or explicit calculated position.
  - Dimensions default: `w-[min(1200px,92vw)] h-[min(860px,88vh)]` with `rounded-xl shadow-2xl`.
- **Drag & Resize**:
  - Enable header dragging and edge/corner resize handles in both standard and expanded modes.
  - Keep modal bounds within reasonable min constraints (`minWidth: 400px`, `minHeight: 320px`).
- **Editor Attributes**:
  - Add `w-full max-w-none` to the TipTap editor attributes class.

## Verification Plan
- Launch and verify composer in default floating state.
- Test drag-to-move from header.
- Test 8-direction resize handles.
- Toggle fullscreen mode to verify centered Gmail-style layout and dark backdrop overlay.
- Type long continuous text and formatted blocks to verify full-width line spanning without 65ch column wrapping.
