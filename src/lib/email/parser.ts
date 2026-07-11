export function extractTextFromHtml(html: string): string {
  if (!html) return '';
  
  // Clean up styles and scripts using regex first to be safe
  const cleanHtml = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  if (typeof window === 'undefined') {
    return cleanHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  }
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');
  return doc.body.textContent || '';
}

export function parseEmailToChat(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const cleanLines = [];
  for (const line of lines) {
    if (line.match(/^On .* wrote:/) || line.startsWith('>')) {
      break; 
    }
    if (line.trim() === '--' || line.trim() === '---') {
      break; 
    }
    cleanLines.push(line);
  }
  return cleanLines.join('\n').trim();
}
