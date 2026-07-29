const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (named) return NAMED_ENTITIES[named.toLowerCase()] ?? entity;

      const codePoint = Number.parseInt(decimal ?? hex ?? '', hex ? 16 : 10);
      if (
        !Number.isFinite(codePoint)
        || codePoint < 0
        || codePoint > 0x10ffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity;
      }

      return String.fromCodePoint(codePoint);
    }
  );
}

function htmlToPreviewText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function createEmailSnippet({
  bodyText,
  bodyHtml,
  maxLength = 300,
}: {
  bodyText?: string | null;
  bodyHtml?: string | null;
  maxLength?: number;
}): string {
  const normalizedText = normalizePreviewText(bodyText || '');
  const source = normalizedText || normalizePreviewText(htmlToPreviewText(bodyHtml || ''));
  const safeMaxLength = Math.max(0, Math.floor(maxLength));

  return Array.from(source).slice(0, safeMaxLength).join('');
}
