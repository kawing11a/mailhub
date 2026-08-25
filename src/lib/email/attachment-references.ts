export interface ReceivedAttachmentReference {
  ordinal: number;
  imapPart: string | null;
  gmailAttachmentId: string | null;
}

export function buildAttachmentReference(input: {
  ordinal: number;
  imapPart?: string | null;
  gmailAttachmentId?: string | null;
}): ReceivedAttachmentReference {
  return {
    ordinal: input.ordinal,
    imapPart: input.imapPart ?? null,
    gmailAttachmentId: input.gmailAttachmentId ?? null,
  };
}
