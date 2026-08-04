# App-wide visual refresh design

## Purpose

MailHub is a multi-account email workspace for professionals who need to scan, triage, and answer correspondence quickly. This refresh gives the product a coherent visual identity without changing where anything appears or how any workflow operates.

## Fixed constraint

The current layout is the contract. Component positions, widths, heights, responsive breakpoints, information hierarchy, density behavior, navigation structure, and interaction flows remain unchanged. The implementation may change visual tokens and presentation classes, but it must not reorder elements, introduce new panels, or alter component geometry.

## Direction: quiet correspondence desk

The interface should feel precise, calm, and correspondence-focused: clean paper surfaces, ink-like typography, and restrained postal cues. It should avoid generic dashboard gradients, excessive shadows, glass effects, and decorative animation.

### Color tokens

- Paper — `#FFFFFF`: primary reading and composing surfaces.
- Ledger — `#F6F8FB`: secondary surfaces, sidebars, and grouped controls.
- Ink — `#172033`: primary text and strong icons.
- Pencil — `#667085`: secondary text and metadata.
- Rule — `#DDE3EC`: borders and separators.
- Accent — existing user-selected blue, purple, emerald, or rose theme: actions, focus, selection, and small status details.

Semantic danger, warning, and success colors remain functionally distinct. Email HTML rendering keeps its own content colors so the application theme does not rewrite a sender's message.

### Typography

- Interface and body: Geist Sans, already bundled with the application.
- Major page titles only: a restrained editorial serif stack (`Georgia`, `Times New Roman`, serif), used sparingly to evoke correspondence without reducing scan speed.
- Technical values, shortcuts, and compact metadata: Geist Mono.

The existing type scale and element dimensions remain stable. Changes are limited to family, weight, tracking, color, and line-height where they do not change layout.

### Signature element

Selected rows, active navigation items, and focused correspondence controls use a subtle envelope-fold cue: a small angled accent at an existing edge or a restrained inset highlight. It must remain secondary to the content and must not consume additional space.

## Surface treatment

### Global shell and navigation

Use Ledger for the sidebar and Paper for the main content surface, separated by a crisp Rule border. Active navigation uses a lightly tinted accent surface, stronger Ink text, and the envelope-fold cue. Hover and keyboard-focus states remain clear without moving controls.

### Email lists and viewer

Unread messages use stronger sender and subject weight rather than a heavy colored block. Selected messages use a quiet accent tint and edge cue. Metadata uses Pencil. Dividers stay visible enough to support fast row scanning. The viewer remains a neutral Paper canvas so message content is dominant.

### Compose, search, and modals

Keep all current modal dimensions, drag behavior, resizing, full-screen behavior, and control positions. Refine chrome with clearer title bars, Rule borders, disciplined shadows, consistent control states, and Paper editing surfaces. The compose editor remains visually quiet and does not inherit decorative application styling.

### Settings and account management

Standardize cards, inputs, tabs, badges, destructive actions, and empty states through shared tokens. Group boundaries should be communicated by borders and surface contrast rather than increased spacing or new containers.

### Authentication

Apply the same typography, Paper/Ledger contrast, inputs, buttons, focus states, and restrained postal cue. Existing form placement and responsive behavior remain unchanged.

### Mobile

Retain current breakpoints, mobile header, sidebar overlay, and stacking behavior. Visual tokens and states must match desktop. No new mobile navigation pattern is introduced.

## Motion and interaction

Motion is limited to functional feedback: short color, opacity, and shadow transitions. Existing dashboard value transitions may remain but should use the same timing language. Hover effects must not translate or scale layout-critical controls. `prefers-reduced-motion` continues to disable nonessential motion.

Keyboard focus remains a two-pixel accent outline with sufficient contrast. Selected, unread, error, and disabled states must not rely on color alone.

## Implementation boundaries

1. Introduce semantic design tokens in `globals.css` for surfaces, text, rules, elevation, radius, and motion.
2. Update existing Tailwind classes component by component without changing DOM order or structural sizing classes.
3. Reuse the existing theme provider and accent variables; do not introduce another theme state system.
4. Keep email-content styles isolated from application chrome.
5. Do not change API calls, stores, routing, server components, or data flow.

## Data flow and error handling

This is a presentation-only change. Data flow remains exactly as implemented. Existing loading, empty, validation, success, and failure states retain their behavior; only their visual treatment and clarity may change. Error copy is out of scope unless a visual state currently lacks an actionable label.

## Validation

- Run the existing unit test suite and TypeScript check.
- Build the Next.js application using the repository's installed version and conventions.
- Visually inspect representative routes at desktop and mobile widths: authentication, inbox/list/viewer, compose, search, overview/activity, and each settings area.
- Verify keyboard focus, user-selectable accent themes, comfortable/compact density, modal dragging/resizing, responsive sidebar behavior, and reduced motion.
- Compare before and after screenshots to confirm element positions and primary geometry did not change.

## Out of scope

- Layout redesign or content reordering.
- New features, navigation, workflows, or settings.
- Changes to email delivery, synchronization, account logic, or APIs.
- A dark theme.
- Rebranding the logo or changing user-provided email content.
