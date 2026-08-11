const COMMON_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  cent: '¢',
  pound: '£',
  yen: '¥',
  euro: '€',
  sect: '§',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
};

/**
 * Decodes all standard HTML entities (named, decimal, and hexadecimal).
 */
export function decodeHtmlEntities(value: string): string {
  if (!value) return '';
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z0-9]+));/gi,
    (entity, decimal: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (named) {
        return COMMON_NAMED_ENTITIES[named.toLowerCase()] ?? entity;
      }

      const codePoint = Number.parseInt(decimal ?? hex ?? '', hex ? 16 : 10);
      if (
        !Number.isFinite(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity;
      }

      return String.fromCodePoint(codePoint);
    }
  );
}

export interface CleanEmailTextOptions {
  maxLength?: number;
  preserveParagraphs?: boolean;
}

/**
 * Extracts clean, human-readable plain text from email HTML or raw text bodies.
 * - Strips script, style, head, svg, meta, xml, noscript tags and comments.
 * - Strips all base64 data URLs and image tags.
 * - Formats block structures (paragraphs, lists, headings, line breaks) cleanly.
 * - Decodes HTML entities into Unicode characters.
 * - Collapses redundant whitespace and enforces safe token length boundaries.
 */
export function extractCleanEmailText(
  input?: string | null,
  options: CleanEmailTextOptions = {}
): string {
  if (!input || typeof input !== 'string') return '';

  const { maxLength = 5000, preserveParagraphs = true } = options;

  let text = input;

  // 1. Remove dangerous / non-content blocks (head, style, script, svg, noscript, xml, meta)
  text = text.replace(/<(script|style|head|svg|noscript|meta|xml)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  text = text.replace(/<(meta|link)\b[^>]*\/?>/gi, ' ');

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Remove all images, especially inline base64 images (<img src="data:...">)
  text = text.replace(/<img\b[^>]*>/gi, ' ');

  // 4. Transform block-level semantic elements into line breaks and formatting
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|article|section|header|footer)>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<\/(h[1-6])>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/(ul|ol|table|blockquote)>/gi, '\n\n');

  // 5. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 6. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 7. Normalize whitespace & line breaks
  if (preserveParagraphs) {
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else {
    text = text.replace(/\s+/g, ' ').trim();
  }

  // 8. Safe length truncation
  if (maxLength && text.length > maxLength) {
    const truncated = text.slice(0, maxLength);
    // Find last space/newline boundary within 50 chars of maxLength for clean cutoff
    const lastBoundary = Math.max(truncated.lastIndexOf('\n'), truncated.lastIndexOf(' '));
    const cleanCut = lastBoundary > maxLength * 0.8 ? truncated.slice(0, lastBoundary) : truncated;
    return `${cleanCut.trim()}\n\n[... email content truncated for length ...]`;
  }

  return text;
}
