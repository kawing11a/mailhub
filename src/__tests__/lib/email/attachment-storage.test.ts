jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  buildReceivedAttachmentMetadata,
  reconcileAttachmentFiles,
  storedAttachmentFileExists,
} from '@/lib/email/attachment-storage';

describe('reconcileAttachmentFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports a missing stored file without throwing', async () => {
    (fs.access as jest.Mock).mockRejectedValue(new Error('missing'));

    await expect(storedAttachmentFileExists('missing/attachment-1')).resolves.toBe(false);
  });

  it('rewrites a missing file for an existing draft or sent attachment record', async () => {
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockRejectedValue(new Error('missing'));
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

    const result = await reconcileAttachmentFiles(
      'storage/attachments',
      [
        {
          filename: 'report.pdf',
          contentType: 'application/pdf',
          size: 3,
          content: Buffer.from('pdf'),
          cid: null,
        },
      ],
      [
        {
          id: 'attachment-1',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          sizeBytes: 3,
          storagePath: 'old-storage/attachment-1',
          cid: null,
        },
      ]
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      path.join('storage/attachments', 'attachment-1'),
      Buffer.from('pdf')
    );
    expect(result).toEqual([
      {
        id: 'attachment-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 3,
        storagePath: path.join('storage/attachments', 'attachment-1'),
        cid: null,
        existing: true,
      },
    ]);
  });

  it('builds received attachment metadata without writing files', async () => {
    const result = buildReceivedAttachmentMetadata(
      [
        {
          filename: 'report.pdf',
          contentType: 'application/pdf',
          size: 3,
          content: Buffer.from('pdf'),
          cid: null,
        },
      ],
      [],
      [{ ordinal: 0, imapPart: '2.1', gmailAttachmentId: null }]
    );

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: expect.any(String),
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 3,
        storagePath: null,
        ordinal: 0,
        imapPart: '2.1',
        gmailAttachmentId: null,
        cid: null,
        existing: false,
      },
    ]);
  });
});
