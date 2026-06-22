import { simpleParser, ParsedMail, AddressObject } from 'mailparser';

interface ParsedEmailData {
  messageId: string;
  subject: string | null;
  snippet: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: Array<{ name: string; address: string }>;
  ccAddresses: Array<{ name: string; address: string }>;
  bccAddresses: Array<{ name: string; address: string }>;
  replyTo: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
  receivedAt: Date;
  sentAt: Date | null;
  rawHeaders: Record<string, string>;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
    cid: string | null;
  }>;
}

function extractAddresses(addr: AddressObject | AddressObject[] | undefined): Array<{ name: string; address: string }> {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  return list.flatMap((a) =>
    (a.value || []).map((v) => ({
      name: v.name || '',
      address: v.address || '',
    }))
  );
}

function makeSnippet(text: string | undefined, maxLength = 300): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export async function parseEmail(raw: Buffer | string): Promise<ParsedEmailData> {
  const parsed: ParsedMail = await simpleParser(raw);

  const rawHeaders: Record<string, string> = {};
  if (parsed.headers) {
    parsed.headers.forEach((value, key) => {
      rawHeaders[key] = typeof value === 'string' ? value : JSON.stringify(value);
    });
  }

  return {
    messageId: parsed.messageId || `<generated-${Date.now()}@mailhub>`,
    subject: parsed.subject || null,
    snippet: makeSnippet(parsed.text),
    fromAddress: parsed.from?.value?.[0]?.address || null,
    fromName: parsed.from?.value?.[0]?.name || null,
    toAddresses: extractAddresses(parsed.to),
    ccAddresses: extractAddresses(parsed.cc),
    bccAddresses: extractAddresses(parsed.bcc),
    replyTo: parsed.replyTo?.value?.[0]?.address || null,
    inReplyTo: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : null,
    referencesHeader: parsed.references
      ? (Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : parsed.references)
      : null,
    bodyHtml: (parsed.html as string | false) || null,
    bodyText: parsed.text || null,
    hasAttachments: (parsed.attachments?.length ?? 0) > 0,
    receivedAt: parsed.date || new Date(),
    sentAt: parsed.date || null,
    rawHeaders,
    attachments: (parsed.attachments || []).map((att) => ({
      filename: att.filename || 'untitled',
      contentType: att.contentType || 'application/octet-stream',
      size: att.size,
      content: att.content,
      cid: att.cid || null,
    })),
  };
}
