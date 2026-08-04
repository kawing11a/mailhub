import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const summaryRun = await prisma.emailSummaryRun.findUnique({
      where: { id },
    });

    if (!summaryRun || summaryRun.organizationId !== auth.organizationId) {
      return apiError('Summary run not found', 404);
    }

    return apiResponse(summaryRun);
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch summary run status', 500);
  }
}
