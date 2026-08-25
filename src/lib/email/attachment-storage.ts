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
  createdAt?: Date | string | null;
}

export interface ReconciledReceivedAttachmentMetadata {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string | null;
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
  references: ReceivedAttachmentReferenceInput[],
  options: { preserveStoragePath?: boolean } = {}
): ReconciledReceivedAttachmentMetadata[] {
  const orderedExisting = orderAttachmentsByOrdinal(existing);
  const existingByOrdinal = new Map<number, ExistingReceivedAttachmentMetadata>();
  for (const attachment of orderedExisting) {
    if (attachment.ordinal !== null && !existingByOrdinal.has(attachment.ordinal)) {
      existingByOrdinal.set(attachment.ordinal, attachment);
    }
  }
  const usedExistingIds = new Set<string>();
  let legacyIndex = 0;

  return incoming.map((attachment, index) => {
    const reference = references[index];
    const ordinal = reference?.ordinal ?? index;
    let previous = existingByOrdinal.get(ordinal);

    if (previous && usedExistingIds.has(previous.id)) previous = undefined;

    if (!previous) {
      while (legacyIndex < orderedExisting.length) {
        const candidate = orderedExisting[legacyIndex++];
        if (!usedExistingIds.has(candidate.id) && candidate.ordinal === null) {
          previous = candidate;
          break;
        }
      }
    }

    if (previous) usedExistingIds.add(previous.id);

    return {
      id: previous?.id || randomUUID(),
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.size,
      storagePath: options.preserveStoragePath ? previous?.storagePath ?? null : null,
      ordinal,
      imapPart: reference?.imapPart ?? null,
      gmailAttachmentId: reference?.gmailAttachmentId ?? null,
      cid: attachment.cid,
      existing: !!previous,
    };
  });
}

export interface AttachmentOrderFields {
  id: string;
  ordinal: number | null;
  createdAt?: Date | string | null;
}

export function orderAttachmentsByOrdinal<T extends AttachmentOrderFields>(attachments: T[]): T[] {
  return [...attachments].sort((left, right) => {
    if (left.ordinal !== null && right.ordinal !== null) {
      return left.ordinal - right.ordinal || left.id.localeCompare(right.id);
    }
    if (left.ordinal !== null) return -1;
    if (right.ordinal !== null) return 1;

    const leftCreatedAt = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreatedAt = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftCreatedAt - rightCreatedAt || left.id.localeCompare(right.id);
  });
}
