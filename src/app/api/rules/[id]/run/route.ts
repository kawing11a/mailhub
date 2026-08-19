import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { evaluateRule, applyRuleActions } from '@/lib/rules/engine';
import { EmailRuleDefinition } from '@/lib/rules/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;
    const adminCheck = requireAdmin(session);
    if (adminCheck) return adminCheck;

    const ruleRecord = await prisma.emailRule.findFirst({
      where: { id, organizationId: session.organizationId },
    });

    if (!ruleRecord) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const ruleDef: EmailRuleDefinition = {
      id: ruleRecord.id,
      name: ruleRecord.name,
      description: ruleRecord.description,
      isActive: true, // For manual trigger, evaluate active criteria
      priority: ruleRecord.priority,
      accountId: ruleRecord.accountId,
      conditions: ruleRecord.conditions as any,
      actions: ruleRecord.actions as any,
    };

    // Find accounts matching scope
    const accountFilter: Record<string, any> = {
      organizationId: session.organizationId,
    };
    if (ruleRecord.accountId) {
      accountFilter.id = ruleRecord.accountId;
    }

    const accounts = await prisma.emailAccount.findMany({
      where: accountFilter,
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      return NextResponse.json({
        totalEvaluated: 0,
        matchedCount: 0,
        modifiedCount: 0,
      });
    }

    // Fetch emails for these accounts
    const emails = await prisma.email.findMany({
      where: {
        accountId: { in: accountIds },
      },
      select: {
        id: true,
        accountId: true,
        fromAddress: true,
        fromName: true,
        toAddresses: true,
        ccAddresses: true,
        subject: true,
        hasAttachments: true,
        isRead: true,
        isStarred: true,
        isHighRisk: true,
        emailLabels: {
          select: { labelId: true },
        },
        body: {
          select: { bodyText: true },
        },
      },
      take: 2000, // Batch limit for safe execution
    });

    let matchedCount = 0;

    for (const email of emails) {
      const evaluationInput = {
        id: email.id,
        accountId: email.accountId,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        toAddresses: email.toAddresses,
        ccAddresses: email.ccAddresses,
        subject: email.subject,
        bodyText: email.body?.bodyText,
        hasAttachments: email.hasAttachments,
        isRead: email.isRead,
        isStarred: email.isStarred,
        isHighRisk: email.isHighRisk,
        labelIds: email.emailLabels.map((el) => el.labelId),
      };

      if (evaluateRule(evaluationInput, ruleDef)) {
        matchedCount++;
        await applyRuleActions(email.id, ruleDef.actions, prisma);
      }
    }

    return NextResponse.json({
      totalEvaluated: emails.length,
      matchedCount,
      modifiedCount: matchedCount,
    });
  } catch (error) {
    console.error('Run rule error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
