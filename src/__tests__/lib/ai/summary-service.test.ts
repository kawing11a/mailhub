import { generateEmailBatchSummary } from '../../../lib/ai/summary-service';

describe('AI LLM Email Summarization Service', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns fallback string when email list is empty', async () => {
    const summary = await generateEmailBatchSummary({
      provider: 'openai',
      labelName: 'Invoices',
      emails: [],
    });

    expect(summary).toContain('No emails found under label **Invoices** to summarize.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('calls OpenAI endpoint and returns generated summary text', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: '- Invoice #1024 paid\n- Renewal due next week',
            },
          },
        ],
      }),
    });

    const summary = await generateEmailBatchSummary({
      provider: 'openai',
      apiKey: 'sk-test-key',
      modelName: 'gpt-4o-mini',
      labelName: 'Finance',
      emails: [
        {
          id: '1',
          subject: 'Invoice Paid',
          fromName: 'Stripe',
          fromAddress: 'receipts@stripe.com',
          snippet: 'Payment of $49 succeeded',
          receivedAt: new Date('2026-08-04T12:00:00Z'),
        },
      ],
    });

    expect(summary).toBe('- Invoice #1024 paid\n- Renewal due next week');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      })
    );
  });

  test('calls Claude endpoint with x-api-key header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'Claude summary of emails' }],
      }),
    });

    const summary = await generateEmailBatchSummary({
      provider: 'claude',
      apiKey: 'claude-key',
      modelName: 'claude-3-5-sonnet-20241022',
      labelName: 'Support',
      emails: [
        {
          id: '2',
          subject: 'Ticket #404',
          snippet: 'Password reset request',
        },
      ],
    });

    expect(summary).toBe('Claude summary of emails');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'claude-key',
        }),
      })
    );
  });

  test('includes cleaned bodyText in single pass prompt when bodyText is provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Summary of body text email' } }],
      }),
    });

    const summary = await generateEmailBatchSummary({
      provider: 'openai',
      apiKey: 'sk-test-key',
      labelName: 'Support',
      emails: [
        {
          id: '10',
          subject: 'Full Body Email',
          bodyText: '<p>Hello <b>World</b>!</p><script>alert("xss")</script> This is full body content.',
        },
      ],
    });

    expect(summary).toBe('Summary of body text email');
    const fetchBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const userMessageContent = fetchBody.messages.find((m: { role: string }) => m.role === 'user').content;
    expect(userMessageContent).toContain('This is full body content.');
    expect(userMessageContent).not.toContain('<script>');
  });

  test('triggers Map-Reduce chunked summarization for email batches exceeding threshold', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '- Chunk 1 summary' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '- Chunk 2 summary' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Final reduced executive summary' } }] }),
      });

    const dummyEmails = Array.from({ length: 25 }, (_, i) => ({
      id: `email-${i}`,
      subject: `Subject ${i}`,
      snippet: `Snippet ${i}`,
      bodyText: `Full body content for email ${i}`,
    }));

    const summary = await generateEmailBatchSummary({
      provider: 'openai',
      apiKey: 'sk-test-key',
      labelName: 'Support',
      emails: dummyEmails,
      chunkSize: 15,
    });

    expect(summary).toBe('Final reduced executive summary');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});

