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
