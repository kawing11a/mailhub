import { NextResponse, NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth/middleware';
import { evaluateRule } from '@/lib/rules/engine';
import { EmailEvaluationInput, EmailRuleDefinition } from '@/lib/rules/types';
import { z } from 'zod';

const testRuleSchema = z.object({
  rule: z.object({
    name: z.string().optional(),
    isActive: z.boolean().optional().default(true),
    priority: z.number().optional().default(0),
    accountId: z.string().optional().nullable(),
    conditions: z.object({
      matchType: z.enum(['ALL', 'ANY']),
      criteria: z.array(
        z.object({
          field: z.enum(['from', 'to', 'cc', 'subject', 'body', 'hasAttachment', 'hasLabelId']),
          operator: z.enum([
            'contains',
            'not_contains',
            'equals',
            'not_equals',
            'starts_with',
            'ends_with',
            'matches_regex',
          ]),
          value: z.union([z.string(), z.boolean()]),
        })
      ),
    }),
    actions: z.object({
      addLabelIds: z.array(z.string()).optional(),
      removeLabelIds: z.array(z.string()).optional(),
      markAsRead: z.boolean().optional(),
      markAsStarred: z.boolean().optional(),
      markAsHighRisk: z.boolean().optional(),
      triggerWebhookId: z.string().optional(),
    }),
  }),
  sampleEmail: z.object({
    accountId: z.string().optional(),
    fromAddress: z.string().optional().nullable(),
    fromName: z.string().optional().nullable(),
    toAddresses: z.any().optional(),
    ccAddresses: z.any().optional(),
    subject: z.string().optional().nullable(),
    bodyText: z.string().optional().nullable(),
    hasAttachments: z.boolean().optional(),
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    isHighRisk: z.boolean().optional(),
    labelIds: z.array(z.string()).optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const json = await req.json();
    const result = testRuleSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const { rule, sampleEmail } = result.data;

    const ruleDef: EmailRuleDefinition = {
      name: rule.name || 'Test Rule',
      isActive: true,
      priority: rule.priority || 0,
      accountId: rule.accountId || null,
      conditions: rule.conditions as any,
      actions: rule.actions as any,
    };

    const isMatch = evaluateRule(sampleEmail as EmailEvaluationInput, ruleDef);

    return NextResponse.json({
      matched: isMatch,
      actionsToApply: isMatch ? rule.actions : null,
    });
  } catch (error) {
    console.error('Test rule error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
