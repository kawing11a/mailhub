import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate } from '@/lib/auth/middleware';
import { z } from 'zod';

const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;

    const json = await req.json();
    const result = updateLabelSchema.safeParse(json);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    // Verify label belongs to org
    const existing = await prisma.label.findUnique({
      where: { id },
    });

    if (!existing || existing.organizationId !== session.organizationId) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    if (result.data.name && result.data.name !== existing.name) {
      const nameConflict = await prisma.label.findUnique({
        where: { organizationId_name: { organizationId: session.organizationId, name: result.data.name } },
      });
      if (nameConflict) {
        return NextResponse.json({ error: 'Label name already in use' }, { status: 409 });
      }
    }

    const label = await prisma.label.update({
      where: { id },
      data: result.data,
    });

    return NextResponse.json({ label });
  } catch (error) {
    console.error('Update label error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await authenticate(req);
    if (session instanceof Response) return session;
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const existing = await prisma.label.findUnique({
      where: { id },
    });

    if (!existing || existing.organizationId !== session.organizationId) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    await prisma.label.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete label error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
