import {
  EmailEvaluationInput,
  EmailRuleDefinition,
  RuleActions,
  RuleCriterion,
} from './types';
import { getReceivedAttachment } from '@/lib/email/attachment-retrieval';

/**
 * Converts Prisma JSON address fields into the shape accepted by the rule engine.
 */
export function normalizeEmailAddressField(
  value: unknown
): EmailEvaluationInput['toAddresses'] {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return null;

  if (value.every((item) => typeof item === 'string')) {
    return value as string[];
  }

  const normalized: Array<{ address?: string; name?: string }> = [];
  for (const item of value) {
    if (typeof item === 'string') {
      normalized.push({ address: item });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

    const record = item as Record<string, unknown>;
    const address = typeof record.address === 'string' ? record.address : undefined;
    const name = typeof record.name === 'string' ? record.name : undefined;

    if (address || name) normalized.push({ address, name });
  }

  return normalized;
}

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

  if (rule.accountLabelId) {
    const accountLabelIds = email.accountLabelIds || [];
    if (!accountLabelIds.includes(rule.accountLabelId)) {
      return false;
    }
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
        if (actions.forwardTo && actions.forwardTo.length > 0) {
          const currentFwd = combinedActions.forwardTo || [];
          combinedActions.forwardTo = Array.from(new Set([...currentFwd, ...actions.forwardTo]));
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

/**
 * Processes all active rules for an organization against a freshly ingested email.
 */
export async function processRulesForNewEmail(
  emailId: string,
  accountId: string,
  organizationId: string,
  prismaClient?: any
): Promise<void> {
  const db = prismaClient || (await import('@/lib/db/prisma')).prisma;

  try {
    const rulesRecords = await db.emailRule.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { accountId: null, accountLabelId: null },
          { accountId },
          {
            accountLabel: {
              accountLabels: {
                some: {
                  accountId,
                },
              },
            },
          },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    if (!rulesRecords || rulesRecords.length === 0) return;

    const email = await db.email.findUnique({
      where: { id: emailId },
      include: {
        body: true,
        emailLabels: true,
        attachments: {
          select: {
            id: true,
            filename: true,
            contentType: true,
            sizeBytes: true,
            storagePath: true,
            ordinal: true,
            imapPart: true,
            gmailAttachmentId: true,
          },
        },
        account: { select: { accountLabels: { select: { labelId: true } } } },
      },
    });

    if (!email) return;

    const emailInput: EmailEvaluationInput = {
      id: email.id,
      accountId: email.accountId,
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      toAddresses: normalizeEmailAddressField(email.toAddresses),
      ccAddresses: normalizeEmailAddressField(email.ccAddresses),
      subject: email.subject,
      bodyText: email.body?.bodyText,
      hasAttachments: email.hasAttachments,
      isRead: email.isRead,
      isStarred: email.isStarred,
      isHighRisk: email.isHighRisk,
      accountLabelIds: email.account?.accountLabels.map((accountLabel: any) => accountLabel.labelId) || [],
      labelIds: email.emailLabels.map((el: any) => el.labelId),
    };

    const rulesDefs: EmailRuleDefinition[] = rulesRecords.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      priority: r.priority,
      stopProcessing: r.stopProcessing,
      accountId: r.accountId,
      accountLabelId: r.accountLabelId,
      conditions: r.conditions as any,
      actions: r.actions as any,
    }));

    const { matchedRules, combinedActions } = evaluateRulesAgainstEmail(emailInput, rulesDefs);

    if (matchedRules.length === 0) return;

    await applyRuleActions(emailId, combinedActions, db);

    // Handle Forwarding Action
    if (combinedActions.forwardTo && combinedActions.forwardTo.length > 0) {
      try {
        const { sendEmail } = await import('@/lib/smtp/sender');
        const fromDisplay = email.fromName
          ? `"${email.fromName}" <${email.fromAddress}>`
          : email.fromAddress || 'Unknown';

        const fwdSubject = email.subject?.startsWith('Fwd:')
          ? email.subject
          : `Fwd: ${email.subject || '(No Subject)'}`;

        const quoteHtml = `
          <p>---------- Forwarded message ---------<br/>
          <b>From:</b> ${fromDisplay}<br/>
          <b>Subject:</b> ${email.subject || '(No Subject)'}<br/>
          <b>Date:</b> ${new Date().toLocaleString()}<br/>
          </p>
          ${email.body?.bodyHtml || email.body?.bodyText || ''}
        `;

        const forwardedAttachments =
          email.attachments && email.attachments.length > 0
            ? await Promise.all(
                email.attachments.map(async (attachment: any) => {
                  const retrieved = await getReceivedAttachment(email.id, attachment.id);

                  return {
                    filename: retrieved.filename,
                    contentType: retrieved.contentType,
                    content: retrieved.content,
                  };
                })
              )
            : [];

        await sendEmail(accountId, {
          to: combinedActions.forwardTo,
          subject: fwdSubject,
          bodyHtml: quoteHtml,
          bodyText: `---------- Forwarded message ---------\nFrom: ${fromDisplay}\nSubject: ${email.subject || ''}\n\n${email.body?.bodyText || ''}`,
          ...(forwardedAttachments.length > 0 ? { attachments: forwardedAttachments } : {}),
        });

        console.log(`[EmailRule] Forwarded email ${emailId} to ${combinedActions.forwardTo.join(', ')}`);
      } catch (fwdErr) {
        console.error(`[EmailRule] Error forwarding email ${emailId}:`, fwdErr);
      }
    }
  } catch (err) {
    console.error(`[EmailRule] Error processing rules for email ${emailId}:`, err);
  }
}

