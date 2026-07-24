# Account Label Quick Assignment Design

## Goal
Provide a fast, intuitive inline label assignment feature directly within the `AccountLabelList` component. Users can view, assign, and unassign labels for any account without navigating to Settings.

## User Review & Approval
- User approved Option 1: Inline "+ Tag" Button & Dropdown Popover on 2026-07-24.

## UI Specification
1. **Assigned Label Chips**:
   - Render colored tag icon and label name.
   - On hover, show a small `×` button allowing 1-click label removal.
2. **"+ Tag" Trigger Button**:
   - Displayed alongside assigned label chips.
   - Shows `+ Tag` when labels are present, or `+ Add Label` dashed button when 0 labels are assigned.
3. **Dropdown Popover**:
   - Search input for filtering labels.
   - Scrollable list of available organization labels with color indicator and checkbox/check icon for assigned state.
   - Keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter` to toggle, `Escape` to close).

## API & Data Flow
- **Fetch Labels**: `GET /api/labels` via React Query `['labels']`.
- **Toggle Assignment**: `PUT /api/labels/[labelId]/accounts` with updated `accountIds`.
- **Optimistic UI Updates**: Instantly update `['labels']` cache on toggle; rollback on mutation failure and display toast notification.
