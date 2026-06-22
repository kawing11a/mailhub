import { prisma } from '@/lib/db/prisma';

interface LogParams {
  organizationId: string;
  userId: string;
  accountId?: string;
  emailId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogParams): Promise<void> {
  try {
    await prisma.emailActivityLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        accountId: params.accountId,
        emailId: params.emailId,
        action: params.action,
        metadata: params.metadata ? (params.metadata as any) : {},
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
