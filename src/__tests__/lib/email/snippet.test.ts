import { createEmailSnippet } from '@/lib/email/snippet';

describe('createEmailSnippet', () => {
  it('prefers plain text and normalizes whitespace', () => {
    expect(createEmailSnippet({
      bodyText: '  Hello\n\n  from\tplain text  ',
      bodyHtml: '<p>Ignored HTML</p>',
    })).toBe('Hello from plain text');
  });

  it('creates readable text from HTML-only messages', () => {
    expect(createEmailSnippet({
      bodyHtml: '<p>Hello&nbsp;<strong>world</strong></p><div>Second &amp; third</div>',
    })).toBe('Hello world Second & third');
  });

  it('removes script and style content', () => {
    expect(createEmailSnippet({
      bodyHtml: '<style>.hidden { color: red }</style><p>Visible</p><script>alert("no")</script>',
    })).toBe('Visible');
  });

  it('decodes numeric entities', () => {
    expect(createEmailSnippet({
      bodyHtml: '<p>It&#39;s ready &#x1F44D;</p>',
    })).toBe("It's ready 👍");
  });

  it('truncates by Unicode code point and handles empty input', () => {
    expect(createEmailSnippet({ bodyText: '👍👍👍', maxLength: 2 })).toBe('👍👍');
    expect(createEmailSnippet({})).toBe('');
  });
});
