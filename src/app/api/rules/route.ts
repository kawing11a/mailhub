import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { z } from 'zod';

const ruleCriterionSchema = z.object({
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
});

const ruleConditionsSchema = z.object({
  matchType: z.enum(['ALL', 'ANY']),
  criteria: z.array(ruleCriterionSchema).min(1, 'At least one condition is required'),
});

const ruleActionsSchema = z.object({
  addLabelIds: z.array(z.string().uuid()).optional(),
  removeLabelIds: z.array(z.string().uuid()).optional(),
  markAsRead: z.boolean().optional(),
  markAsStarred: z.boolean().optional(),
  markAsHighRisk: z.boolean().optional(),
  triggerWebhookId: z.string().uuid().optional(),
  forwardTo: z.array(z.string().email()).optional(),
});

const createRuleSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  priority: z.number().int().optional().default(0),
  stopProcessing: z.boolean().optional().default(false),
  accountId: z.string().uuid().optional().nullable(),
  conditions: ruleConditionsSchema,
  actions: ruleActionsSchema,
});

export async function GET(req: NextRequest) {
  try {
    const session = await authenticate(req);
    if (session instanceof Response) return session;
    const adminCheck = requireAdmin(session);
    if (adminCheck) return adminCheck;

    const rules = await prisma.emailRule.findMany({
      where: { organizationId: session.organizationId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: {
        account: {
          select: {
            id: true,
            label: true,
            emailAddress: true,
            color: true,
          },
        },
      },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Fetch rules error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await authenticate(req);
    if (session instanceof Response) return session;
    const adminCheck = requireAdmin(session);
    if (adminCheck) return adminCheck;

    const json = await req.json();
    const result = createRuleSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const {
      name,
      description,
      isActive,
      priority,
      stopProcessing,
      accountId,
      conditions,
      actions,
    } = result.data;

    // If accountId is provided, verify it belongs to the organization
    if (accountId) {
      const account = await prisma.emailAccount.findFirst({
        where: { id: accountId, organizationId: session.organizationId },
      });
      if (!account) {
        return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
      }
    }

    const rule = await prisma.emailRule.create({
      data: {
        organizationId: session.organizationId,
        name,
        description: description || null,
        isActive: isActive ?? true,
        priority: priority ?? 0,
        stopProcessing: stopProcessing ?? false,
        accountId: accountId || null,
        conditions: conditions as any,
        actions: actions as any,
      },
      include: {
        account: {
          select: {
            id: true,
            label: true,
            emailAddress: true,
            color: true,
          },
        },
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Create rule error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
