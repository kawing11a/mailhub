import { POST as draftPost } from '@/app/api/ai/draft/route';
import { POST as explainPost } from '@/app/api/ai/explain/route';
import { POST as toolboxPost } from '@/app/api/ai/toolbox/route';

// Mock fetch globally for LLM API calls
global.fetch = jest.fn();

describe('AI API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/ai/draft', () => {
    it('returns 400 if prompt and existingText are missing', async () => {
      const req = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await draftPost(req);
      expect(res.status).toBe(400);
    });

    it('successfully generates draft when given prompt', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Subject: Hello\n\nDear John, thanks!' } }],
        }),
      });

      const req = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Write a thank you email', tone: 'Friendly' }),
      });
      const res = await draftPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('success');
      expect(json.result).toContain('Dear John');
    });

    it('sanitizes bloated HTML and inline base64 images from replyContext before invoking LLM', async () => {
      const hugeBase64 = 'B'.repeat(20000);
      const bloatedHtml = `
        <div>
          <style>body { background: yellow; }</style>
          <p>Please review the proposal by tomorrow.</p>
          <img src="data:image/png;base64,${hugeBase64}" />
          <!-- internal comment -->
          <p>Regards,<br/>Bob</p>
        </div>
      `;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Subject: Re: Proposal\n\nHi Bob, will review.' } }],
        }),
      });

      const req = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'Confirm I will review it',
          replyContext: {
            subject: 'Proposal',
            body: bloatedHtml,
          },
        }),
      });

      const res = await draftPost(req);
      expect(res.status).toBe(200);

      // Verify the payload sent to LLM was sanitized
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const reqBody = JSON.parse(fetchCall[1].body);
      const userMessage = reqBody.messages.find((m: any) => m.role === 'user').content;

      expect(userMessage).toContain('Please review the proposal by tomorrow.');
      expect(userMessage).toContain('Bob');
      expect(userMessage).not.toContain('data:image');
      expect(userMessage).not.toContain(hugeBase64);
      expect(userMessage).not.toContain('<style>');
      expect(userMessage).not.toContain('<!--');
    });
  });

  describe('POST /api/ai/explain', () => {
    it('returns 400 if bodyText and subject are missing', async () => {
      const req = new Request('http://localhost/api/ai/explain', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await explainPost(req);
      expect(res.status).toBe(400);
    });

    it('returns structured explanation JSON on success and strips HTML markup from prompt', async () => {
      const mockExplanation = {
        summary: 'This is a meeting confirmation.',
        takeaways: ['Meeting at 2pm'],
        actionItems: ['Accept invite'],
        sentiment: 'Friendly',
        jargon: [],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockExplanation) } }],
        }),
      });

      const req = new Request('http://localhost/api/ai/explain', {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Meeting',
          bodyText: '<div><style>p { font-size: 12px; }</style><p>Let us meet at 2pm.</p></div>',
        }),
      });
      const res = await explainPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.explanation.summary).toBe('This is a meeting confirmation.');
      expect(json.explanation.takeaways).toContain('Meeting at 2pm');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const reqBody = JSON.parse(fetchCall[1].body);
      const userMessage = reqBody.messages.find((m: any) => m.role === 'user').content;
      expect(userMessage).not.toContain('<style>');
      expect(userMessage).toContain('Let us meet at 2pm.');
    });
  });

  describe('POST /api/ai/toolbox', () => {
    it('returns 400 if tool or text is missing', async () => {
      const req = new Request('http://localhost/api/ai/toolbox', {
        method: 'POST',
        body: JSON.stringify({ tool: 'extract_tasks' }),
      });
      const res = await toolboxPost(req);
      expect(res.status).toBe(400);
    });

    it('executes requested toolbox tool successfully with sanitized input', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '- Send report by Friday' } }],
        }),
      });

      const req = new Request('http://localhost/api/ai/toolbox', {
        method: 'POST',
        body: JSON.stringify({
          tool: 'extract_tasks',
          text: '<p>Please send report by <b>Friday</b>.<br><img src="data:image/png;base64,123"/></p>',
        }),
      });
      const res = await toolboxPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.tool).toBe('extract_tasks');
      expect(json.result).toContain('Send report by Friday');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const reqBody = JSON.parse(fetchCall[1].body);
      const userMessage = reqBody.messages.find((m: any) => m.role === 'user').content;
      expect(userMessage).not.toContain('<p>');
      expect(userMessage).not.toContain('data:image');
    });
  });
});
