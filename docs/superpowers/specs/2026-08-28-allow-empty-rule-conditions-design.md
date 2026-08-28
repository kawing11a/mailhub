# Allow Email Rules Without Conditions

## Goal

Allow an email rule to omit all incoming-email criteria. Such a rule matches every incoming email that passes the rule's active and account-scope checks, while continuing to require at least one action.

## Design

Keep the existing rule shape and represent an unconditional rule as:

```json
{
  "conditions": {
    "matchType": "ALL",
    "criteria": []
  }
}
```

The `matchType` remains part of the stored shape for compatibility, but has no effect when `criteria` is empty.

### Form behavior

- New rules continue to start with one editable condition for discoverability.
- The final condition can be removed in the RuleModal.
- Saving with no conditions is allowed.
- The conditions section explains that an empty list applies to all incoming emails.
- The rule summary displays `All incoming emails` for an empty condition list.
- At least one action remains required.

### API and evaluation behavior

- Create, update, and test-rule schemas accept an empty criteria array.
- `evaluateRule` returns `true` for an active, in-scope rule with no criteria.
- Existing `ALL` and `ANY` behavior is unchanged when criteria are present.
- Account and account-label scope checks continue to run before the unconditional match.

## Testing

Add coverage for:

- Evaluating an active unconditional rule as a match.
- Rejecting an unconditional rule outside its account scope.
- Rendering/removing the final form condition and submitting an empty criteria array.
- Accepting empty criteria through the rule API while preserving the existing action validation.
- Displaying the unconditional rule summary.

## Non-goals

- No new rule condition mode or database migration.
- No change to action requirements, rule priority, stop-processing, or scope semantics.
