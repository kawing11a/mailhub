import { readFile } from 'fs/promises';
import { prisma } from '@/lib/db/prisma';
import {
  decodeGmailBase64,
  extractGmailAttachmentParts,
  fetchGmailAttachment,
  fetchMessageFull,
  getValidAccessToken,
  GmailApiError,
} from '@/lib/gmail/api';
import {
  resolveMailboxPathOn,
  withImapConnection,
} from '@/lib/imap/connection-manager';

export interface RetrievedAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
}

interface AttachmentSourceSnapshot {
  accountId: string;
  providerMessageId: string | null;
  uid: bigint | null;
  folder: string;
  imapPart: string | null;
  gmailAttachmentId: string | null;
  ordinal: number | null;
}

export class AttachmentNotFoundError extends Error {
  constructor(message = 'Attachment not found') {
    super(message);
    this.name = 'AttachmentNotFoundError';
  }
}

export class AttachmentProviderError extends Error {
  constructor(message = 'Attachment provider failed') {
    super(message);
    this.name = 'AttachmentProviderError';
  }
}

type LoadedAttachment = {
  id: string;
  emailId: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  imapPart: string | null;
  gmailAttachmentId: string | null;
  ordinal: number | null;
  createdAt?: Date | string | null;
};

type LoadedEmail = {
  id: string;
  accountId: string;
  providerMessageId: string | null;
  uid: bigint | null;
  folder: string;
  attachments: LoadedAttachment[];
};

const LOGICAL_FOLDERS = new Set(['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM']);
const DEFAULT_FILENAME = 'attachment';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export async function getReceivedAttachment(
  emailId: string,
  attachmentId: string,
  options: {
    skipStoredFile?: boolean;
    expectedSource?: AttachmentSourceSnapshot;
  } = {}
): Promise<RetrievedAttachment> {
  const email = (await prisma.email.findFirst({
    where: {
      id: emailId,
      attachments: {
        some: { id: attachmentId },
      },
    },
    select: {
      id: true,
      accountId: true,
      providerMessageId: true,
      uid: true,
      folder: true,
      attachments: {
        where: { id: attachmentId },
        select: {
          id: true,
          emailId: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          storagePath: true,
          imapPart: true,
          gmailAttachmentId: true,
          ordinal: true,
          createdAt: true,
        },
      },
    },
  })) as LoadedEmail | null;

  const attachment = email?.attachments[0];
  if (!email || !attachment) {
    throw new AttachmentNotFoundError();
  }

  if (options.expectedSource && (
    email.accountId !== options.expectedSource.accountId ||
    email.providerMessageId !== options.expectedSource.providerMessageId ||
    email.uid !== options.expectedSource.uid ||
    email.folder !== options.expectedSource.folder ||
    attachment.imapPart !== options.expectedSource.imapPart ||
    attachment.gmailAttachmentId !== options.expectedSource.gmailAttachmentId ||
    attachment.ordinal !== options.expectedSource.ordinal
  )) {
    throw new Error('Attachment source changed before retrieval');
  }

  if (attachment.storagePath && !options.skipStoredFile) {
    try {
      return await readStoredAttachment(
        attachment,
        Boolean(
          attachment.imapPart ||
            attachment.gmailAttachmentId ||
            (email.providerMessageId && attachment.ordinal !== null)
        )
      );
    } catch (error) {
      // Older versions could persist the storage path before the file was
      // successfully written. If the file is gone, continue with the
      // provider reference so the attachment can be recovered on demand.
      if (!(error instanceof AttachmentNotFoundError)) {
        throw error;
      }
    }
  }

  if (attachment.imapPart) {
    return retrieveImapAttachment(email, attachment);
  }

  if (attachment.gmailAttachmentId || (email.providerMessageId && attachment.ordinal !== null)) {
    return retrieveGmailAttachment(email, attachment);
  }

  throw new AttachmentNotFoundError();
}

export async function readStoredAttachment(
  attachment: Pick<
    LoadedAttachment,
    'filename' | 'contentType' | 'storagePath' | 'sizeBytes'
  >,
  verifySize = false
): Promise<RetrievedAttachment> {
  if (!attachment.storagePath) {
    throw new AttachmentNotFoundError();
  }

  let content: Buffer;
  try {
    content = await readFile(attachment.storagePath);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      throw new AttachmentNotFoundError();
    }
    throw error;
  }

  if (verifySize && attachment.sizeBytes !== null && content.length !== attachment.sizeBytes) {
    throw new AttachmentNotFoundError('Stored attachment is incomplete');
  }

  return {
    filename: attachment.filename ?? DEFAULT_FILENAME,
    contentType: attachment.contentType ?? DEFAULT_CONTENT_TYPE,
    sizeBytes: content.length,
    content,
  };
}

async function retrieveImapAttachment(
  email: LoadedEmail,
  attachment: LoadedAttachment
): Promise<RetrievedAttachment> {
  if (!email.uid || !email.folder || !attachment.imapPart) {
    throw new AttachmentNotFoundError();
  }

  const imapPart = attachment.imapPart;
  try {
    const result = await withImapConnection(
      email.accountId,
      async (client) => {
        const mailboxPath = LOGICAL_FOLDERS.has(email.folder)
          ? await resolveMailboxPathOn(client, email.folder, { propagateErrors: true })
          : email.folder;

        if (!mailboxPath) {
          return null;
        }

        const lock = await client.getMailboxLock(mailboxPath, { readOnly: true });
        try {
          const download = await client.download(String(email.uid), imapPart, {
            uid: true,
          });
          if (!download) {
            return null;
          }

          const content = await collectBuffer(download.content);

          return {
            filename:
              attachment.filename ??
              download.meta?.filename ??
              DEFAULT_FILENAME,
            contentType:
              attachment.contentType ??
              download.meta?.contentType ??
              DEFAULT_CONTENT_TYPE,
            sizeBytes: content.length,
            content,
          };
        } finally {
          lock.release();
        }
      },
      { propagateErrors: true }
    );

    if (result === null) {
      throw new AttachmentNotFoundError();
    }

    return result;
  } catch (error) {
    if (error instanceof AttachmentNotFoundError) {
      throw error;
    }

    throw new AttachmentProviderError('Failed to fetch IMAP attachment');
  }
}

async function retrieveGmailAttachment(
  email: LoadedEmail,
  attachment: LoadedAttachment
): Promise<RetrievedAttachment> {
  if (!email.providerMessageId) {
    throw new AttachmentNotFoundError();
  }

  try {
    const accessToken = await getValidAccessToken(email.accountId);
    let content: Buffer;
    if (attachment.gmailAttachmentId) {
      content = await fetchGmailAttachment(
        accessToken,
        email.providerMessageId,
        attachment.gmailAttachmentId
      );
    } else if (attachment.ordinal !== null) {
      const fullMessage = await fetchMessageFull(accessToken, email.providerMessageId);
      const part = extractGmailAttachmentParts(fullMessage.payload)[attachment.ordinal];
      if (!part?.body?.data) throw new AttachmentNotFoundError();
      content = decodeGmailBase64(part.body.data);
    } else {
      throw new AttachmentNotFoundError();
    }

    return {
      filename: attachment.filename ?? DEFAULT_FILENAME,
      contentType: attachment.contentType ?? DEFAULT_CONTENT_TYPE,
      sizeBytes: content.length,
      content,
    };
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 404) {
      throw new AttachmentNotFoundError();
    }

    throw new AttachmentProviderError('Failed to fetch Gmail attachment');
  }
}

async function collectBuffer(
  content: AsyncIterable<Buffer> | Iterable<Buffer>
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
