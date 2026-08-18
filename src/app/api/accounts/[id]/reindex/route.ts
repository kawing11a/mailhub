import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { searchQueue } from '@/lib/queue/client';
import { accountAccessWhere } from '@/lib/accounts/access';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const account = await prisma.emailAccount.findFirst({
    where: accountAccessWhere(auth, id),
  });

  if (!account) return apiError('Account not found', 404);

  try {
    const emails = await prisma.email.findMany({
      where: { accountId: id },
      select: { id: true }
    });

    // Add them to the BullMQ searchQueue in bulk
    const jobs = emails.map(email => ({
      name: 'index-email',
      data: { emailId: email.id }
    }));
    
    if (jobs.length > 0) {
      await searchQueue.addBulk(jobs);
    }

    return apiResponse({
      success: true,
      message: `Successfully queued ${emails.length} emails for search reindexing.`
    });
  } catch (error: any) {
    console.error('Failed to reindex account:', error);
    return apiError('Internal server error', 500);
  }
}
