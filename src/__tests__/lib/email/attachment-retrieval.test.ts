jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    email: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('@/lib/imap/connection-manager', () => ({
  withImapConnection: jest.fn(),
  resolveMailboxPathOn: jest.fn(),
}));

jest.mock('@/lib/gmail/api', () => ({
  getValidAccessToken: jest.fn(),
  fetchGmailAttachment: jest.fn(),
  GmailApiError: class GmailApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = 'GmailApiError';
      this.status = status;
    }
  },
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

import * as fs from 'fs/promises';
import { prisma } from '@/lib/db/prisma';
import {
  resolveMailboxPathOn,
  withImapConnection,
} from '@/lib/imap/connection-manager';
import {
  fetchGmailAttachment,
  getValidAccessToken,
} from '@/lib/gmail/api';
import {
  AttachmentProviderError,
  AttachmentNotFoundError,
  getReceivedAttachment,
} from '@/lib/email/attachment-retrieval';

const mockFindEmail = prisma.email.findFirst as jest.Mock;
const mockWithImapConnection = withImapConnection as jest.Mock;
const mockResolveMailboxPathOn = resolveMailboxPathOn as jest.Mock;
const mockGetValidAccessToken = getValidAccessToken as jest.Mock;
const mockFetchGmailAttachment = fetchGmailAttachment as jest.Mock;
const mockFsReadFile = fs.readFile as jest.Mock;

function mockEmailWithImapReference() {
  const mockDownload = jest.fn().mockResolvedValue({
    meta: {
      filename: 'downloaded-report.pdf',
      contentType: 'application/octet-stream',
    },
    content: (async function* () {
      yield Buffer.from('pdf');
    })(),
  });
  const mockGetMailboxLock = jest.fn().mockResolvedValue({ release: jest.fn() });

  mockFindEmail.mockResolvedValue({
    id: 'email-1',
    accountId: 'account-1',
    uid: BigInt(42),
    folder: 'INBOX',
    providerMessageId: null,
    attachments: [
      {
        id: 'att-1',
        emailId: 'email-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 99,
        storagePath: null,
        imapPart: '2.1',
        gmailAttachmentId: null,
      },
    ],
  });
  mockResolveMailboxPathOn.mockResolvedValue('INBOX');
  mockWithImapConnection.mockImplementation(async (_accountId, operation) =>
    operation({
      getMailboxLock: mockGetMailboxLock,
      download: mockDownload,
    })
  );

  return { mockDownload, mockGetMailboxLock };
}

function mockEmailWithGmailReference() {
  mockFindEmail.mockResolvedValue({
    id: 'email-1',
    accountId: 'account-1',
    uid: null,
    folder: 'INBOX',
    providerMessageId: 'gmail-message-1',
    attachments: [
      {
        id: 'att-1',
        emailId: 'email-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 99,
        storagePath: null,
        imapPart: null,
        gmailAttachmentId: 'gmail-att-1',
      },
    ],
  });
}

function mockLegacyAttachment() {
  mockFindEmail.mockResolvedValue({
    id: 'email-1',
    accountId: 'account-1',
    uid: null,
    folder: 'SENT',
    providerMessageId: null,
    attachments: [
      {
        id: 'att-1',
        emailId: 'email-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 99,
        storagePath: '.storage/attachments/att-1',
        imapPart: null,
        gmailAttachmentId: null,
      },
    ],
  });
}

function mockEmailWithoutAttachmentReference() {
  mockFindEmail.mockResolvedValue({
    id: 'email-1',
    accountId: 'account-1',
    uid: null,
    folder: 'INBOX',
    providerMessageId: null,
    attachments: [
      {
        id: 'att-1',
        emailId: 'email-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 99,
        storagePath: null,
        imapPart: null,
        gmailAttachmentId: null,
      },
    ],
  });
}

describe('getReceivedAttachment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches only the stored IMAP MIME part', async () => {
    const { mockDownload, mockGetMailboxLock } = mockEmailWithImapReference();

    await expect(getReceivedAttachment('email-1', 'att-1')).resolves.toMatchObject({
      filename: 'report.pdf',
      content: Buffer.from('pdf'),
    });
    expect(mockGetMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: true });
    expect(mockDownload).toHaveBeenCalledWith('42', '2.1', { uid: true });
  });

  it('maps IMAP transport failures to AttachmentProviderError', async () => {
    mockEmailWithImapReference();
    mockWithImapConnection.mockRejectedValue(new Error('socket reset'));

    await expect(getReceivedAttachment('email-1', 'att-1')).rejects.toBeInstanceOf(
      AttachmentProviderError
    );
  });

  it('uses Gmail attachment data without writing a file', async () => {
    mockEmailWithGmailReference();
    mockGetValidAccessToken.mockResolvedValue('access-token');
    mockFetchGmailAttachment.mockResolvedValue(Buffer.from('pdf'));

    await expect(getReceivedAttachment('email-1', 'att-1')).resolves.toMatchObject({
      content: Buffer.from('pdf'),
    });
    expect(mockFetchGmailAttachment).toHaveBeenCalledWith(
      'access-token',
      'gmail-message-1',
      'gmail-att-1'
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('uses storage only when a legacy/local attachment has a storage path', async () => {
    mockLegacyAttachment();
    mockFsReadFile.mockResolvedValue(Buffer.from('legacy'));

    await expect(getReceivedAttachment('email-1', 'att-1')).resolves.toMatchObject({
      content: Buffer.from('legacy'),
    });
    expect(mockFsReadFile).toHaveBeenCalledWith('.storage/attachments/att-1');
  });

  it('throws AttachmentNotFoundError when neither provider nor local content exists', async () => {
    mockEmailWithoutAttachmentReference();

    await expect(getReceivedAttachment('email-1', 'att-1')).rejects.toBeInstanceOf(
      AttachmentNotFoundError
    );
  });

  it('maps Gmail 404 attachment failures to AttachmentNotFoundError', async () => {
    mockEmailWithGmailReference();
    mockGetValidAccessToken.mockResolvedValue('access-token');
    mockFetchGmailAttachment.mockRejectedValue(new Error('missing'));
    mockFetchGmailAttachment.mockRejectedValueOnce(
      new (jest.requireMock('@/lib/gmail/api').GmailApiError)('missing', 404)
    );

    await expect(getReceivedAttachment('email-1', 'att-1')).rejects.toBeInstanceOf(
      AttachmentNotFoundError
    );
  });

  it('maps Gmail non-404 attachment failures to AttachmentProviderError', async () => {
    mockEmailWithGmailReference();
    mockGetValidAccessToken.mockResolvedValue('access-token');
    mockFetchGmailAttachment.mockRejectedValue(
      new (jest.requireMock('@/lib/gmail/api').GmailApiError)('boom', 500)
    );

    await expect(getReceivedAttachment('email-1', 'att-1')).rejects.toBeInstanceOf(
      AttachmentProviderError
    );
  });
});
