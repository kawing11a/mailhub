import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { z } from 'zod';

const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const accessibleAccountsWhere = accountAccessWhere(session);
    const labels = await prisma.label.findMany({
      where: {
        organizationId: session.organizationId,
        accountLabels: {
          some: {
            account: accessibleAccountsWhere,
          },
        },
      },
      orderBy: { name: 'asc' },
      include: {
        accountLabels: {
          where: {
            account: accessibleAccountsWhere,
          },
          select: { accountId: true },
        },
      },
    });

    return NextResponse.json({
      labels: labels.map(({ accountLabels, ...label }) => ({
        ...label,
        accountIds: accountLabels.map((al) => al.accountId),
      })),
    });
  } catch (error) {
    console.error('Fetch labels error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    // Assuming any member can create labels for now
    const json = await req.json();
    const result = createLabelSchema.safeParse(json);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const { name, color, description, icon } = result.data;

    // Check if label exists
    const existing = await prisma.label.findUnique({
      where: { organizationId_name: { organizationId: session.organizationId, name } },
    });

    if (existing) {
      return NextResponse.json({ error: 'Label already exists' }, { status: 409 });
    }

    const label = await prisma.label.create({
      data: {
        organizationId: session.organizationId,
        name,
        color: color || '#3B82F6',
        description,
        icon,
      },
    });

    return NextResponse.json({ label });
  } catch (error) {
    console.error('Create label error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
