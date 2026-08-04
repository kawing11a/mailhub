# App-wide Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every MailHub surface the approved “quiet correspondence desk” visual identity while preserving the current layout, positions, geometry, workflows, and data flow.

**Architecture:** Add semantic presentation tokens and reusable visual utility classes in `globals.css`, then migrate existing Tailwind presentation classes in bounded surface groups. Do not change component structure, state, props, API calls, responsive breakpoints, sizing, spacing, ordering, or email-content rendering.

**Tech Stack:** Next.js 16.2.9, React 19.2.4, TypeScript, Tailwind CSS 4, Geist fonts, Jest 30, Playwright-based browser inspection through the existing local-app QA workflow.

## Global Constraints

- Preserve component positions, widths, heights, responsive breakpoints, information hierarchy, density behavior, navigation structure, and interaction flows.
- Use Paper `#FFFFFF`, Ledger `#F6F8FB`, Ink `#172033`, Pencil `#667085`, and Rule `#DDE3EC` as semantic visual tokens.
- Preserve the existing blue, purple, emerald, and rose user-selectable accent themes.
- Use Geist Sans for interface text, Geist Mono for compact technical values, and the existing system serif stack only for major page titles.
- Keep sender-provided email HTML styles isolated from application chrome.
- Do not add dependencies, a dark theme, new features, new navigation, new workflows, or API/data changes.
- Avoid layout-affecting hover transforms and respect `prefers-reduced-motion`.
- Read the relevant installed Next.js guides in `node_modules/next/dist/docs/` before editing framework-owned files or conventions.
- Preserve all unrelated working-tree changes and commit only files named by the active task.

---

### Task 1: Establish a visual baseline and semantic token contract

**Files:**
- Modify: `src/app/globals.css`
- Verify: `src/app/layout.tsx`
- Reference: `docs/superpowers/specs/2026-08-04-app-wide-visual-refresh-design.md`

**Interfaces:**
- Consumes: existing `--accent-*`, `--spacing-*`, Geist font variables, and reduced-motion rules.
- Produces: `--surface-paper`, `--surface-ledger`, `--text-ink`, `--text-pencil`, `--border-rule`, `--shadow-float`, `--radius-control`, `--motion-fast`, plus `.app-title`, `.mail-surface`, `.ledger-surface`, `.mail-rule`, `.mail-float`, and `.envelope-active` presentation classes.

- [ ] **Step 1: Capture baseline evidence**

Run the app and capture desktop (`1440x900`) and mobile (`390x844`) screenshots of `/login`, `/inbox`, `/overview`, `/settings/accounts`, and the compose modal. Store them outside the repository in the task visualization directory so no product files are added.

- [ ] **Step 2: Verify the current build before styling**

Run: `npm test -- --runInBand && npx tsc --noEmit && npm run build`

Expected: all Jest suites pass, TypeScript exits 0, and the Next.js production build exits 0. Record any pre-existing failure before changing CSS.

- [ ] **Step 3: Add semantic tokens and utilities**

Append tokens to the existing root theme without replacing accent or density variables:

```css
:root {
  --surface-paper: #ffffff;
  --surface-ledger: #f6f8fb;
  --text-ink: #172033;
  --text-pencil: #667085;
  --border-rule: #dde3ec;
  --shadow-float: 0 18px 48px -24px rgb(23 32 51 / 28%);
  --radius-control: 0.5rem;
  --motion-fast: 150ms;
}

.app-title {
  color: var(--text-ink);
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: -0.025em;
}

.mail-surface { background-color: var(--surface-paper); }
.ledger-surface { background-color: var(--surface-ledger); }
.mail-rule { border-color: var(--border-rule); }
.mail-float { box-shadow: var(--shadow-float); }

.envelope-active {
  box-shadow: inset 3px 0 0 var(--accent-500);
}
```

Expose the five color tokens through `@theme inline` so Tailwind classes can use semantic names. Update `body` to Geist Sans through `var(--font-geist-sans)` with the current fallback stack. Do not touch `.email-content`, `.ProseMirror`, `.tiptap`, or `.prose` color rules in this step.

- [ ] **Step 4: Remove layout movement from shared hover effects**

Change `.dashboard-scope-switch:hover` and `.dashboard-stat-card:hover` to adjust color/shadow only; remove `translate`, `scale`, and any geometry-changing transform. Preserve reduced-motion coverage.

- [ ] **Step 5: Verify the token layer**

Run: `npx tsc --noEmit && npm run build`

Expected: both commands exit 0. Inspect `/login` and `/inbox`; geometry must match baseline because the new utilities are not yet broadly applied.

- [ ] **Step 6: Commit**

```powershell
git add -- src/app/globals.css
git commit -m "style: establish MailHub visual tokens"
```

### Task 2: Restyle the application shell and navigation

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/components/sidebar/Sidebar.tsx`
- Modify: `src/components/sidebar/AccountsSection.tsx`
- Modify: `src/components/sidebar/FolderSection.tsx`
- Modify: `src/components/sidebar/LabelSection.tsx`
- Modify: `src/components/labels/LabelBadge.tsx`
- Modify: `src/components/labels/LabelAssignmentPicker.tsx`
- Modify: `src/components/labels/AccountLabelList.tsx`

**Interfaces:**
- Consumes: semantic utilities and existing accent/density variables from Task 1.
- Produces: consistent Paper/Ledger shell, navigation states, labels, account controls, and mobile sidebar chrome.

- [ ] **Step 1: Record shell invariants**

Before editing, note from browser computed styles: desktop sidebar width, mobile header height, mobile overlay width, and main content top padding. Expected values come from current classes (`w-64`, `h-14`, `w-64`, `pt-14 md:pt-0`) and must remain unchanged.

- [ ] **Step 2: Apply shell surfaces without structural edits**

In the dashboard layout, replace presentation-only `bg-white`, `bg-gray-50`, `border-gray-200`, text gray, and overlay opacity classes with semantic Paper/Ledger/Ink/Pencil/Rule equivalents. Keep every flex, fixed, inset, width, height, padding, breakpoint, z-index, and overflow class unchanged.

- [ ] **Step 3: Apply navigation hierarchy**

Across sidebar sections, use Ledger for the sidebar, Pencil for inactive metadata, Ink for primary labels, accent tint for hover, and `.envelope-active` for selected routes/accounts/folders. Preserve all existing expansion, drag-and-drop, context-menu, account filtering, and badge logic.

- [ ] **Step 4: Normalize label visuals**

Keep label colors and semantic meaning, but standardize border opacity, text contrast, focus rings, and control radius. Do not change badge dimensions, truncation, counts, or picker placement.

- [ ] **Step 5: Verify navigation behavior and geometry**

Run: `npm test -- --runInBand && npx tsc --noEmit`

Browser checks: desktop and mobile sidebar; route selection; account expansion; folder selection; label create/edit; mobile overlay dismissal; blue, purple, emerald, and rose accent themes; compact and comfortable density. Compare the four shell dimensions from Step 1.

- [ ] **Step 6: Commit**

```powershell
git add -- 'src/app/(dashboard)/layout.tsx' src/components/sidebar src/components/labels
git commit -m "style: refine application shell and navigation"
```

### Task 3: Restyle email lists, rows, filters, and the message viewer

**Files:**
- Modify: `src/components/email/EmailList.tsx`
- Modify: `src/components/email/EmailRow.tsx`
- Modify: `src/components/email/EmailViewer.tsx`
- Modify: `src/components/accounts/LabelFilterMenu.tsx`
- Modify: `src/components/accounts/LabelFilterChips.tsx`
- Modify: `src/app/(dashboard)/inbox/page.tsx`
- Modify: `src/app/(dashboard)/all-emails/page.tsx`
- Modify: `src/app/(dashboard)/new-emails/page.tsx`
- Modify: `src/app/(dashboard)/labels/[labelId]/page.tsx`

**Interfaces:**
- Consumes: shell and semantic tokens from Tasks 1–2.
- Produces: consistent read/unread/selected states and a neutral Paper reading surface while preserving all mail actions.

- [ ] **Step 1: Identify state classes before replacement**

Map the existing conditional classes for unread, read, selected, hovered, checked, loading, empty, and error states. Do not merge conditions or change their Boolean expressions.

- [ ] **Step 2: Restyle list chrome and filters**

Use Paper for the list surface, Rule for dividers, Pencil for timestamps/previews, Ink for sender/subject, and accent tint for active filters. Preserve toolbar height, pagination positions, sticky behavior, chips, search/filter behavior, and list widths.

- [ ] **Step 3: Restyle row states**

Unread rows use stronger sender/subject weight plus the existing unread marker. Selected rows use an accent tint and `.envelope-active`; selection must also remain visible through icon/check state so it does not rely on color alone. Remove hover transforms while retaining background and border feedback.

- [ ] **Step 4: Restyle the viewer without touching message content**

Apply Ink/Pencil/Rule tokens to viewer chrome, sender metadata, recipient disclosure, action buttons, attachment cards, and calendar sections. Do not apply application typography or colors inside `.email-content`; preserve sanitization and content rendering exactly.

- [ ] **Step 5: Verify mail workflows**

Run: `npm test -- --runInBand src/__tests__/lib/email src/__tests__/app/api && npx tsc --noEmit`

Browser checks: unified inbox and account inbox; unread/read; selected/unselected; checkbox selection; empty and loading states; message open/close; attachment display; reply/reply-all/forward entry; label filters; compact and comfortable density; mobile list/viewer transition.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/email/EmailList.tsx src/components/email/EmailRow.tsx src/components/email/EmailViewer.tsx src/components/accounts/LabelFilterMenu.tsx src/components/accounts/LabelFilterChips.tsx 'src/app/(dashboard)/inbox/page.tsx' 'src/app/(dashboard)/all-emails/page.tsx' 'src/app/(dashboard)/new-emails/page.tsx' 'src/app/(dashboard)/labels/[labelId]/page.tsx'
git commit -m "style: clarify mail list and reading states"
```

### Task 4: Restyle compose, search, account chooser, and signature overlays

**Files:**
- Modify: `src/components/email/ComposeModal.tsx`
- Modify: `src/components/email/FromAddressSelect.tsx`
- Modify: `src/components/email/SignatureSelect.tsx`
- Modify: `src/components/search/SearchModal.tsx`
- Modify: `src/components/accounts/AllAccountsModal.tsx`
- Modify: `src/components/signatures/SignatureModal.tsx`
- Modify: `src/components/calendar/CalendarEventSection.tsx`
- Modify: `src/components/calendar/CalendarEventTimetable.tsx`

**Interfaces:**
- Consumes: Paper/Ledger/Ink/Pencil/Rule/elevation tokens.
- Produces: one coherent overlay language without changing modal state, placement, dragging, resizing, or editor behavior.

- [ ] **Step 1: Record overlay geometry**

Capture compose default bounds, fullscreen bounds, minimum resize bounds, header height, footer height, and search/account modal widths from current browser computed styles. These become pass/fail geometry checks.

- [ ] **Step 2: Restyle compose chrome**

Use Ink title/recipient text, Pencil metadata, Rule separators, Paper editor, Ledger toolbars, accent focus/primary send button, and `--shadow-float`. Keep all position, transform, width, height, min/max, drag, resize, fullscreen, recipient disclosure, attachment, scheduling, autosave, and send logic unchanged.

- [ ] **Step 3: Restyle overlay controls**

Apply the same visual language to From and Signature selectors, search results and filters, account chooser, signature editor, and calendar event controls. Preserve portal roots, focus management, keyboard shortcuts, result ordering, selection callbacks, and dismiss behavior.

- [ ] **Step 4: Verify overlay workflows**

Run: `npm test -- --runInBand src/__tests__/lib/email src/__tests__/lib/smtp src/__tests__/app/api/send-email-route.test.ts && npx tsc --noEmit`

Browser checks: new compose, reply, reply-all, forward, CC/BCC reveal, attachment add/remove, signature switching, search keyboard navigation, all-account selection, drag, resize, fullscreen, close/reopen, mobile compose, and reduced motion. Compare all geometry recorded in Step 1.

- [ ] **Step 5: Commit**

```powershell
git add -- src/components/email/ComposeModal.tsx src/components/email/FromAddressSelect.tsx src/components/email/SignatureSelect.tsx src/components/search/SearchModal.tsx src/components/accounts/AllAccountsModal.tsx src/components/signatures/SignatureModal.tsx src/components/calendar
git commit -m "style: unify compose and overlay surfaces"
```

### Task 5: Restyle overview, activity, and status surfaces

**Files:**
- Modify: `src/app/(dashboard)/overview/page.tsx`
- Modify: `src/app/(dashboard)/activity/page.tsx`
- Modify: `src/app/(dashboard)/testing/page.tsx`
- Modify: `src/components/pwa/InstallPWAButton.tsx`

**Interfaces:**
- Consumes: `.app-title`, semantic surfaces, Rule, elevation, and motion tokens.
- Produces: correspondence-focused reporting/status pages with unchanged cards, controls, metrics, and refresh logic.

- [ ] **Step 1: Restyle titles and reporting surfaces**

Apply `.app-title` only to existing major page headings. Convert card chrome, switches, chart/list containers, status rows, buttons, and refresh states to semantic tokens. Keep grid/flex layout, card dimensions, metric order, data hooks, scope switching, and refresh behavior unchanged.

- [ ] **Step 2: Restrain motion**

Keep value/panel opacity transitions but remove translate/scale hover movement. Ensure `prefers-reduced-motion` disables shimmer, sheen, and value transitions without removing loading-state meaning.

- [ ] **Step 3: Verify dashboards**

Run: `npm test -- --runInBand && npx tsc --noEmit`

Browser checks: overview scope switch, data refresh, empty/error/loading states, activity list, testing/status controls, PWA install button, desktop/mobile, all accent themes, and reduced motion.

- [ ] **Step 4: Commit**

```powershell
git add -- 'src/app/(dashboard)/overview/page.tsx' 'src/app/(dashboard)/activity/page.tsx' 'src/app/(dashboard)/testing/page.tsx' src/components/pwa/InstallPWAButton.tsx
git commit -m "style: refine dashboard and status surfaces"
```

### Task 6: Restyle settings and account-management workflows

**Files:**
- Modify: `src/app/(dashboard)/settings/layout.tsx`
- Modify: `src/app/(dashboard)/settings/accounts/page.tsx`
- Modify: `src/app/(dashboard)/settings/labels/page.tsx`
- Modify: `src/app/(dashboard)/settings/members/page.tsx`
- Modify: `src/app/(dashboard)/settings/preferences/page.tsx`
- Modify: `src/app/(dashboard)/settings/security/page.tsx`
- Modify: `src/app/(dashboard)/settings/signatures/page.tsx`
- Modify: `src/components/settings/AddAccountModal.tsx`
- Modify: `src/components/settings/EditAccountModal.tsx`
- Modify: `src/components/settings/CreateUserModal.tsx`
- Modify: `src/components/settings/ManageAccountAccessModal.tsx`

**Interfaces:**
- Consumes: app-title, semantic controls, overlay chrome, accent themes, and density settings.
- Produces: consistent settings navigation, cards, forms, badges, warnings, and account/member/signature dialogs.

- [ ] **Step 1: Normalize settings navigation and headings**

Apply `.app-title` to existing major settings headings and semantic active/inactive states to the existing settings navigation. Preserve tabs, route links, widths, sticky behavior, and responsive layout.

- [ ] **Step 2: Normalize cards and forms**

Replace gray presentation classes with Paper/Ledger/Ink/Pencil/Rule equivalents. Standardize existing inputs, selects, toggles, badges, empty states, primary buttons, secondary buttons, and destructive buttons without changing dimensions, labels, validation, submission, or permission logic.

- [ ] **Step 3: Normalize account-management dialogs**

Apply the Task 4 modal language to add/edit account, create user, and account-access dialogs. Keep OAuth, SMTP/IMAP fields, conditional sections, validation, loading, errors, and callbacks unchanged.

- [ ] **Step 4: Verify settings workflows**

Run: `npm test -- --runInBand && npx tsc --noEmit`

Browser checks: every settings route; account add/edit/test; label create/edit/delete; member creation/access management; preferences accent/density changes; password validation; signature create/edit/default; validation, success, error, disabled, and empty states; desktop/mobile.

- [ ] **Step 5: Commit**

```powershell
git add -- 'src/app/(dashboard)/settings' src/components/settings
git commit -m "style: unify settings and account management"
```

### Task 7: Restyle authentication and global feedback

**Files:**
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/register/page.tsx`
- Modify: `src/app/providers.tsx`
- Modify: `src/components/ServiceWorkerRegister.tsx` only if it renders user-visible feedback classes.

**Interfaces:**
- Consumes: semantic tokens and form treatment from Tasks 1 and 6.
- Produces: visually consistent login, registration, toast, and global feedback states.

- [ ] **Step 1: Restyle authentication surfaces**

Use Paper/Ledger surfaces, Ink/Pencil text, Rule inputs, accent primary actions, restrained elevation, and the existing logo. Preserve form placement, widths, labels, field order, validation, submission, redirects, and mobile behavior.

- [ ] **Step 2: Restyle feedback without changing behavior**

Apply semantic colors and border/elevation treatment to user-visible loading, toast, offline, or service-worker feedback already rendered by these files. Keep the three-toast limit, position, durations, and event logic unchanged.

- [ ] **Step 3: Verify authentication and feedback**

Run: `npm test -- --runInBand && npx tsc --noEmit`

Browser checks: login and registration idle/focus/invalid/loading/error states at desktop/mobile widths; keyboard-only flow; visible focus; toast stack and long-message wrapping.

- [ ] **Step 4: Commit**

```powershell
git add -- 'src/app/(auth)' src/app/providers.tsx src/components/ServiceWorkerRegister.tsx
git commit -m "style: align authentication and global feedback"
```

### Task 8: Perform app-wide visual regression and production verification

**Files:**
- Modify only files from Tasks 1–7 when correcting a verified visual inconsistency.
- Do not create snapshot files in the product repository.

**Interfaces:**
- Consumes: the complete visual refresh.
- Produces: verified parity of layout geometry and consistent styling across routes, states, themes, density modes, and viewport sizes.

- [ ] **Step 1: Run the full automated verification gate**

Run: `npm test -- --runInBand`

Expected: all Jest suites and tests pass with zero failures.

Run: `npx tsc --noEmit`

Expected: exit 0 with no TypeScript diagnostics.

Run: `npm run build`

Expected: the Next.js 16.2.9 production build exits 0.

- [ ] **Step 2: Capture after screenshots**

At `1440x900` and `390x844`, capture the same routes and states as Task 1. Add `/activity`, `/settings/preferences`, `/settings/security`, `/settings/signatures`, `/register`, search, and all-account chooser.

- [ ] **Step 3: Compare layout invariants**

For each before/after pair, verify sidebar width, mobile header height, list/viewer split, compose bounds, modal widths, toolbar heights, settings navigation width, form widths, card grids, and responsive breakpoints are unchanged. Any mismatch is a failure unless caused solely by font rasterization; correct the responsible presentation class and repeat Steps 1–3.

- [ ] **Step 4: Audit accessibility and user preferences**

Keyboard through login, sidebar, list, viewer, compose, search, settings, and dialogs. Verify visible focus, non-color selected/unread/error cues, readable contrast, reduced motion, all four accent themes, and both density modes.

- [ ] **Step 5: Audit scope and cleanup**

Run: `git diff --check`

Run: `rg -n "\[DEBUG-" src/app src/components`

Inspect `git diff` and confirm there are no changes to DOM order, layout sizing/position classes, API calls, stores, server logic, dependencies, or email-content color isolation. Remove any temporary instrumentation or screenshot artifacts.

- [ ] **Step 6: Commit verified corrections**

```powershell
git add -- src/app src/components
git commit -m "style: complete app-wide visual consistency pass"
```

- [ ] **Step 7: Final review handoff**

Report the exact test, typecheck, and build counts; list the routes and viewport sizes inspected; link the design and implementation plan; and explicitly note that unrelated pre-existing worktree changes were preserved.
