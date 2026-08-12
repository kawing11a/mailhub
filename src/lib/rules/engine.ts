import {
  EmailEvaluationInput,
  EmailRuleDefinition,
  RuleActions,
  RuleCriterion,
} from './types';

/**
 * Extracts list of email strings from various to/cc formats
 */
function extractEmailStrings(
  input?: Array<{ address?: string; name?: string }> | string[] | string | null
): string[] {
  if (!input) return [];
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return extractEmailStrings(parsed);
    } catch {
      return [input.toLowerCase()];
    }
  }
  if (Array.isArray(input)) {
    const list: string[] = [];
    for (const item of input) {
      if (typeof item === 'string') {
        list.push(item.toLowerCase());
      } else if (item && typeof item === 'object') {
        if (item.address) list.push(item.address.toLowerCase());
        if (item.name) list.push(item.name.toLowerCase());
      }
    }
    return list;
  }
  return [];
}

/**
 * Evaluates a single rule criterion against email properties
 */
export function evaluateCriterion(
  email: EmailEvaluationInput,
  criterion: RuleCriterion
): boolean {
  const { field, operator, value } = criterion;

  if (field === 'hasAttachment') {
    const hasAtt = Boolean(email.hasAttachments);
    const expected = Boolean(value);
    return operator === 'not_equals' ? hasAtt !== expected : hasAtt === expected;
  }

  if (field === 'hasLabelId') {
    const labelList = email.labelIds || [];
    const expected = String(value);
    const hasLabel = labelList.includes(expected);
    return operator === 'not_equals' ? !hasLabel : hasLabel;
  }

  const strVal = String(value || '').toLowerCase();

  // Target text extraction based on field
  let targetTexts: string[] = [];

  switch (field) {
    case 'from':
      if (email.fromAddress) targetTexts.push(email.fromAddress.toLowerCase());
      if (email.fromName) targetTexts.push(email.fromName.toLowerCase());
      break;

    case 'to':
      targetTexts = extractEmailStrings(email.toAddresses);
      break;

    case 'cc':
      targetTexts = extractEmailStrings(email.ccAddresses);
      break;

    case 'subject':
      if (email.subject) targetTexts.push(email.subject.toLowerCase());
      break;

    case 'body':
      if (email.bodyText) targetTexts.push(email.bodyText.toLowerCase());
      break;
  }

  if (targetTexts.length === 0) {
    return operator === 'not_contains' || operator === 'not_equals';
  }

  switch (operator) {
    case 'contains':
      return targetTexts.some((text) => text.includes(strVal));

    case 'not_contains':
      return targetTexts.every((text) => !text.includes(strVal));

    case 'equals':
      return targetTexts.some((text) => text === strVal);

    case 'not_equals':
      return targetTexts.every((text) => text !== strVal);

    case 'starts_with':
      return targetTexts.some((text) => text.startsWith(strVal));

    case 'ends_with':
      return targetTexts.some((text) => text.endsWith(strVal));

    case 'matches_regex':
      try {
        const regex = new RegExp(strVal, 'i');
        return targetTexts.some((text) => regex.test(text));
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Evaluates whether an email matches a given rule
 */
export function evaluateRule(
  email: EmailEvaluationInput,
  rule: EmailRuleDefinition
): boolean {
  if (!rule.isActive) return false;

  // Account Scope check
  if (rule.accountId && email.accountId && rule.accountId !== email.accountId) {
    return false;
  }

  const { matchType, criteria } = rule.conditions;
  if (!criteria || criteria.length === 0) return false;

  if (matchType === 'ANY') {
    return criteria.some((c) => evaluateCriterion(email, c));
  }

  // Default to ALL (AND)
  return criteria.every((c) => evaluateCriterion(email, c));
}

/**
 * Evaluates an ordered list of rules against an email and combines their actions
 */
export function evaluateRulesAgainstEmail(
  email: EmailEvaluationInput,
  rules: EmailRuleDefinition[]
): {
  matchedRules: EmailRuleDefinition[];
  combinedActions: RuleActions;
} {
  const sorted = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const matchedRules: EmailRuleDefinition[] = [];
  const combinedActions: RuleActions = {};

  const addLabelSet = new Set<string>();
  const removeLabelSet = new Set<string>();

  for (const rule of sorted) {
    if (evaluateRule(email, rule)) {
      matchedRules.push(rule);

      const { actions } = rule;
      if (actions) {
        if (actions.addLabelIds) {
          actions.addLabelIds.forEach((id) => addLabelSet.add(id));
        }
        if (actions.removeLabelIds) {
          actions.removeLabelIds.forEach((id) => removeLabelSet.add(id));
        }
        if (actions.markAsRead !== undefined) {
          combinedActions.markAsRead = actions.markAsRead;
        }
        if (actions.markAsStarred !== undefined) {
          combinedActions.markAsStarred = actions.markAsStarred;
        }
        if (actions.markAsHighRisk !== undefined) {
          combinedActions.markAsHighRisk = actions.markAsHighRisk;
        }
        if (actions.triggerWebhookId) {
          combinedActions.triggerWebhookId = actions.triggerWebhookId;
        }
      }

      if (rule.stopProcessing) {
        break;
      }
    }
  }

  if (addLabelSet.size > 0) {
    combinedActions.addLabelIds = Array.from(addLabelSet);
  }
  if (removeLabelSet.size > 0) {
    combinedActions.removeLabelIds = Array.from(removeLabelSet);
  }

  return { matchedRules, combinedActions };
}

/**
 * Applies combined rule actions on an email in the database
 */
export async function applyRuleActions(
  emailId: string,
  actions: RuleActions,
  prisma: any
): Promise<void> {
  const emailUpdateData: Record<string, any> = {};

  if (actions.markAsRead !== undefined) {
    emailUpdateData.isRead = actions.markAsRead;
  }
  if (actions.markAsStarred !== undefined) {
    emailUpdateData.isStarred = actions.markAsStarred;
  }
  if (actions.markAsHighRisk !== undefined) {
    emailUpdateData.isHighRisk = actions.markAsHighRisk;
  }

  if (Object.keys(emailUpdateData).length > 0) {
    await prisma.email.update({
      where: { id: emailId },
      data: emailUpdateData,
    });
  }

  // Remove labels
  if (actions.removeLabelIds && actions.removeLabelIds.length > 0) {
    await prisma.emailLabel.deleteMany({
      where: {
        emailId,
        labelId: { in: actions.removeLabelIds },
      },
    });
  }

  // Add labels
  if (actions.addLabelIds && actions.addLabelIds.length > 0) {
    await prisma.emailLabel.createMany({
      data: actions.addLabelIds.map((labelId) => ({
        emailId,
        labelId,
      })),
      skipDuplicates: true,
    });
  }
}
