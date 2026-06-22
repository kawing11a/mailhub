import { resolveThreadId } from '@/lib/imap/threading';

// Mock Prisma
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    email: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db/prisma';

const mockFindFirst = prisma.email.findFirst as jest.Mock;

describe('resolveThreadId', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns own messageId when no references exist', async () => {
    const result = await resolveThreadId(
      '<new@example.com>',
      null,
      null,
      'org-1'
    );
    expect(result).toBe('<new@example.com>');
  });

  it('finds thread via inReplyTo', async () => {
    mockFindFirst.mockResolvedValue({
      threadId: '<root@example.com>',
    });

    const result = await resolveThreadId(
      '<reply@example.com>',
      '<original@example.com>',
      null,
      'org-1'
    );
    expect(result).toBe('<root@example.com>');
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          messageId: '<original@example.com>',
        }),
      })
    );
  });

  it('falls back to references header when inReplyTo not found', async () => {
    // First call (inReplyTo) returns null
    mockFindFirst.mockResolvedValueOnce(null);
    // Second call (references) returns a match
    mockFindFirst.mockResolvedValueOnce({ threadId: '<thread-root@example.com>' });

    const result = await resolveThreadId(
      '<new-reply@example.com>',
      '<unknown@example.com>',
      '<ref1@example.com> <ref2@example.com>',
      'org-1'
    );
    expect(result).toBe('<thread-root@example.com>');
  });

  it('creates new thread when no references match', async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await resolveThreadId(
      '<orphan@example.com>',
      '<nonexistent@example.com>',
      null,
      'org-1'
    );
    expect(result).toBe('<orphan@example.com>');
  });
});
