import { extractCleanEmailText } from '@/lib/email/clean-text';

describe('extractCleanEmailText', () => {
  it('returns empty string for null, undefined, or empty inputs', () => {
    expect(extractCleanEmailText(null)).toBe('');
    expect(extractCleanEmailText(undefined)).toBe('');
    expect(extractCleanEmailText('')).toBe('');
    expect(extractCleanEmailText('   ')).toBe('');
  });

  it('handles plain text inputs without modification other than whitespace cleanup', () => {
    const text = 'Hello world!\n\nThis is a plain text email.\nBest regards,\nAlice';
    expect(extractCleanEmailText(text)).toBe(text);
  });

  it('strips script, style, head, svg, and xml tags and their contents', () => {
    const html = `
      <html>
        <head><title>Test</title><style>body { color: red; } .hidden { display: none; }</style></head>
        <body>
          <script>console.log("malicious code");</script>
          <svg><path d="M0 0h24v24H0z"/></svg>
          <p>This is real content.</p>
        </body>
      </html>
    `;
    const result = extractCleanEmailText(html);
    expect(result).toBe('This is real content.');
    expect(result).not.toContain('style');
    expect(result).not.toContain('script');
    expect(result).not.toContain('color: red');
  });

  it('strips HTML comments', () => {
    const html = '<p>Hello <!-- invisible comment -->World</p>';
    expect(extractCleanEmailText(html)).toBe('Hello World');
  });

  it('completely removes inline base64 images and regular img tags', () => {
    const hugeBase64 = 'A'.repeat(50000);
    const html = `
      <div>
        <p>Before image</p>
        <img src="data:image/png;base64,${hugeBase64}" alt="Large Logo" />
        <img src="https://example.com/tracking.gif" width="1" height="1" />
        <p>After image</p>
      </div>
    `;
    const result = extractCleanEmailText(html);
    expect(result).toContain('Before image');
    expect(result).toContain('After image');
    expect(result).not.toContain('data:image');
    expect(result).not.toContain(hugeBase64);
    expect(result.length).toBeLessThan(100);
  });

  it('converts paragraphs, lists, and line breaks into clean structured text', () => {
    const html = `
      <p>Dear Team,</p>
      <p>Here are the updates:</p>
      <ul>
        <li>Task 1 finished</li>
        <li>Task 2 in review</li>
      </ul>
      <div>Please reply by Friday.<br/>Thanks!</div>
    `;
    const result = extractCleanEmailText(html);
    expect(result).toContain('Dear Team,');
    expect(result).toContain('Here are the updates:');
    expect(result).toContain('- Task 1 finished');
    expect(result).toContain('- Task 2 in review');
    expect(result).toContain('Please reply by Friday.');
    expect(result).toContain('Thanks!');
  });

  it('decodes named, decimal, and hex HTML entities', () => {
    const html = '<p>Rock &amp; Roll &bull; &quot;Hello&#39;s World&quot; &lt;test&gt; &#169; 2026 &#x2764;</p>';
    const result = extractCleanEmailText(html);
    expect(result).toContain('Rock & Roll');
    expect(result).toContain('"Hello\'s World"');
    expect(result).toContain('<test>');
    expect(result).toContain('© 2026');
    expect(result).toContain('❤');
  });

  it('collapses excessive blank lines and whitespace', () => {
    const html = `
      <p>First line</p>
      <br><br><br><br><br>
      <p>   Second    line with    spaces   </p>
    `;
    const result = extractCleanEmailText(html);
    expect(result).toBe('First line\n\nSecond line with spaces');
  });

  it('safely truncates long text when exceeding maxLength', () => {
    const longHtml = '<p>' + 'The quick brown fox jumps over the lazy dog. '.repeat(100) + '</p>';
    const result = extractCleanEmailText(longHtml, { maxLength: 200 });
    expect(result.length).toBeLessThanOrEqual(260); // 200 + truncation notice
    expect(result).toContain('[... email content truncated for length ...]');
  });
});
