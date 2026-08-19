import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { z } from 'zod';
import { logActivity } from '@/lib/activity/log';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;
    const accessibleAccountsWhere = accountAccessWhere(session);

    // Verify label access
    const label = await prisma.label.findUnique({
      where: { id },
    });

    if (!label || label.organizationId !== session.organizationId) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    // Accounts assigned this label contribute all their emails to the view
    const assignedAccounts = await prisma.accountLabel.findMany({
      where: {
        labelId: id,
        account: accessibleAccountsWhere,
      },
      select: { accountId: true },
    });

    const emails = await prisma.email.findMany({
      where: {
        account: accessibleAccountsWhere,
        OR: [
          { emailLabels: { some: { labelId: id } } },
          { accountId: { in: assignedAccounts.map((a) => a.accountId) } },
        ],
      },
      select: {
        id: true,
        accountId: true,
        messageId: true,
        threadId: true,
        folder: true,
        subject: true,
        snippet: true,
        fromAddress: true,
        fromName: true,
        isRead: true,
        isStarred: true,
        hasAttachments: true,
        receivedAt: true,
        emailLabels: {
          include: { label: { select: { id: true, name: true, color: true } } },
        },
      },
      orderBy: { receivedAt: 'desc' },
      skip,
      take: limit,
    });

    return NextResponse.json({ emails, page, limit });
  } catch (error) {
    console.error('Fetch label emails error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const tagEmailSchema = z.object({
  emailId: z.string().uuid(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const json = await req.json();
    const result = tagEmailSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const { emailId } = result.data;

    // Verify label belongs to org
    const label = await prisma.label.findUnique({
      where: { id },
    });

    if (!label || label.organizationId !== session.organizationId) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    const email = await prisma.email.findFirst({
      where: {
        id: emailId,
        account: accountAccessWhere(session),
      },
      select: {
        id: true,
        accountId: true,
      },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Tag the email
    await prisma.emailLabel.upsert({
      where: { emailId_labelId: { emailId, labelId: id } },
      update: {},
      create: { emailId, labelId: id },
    });

    // Log Activity
    await logActivity({
      organizationId: session.organizationId,
      userId: session.userId,
      accountId: email.accountId,
      emailId: email.id,
      action: 'label_added',
      metadata: { labelId: id, labelName: label.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tag email error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const url = new URL(req.url);
    const emailId = url.searchParams.get('emailId');
    if (!emailId) return NextResponse.json({ error: 'Missing emailId' }, { status: 400 });

    const label = await prisma.label.findUnique({
      where: { id },
    });

    if (!label || label.organizationId !== session.organizationId) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    const email = await prisma.email.findFirst({
      where: {
        id: emailId,
        account: accountAccessWhere(session),
      },
      select: { id: true },
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Untag
    await prisma.emailLabel.deleteMany({
      where: { emailId, labelId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Untag email error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
