import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/auth/middleware';
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

const updateRuleSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  stopProcessing: z.boolean().optional(),
  accountId: z.string().uuid().optional().nullable(),
  conditions: ruleConditionsSchema.optional(),
  actions: ruleActionsSchema.optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const rule = await prisma.emailRule.findFirst({
      where: { id, organizationId: session.organizationId },
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

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Get rule error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const json = await req.json();
    const result = updateRuleSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const existing = await prisma.emailRule.findFirst({
      where: { id, organizationId: session.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
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

    if (accountId !== undefined && accountId !== null) {
      const account = await prisma.emailAccount.findFirst({
        where: { id: accountId, organizationId: session.organizationId },
      });
      if (!account) {
        return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
      }
    }

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (priority !== undefined) updateData.priority = priority;
    if (stopProcessing !== undefined) updateData.stopProcessing = stopProcessing;
    if (accountId !== undefined) updateData.accountId = accountId;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (actions !== undefined) updateData.actions = actions;

    const rule = await prisma.emailRule.update({
      where: { id },
      data: updateData,
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
    console.error('Update rule error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const existing = await prisma.emailRule.findFirst({
      where: { id, organizationId: session.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await prisma.emailRule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete rule error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
