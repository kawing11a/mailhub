import { prisma } from '@/lib/db/prisma';

/**
 * Resolve the thread ID for an incoming email using RFC 2822 headers.
 * Cross-account threading: searches all accounts within the organization.
 *
 * Strategy:
 * 1. Check In-Reply-To header → look up that messageId
 * 2. Check References header → try each reference (oldest first)
 * 3. If no match → use own messageId as new thread root
 */
export async function resolveThreadId(
  messageId: string,
  inReplyTo: string | null,
  referencesHeader: string | null,
  organizationId: string
): Promise<string> {
  // 1. Try In-Reply-To
  if (inReplyTo) {
    const match = await prisma.email.findFirst({
      where: {
        messageId: inReplyTo,
        account: { organizationId },
      },
      select: { threadId: true },
    });
    if (match?.threadId) return match.threadId;
  }

  // 2. Try References header (space-separated list of message IDs)
  if (referencesHeader) {
    const references = referencesHeader.trim().split(/\s+/);
    for (const ref of references) {
      const match = await prisma.email.findFirst({
        where: {
          messageId: ref,
          account: { organizationId },
        },
        select: { threadId: true },
      });
      if (match?.threadId) return match.threadId;
    }
  }

  // 3. New thread — use own messageId
  return messageId;
}
