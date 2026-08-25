import { randomUUID } from 'crypto';
import { access, mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
interface ReceivedAttachmentReferenceInput {
  ordinal: number;
  imapPart?: string | null;
  gmailAttachmentId?: string | null;
}

export interface IncomingAttachmentFile {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  cid: string | null;
}

export interface ExistingAttachmentFile {
  id: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  cid: string | null;
}

export interface ReconciledAttachmentFile {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  cid: string | null;
  existing: boolean;
}

export interface ExistingReceivedAttachmentMetadata {
  id: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  cid: string | null;
  ordinal: number | null;
  imapPart: string | null;
  gmailAttachmentId: string | null;
}

export interface ReconciledReceivedAttachmentMetadata {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: null;
  ordinal: number;
  imapPart: string | null;
  gmailAttachmentId: string | null;
  cid: string | null;
  existing: boolean;
}

export async function storedAttachmentFileExists(storagePath: string | null): Promise<boolean> {
  if (!storagePath) return false;

  try {
    await access(storagePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure parsed attachment content exists on disk while preserving existing IDs.
 * Existing database rows are matched by their stable order within the email.
 */
export async function reconcileAttachmentFiles(
  storageDir: string,
  incoming: IncomingAttachmentFile[],
  existing: ExistingAttachmentFile[]
): Promise<ReconciledAttachmentFile[]> {
  if (incoming.length === 0) return [];

  await mkdir(storageDir, { recursive: true });

  return Promise.all(
    incoming.map(async (attachment, index) => {
      const previous = existing[index];
      const id = previous?.id || randomUUID();
      const canonicalPath = path.join(storageDir, id);
      let storagePath = previous?.storagePath || canonicalPath;
      let fileExists = false;

      if (previous?.storagePath) {
        fileExists = await storedAttachmentFileExists(previous.storagePath);
        if (!fileExists) storagePath = canonicalPath;
      }

      if (!fileExists) {
        await writeFile(canonicalPath, attachment.content);
        storagePath = canonicalPath;
      }

      return {
        id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.size,
        storagePath,
        cid: attachment.cid,
        existing: !!previous,
      };
    })
  );
}

export function buildReceivedAttachmentMetadata(
  incoming: IncomingAttachmentFile[],
  existing: ExistingReceivedAttachmentMetadata[],
  references: ReceivedAttachmentReferenceInput[]
): ReconciledReceivedAttachmentMetadata[] {
  return incoming.map((attachment, index) => {
    const previous = existing[index];
    const reference = references[index];

    return {
      id: previous?.id || randomUUID(),
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.size,
      storagePath: null,
      ordinal: reference?.ordinal ?? index,
      imapPart: reference?.imapPart ?? null,
      gmailAttachmentId: reference?.gmailAttachmentId ?? null,
      cid: attachment.cid,
      existing: !!previous,
    };
  });
}
