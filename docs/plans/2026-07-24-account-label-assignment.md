# Account Label Quick Assignment Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Enable quick inline label assignment and unassignment directly on account chips via `AccountLabelList.tsx`.

**Architecture:** Update `AccountLabelList` to fetch all labels, derive assigned ones, render interactive tags with hover-unassign buttons, a `+ Tag` / `+ Add Label` trigger, and an accessible search dropdown popover using React Query optimistic updates for `/api/labels/[id]/accounts`.

**Tech Stack:** React 19, TypeScript, Next.js 16, TailwindCSS, `@tanstack/react-query`, `lucide-react`, `react-hot-toast`.

---

### Task 1: Enhance `AccountLabelList` with Quick Label Assignment & Popover Picker

**Files:**
- Modify: `src/components/labels/AccountLabelList.tsx`

**Step 1: Implement label assignment UI, mutation, and popover in `AccountLabelList`**

Add state management for popover open state (`isOpen`) and search query (`search`), query client integration for optimistic label mutations (`PUT /api/labels/[labelId]/accounts`), hover unassign (`×`) buttons on assigned label pills, and a `+ Tag` / `+ Add Label` button that triggers a keyboard-accessible popover list of available labels.

**Step 2: Verify with TypeScript build**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

**Step 3: Commit**

```bash
git add src/components/labels/AccountLabelList.tsx
git commit -m "feat(labels): add quick label assignment to AccountLabelList"
```
