import {
  evaluateCriterion,
  evaluateRule,
  evaluateRulesAgainstEmail,
  applyRuleActions,
  normalizeEmailAddressField,
} from '@/lib/rules/engine';
import { EmailEvaluationInput, EmailRuleDefinition, RuleCriterion } from '@/lib/rules/types';
import { sendEmail } from '@/lib/smtp/sender';
import { getReceivedAttachment } from '@/lib/email/attachment-retrieval';

jest.mock('@/lib/smtp/sender', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'message-1' }),
}));

jest.mock('@/lib/email/attachment-retrieval', () => ({
  getReceivedAttachment: jest.fn(),
}));

const mockedSendEmail = jest.mocked(sendEmail);
const mockedGetReceivedAttachment = jest.mocked(getReceivedAttachment);

describe('Email Rules Engine', () => {

  describe('normalizeEmailAddressField', () => {
    it('normalizes Prisma JSON address values to the rule input shape', () => {
      expect(
        normalizeEmailAddressField([
          { address: 'to@example.com', name: 'Recipient' },
          'cc@example.com',
        ])
      ).toEqual([
        { address: 'to@example.com', name: 'Recipient' },
        { address: 'cc@example.com' },
      ]);
    });

    it('returns null for JSON values that cannot represent addresses', () => {
      expect(normalizeEmailAddressField(123)).toBeNull();
      expect(normalizeEmailAddressField({ address: 'not-an-array' })).toBeNull();
    });
  });

  const sampleEmail: EmailEvaluationInput = {
    id: 'email-123',
    accountId: 'acc-1',
    fromAddress: 'billing@stripe.com',
    fromName: 'Stripe Payments',
    toAddresses: [{ address: 'inbox@mycompany.com', name: 'Company Inbox' }],
    ccAddresses: ['finance@mycompany.com'],
    subject: 'Your Stripe Monthly Invoice #10293',
    bodyText: 'Please find attached the invoice for services rendered. Total amount: $120.00.',
    hasAttachments: true,
    isRead: false,
    isStarred: false,
    isHighRisk: false,
    labelIds: ['label-existing'],
  };

  describe('evaluateCriterion', () => {
    it('matches from address with contains operator', () => {
      const criterion: RuleCriterion = {
        field: 'from',
        operator: 'contains',
        value: '@stripe.com',
      };
      expect(evaluateCriterion(sampleEmail, criterion)).toBe(true);
    });

    it('matches from name case-insensitively', () => {
      const criterion: RuleCriterion = {
        field: 'from',
        operator: 'contains',
        value: 'stripe payments',
      };
      expect(evaluateCriterion(sampleEmail, criterion)).toBe(true);
    });

    it('handles not_contains operator correctly', () => {
      const criterion: RuleCriterion = {
        field: 'from',
        operator: 'not_contains',
        value: '@paypal.com',
      };
      expect(evaluateCriterion(sampleEmail, criterion)).toBe(true);
    });

    it('matches to/cc addresses formatted as objects or strings', () => {
      expect(
        evaluateCriterion(sampleEmail, {
          field: 'to',
          operator: 'contains',
          value: 'inbox@mycompany.com',
        })
      ).toBe(true);

      expect(
        evaluateCriterion(sampleEmail, {
          field: 'cc',
          operator: 'contains',
          value: 'finance@',
        })
      ).toBe(true);
    });

    it('matches subject with starts_with and ends_with', () => {
      expect(
        evaluateCriterion(sampleEmail, {
          field: 'subject',
          operator: 'starts_with',
          value: 'your stripe',
        })
      ).toBe(true);

      expect(
        evaluateCriterion(sampleEmail, {
          field: 'subject',
          operator: 'ends_with',
          value: '#10293',
        })
      ).toBe(true);
    });

    it('matches regex pattern safely', () => {
      expect(
        evaluateCriterion(sampleEmail, {
          field: 'subject',
          operator: 'matches_regex',
          value: 'invoice\\s*#\\d+',
        })
      ).toBe(true);

      expect(
        evaluateCriterion(sampleEmail, {
          field: 'subject',
          operator: 'matches_regex',
          value: 'receipt\\s*#\\d+',
        })
      ).toBe(false);
    });

    it('matches body keywords', () => {
      expect(
        evaluateCriterion(sampleEmail, {
          field: 'body',
          operator: 'contains',
          value: 'total amount: $120.00',
        })
      ).toBe(true);

      expect(
        evaluateCriterion(sampleEmail, {
          field: 'body',
          operator: 'contains',
          value: 'crypto discount',
        })
      ).toBe(false);
    });

    it('matches hasAttachment boolean', () => {
      expect(
        evaluateCriterion(sampleEmail, {
          field: 'hasAttachment',
          operator: 'equals',
          value: true,
        })
      ).toBe(true);

      expect(
        evaluateCriterion(sampleEmail, {
          field: 'hasAttachment',
          operator: 'equals',
          value: false,
        })
      ).toBe(false);
    });

    it('matches hasLabelId correctly', () => {
      expect(
        evaluateCriterion(sampleEmail, {
          field: 'hasLabelId',
          operator: 'equals',
          value: 'label-existing',
        })
      ).toBe(true);

      expect(
        evaluateCriterion(sampleEmail, {
          field: 'hasLabelId',
          operator: 'equals',
          value: 'label-other',
        })
      ).toBe(false);
    });
  });

  describe('evaluateRule', () => {
    const baseRule: EmailRuleDefinition = {
      id: 'rule-1',
      name: 'Stripe Invoice Tagger',
      isActive: true,
      priority: 1,
      accountId: null,
      conditions: {
        matchType: 'ALL',
        criteria: [
          { field: 'from', operator: 'contains', value: '@stripe.com' },
          { field: 'subject', operator: 'contains', value: 'Invoice' },
        ],
      },
      actions: {
        addLabelIds: ['label-invoices'],
        markAsStarred: true,
      },
    };

    it('evaluates matchType: ALL successfully when all criteria match', () => {
      expect(evaluateRule(sampleEmail, baseRule)).toBe(true);
    });

    it('fails matchType: ALL when one criterion does not match', () => {
      const failingRule: EmailRuleDefinition = {
        ...baseRule,
        conditions: {
          matchType: 'ALL',
          criteria: [
            { field: 'from', operator: 'contains', value: '@stripe.com' },
            { field: 'subject', operator: 'contains', value: 'Payment Failed' },
          ],
        },
      };
      expect(evaluateRule(sampleEmail, failingRule)).toBe(false);
    });

    it('evaluates matchType: ANY successfully when at least one criterion matches', () => {
      const anyRule: EmailRuleDefinition = {
        ...baseRule,
        conditions: {
          matchType: 'ANY',
          criteria: [
            { field: 'from', operator: 'contains', value: '@paypal.com' },
            { field: 'subject', operator: 'contains', value: 'Invoice' },
          ],
        },
      };
      expect(evaluateRule(sampleEmail, anyRule)).toBe(true);
    });

    it('respects accountId scoping', () => {
      const specificAccountRule: EmailRuleDefinition = {
        ...baseRule,
        accountId: 'acc-2', // Email is in acc-1
      };
      expect(evaluateRule(sampleEmail, specificAccountRule)).toBe(false);

      const matchingAccountRule: EmailRuleDefinition = {
        ...baseRule,
        accountId: 'acc-1',
      };
      expect(evaluateRule(sampleEmail, matchingAccountRule)).toBe(true);
    });

    it('matches a rule when the email account currently has the target label', () => {
      const rule = { ...baseRule, accountLabelId: 'label-vip' };
      expect(
        evaluateRule({ ...sampleEmail, accountLabelIds: ['label-vip'] }, rule)
      ).toBe(true);
    });

    it('stops matching after the target account label is removed', () => {
      const rule = { ...baseRule, accountLabelId: 'label-vip' };
      expect(evaluateRule({ ...sampleEmail, accountLabelIds: [] }, rule)).toBe(false);
    });

    it('matches every email when criteria is empty', () => {
      const rule: EmailRuleDefinition = {
        ...baseRule,
        conditions: { matchType: 'ALL', criteria: [] },
      };

      expect(evaluateRule(sampleEmail, rule)).toBe(true);
    });

    it('still enforces account scope when criteria is empty', () => {
      const rule: EmailRuleDefinition = {
        ...baseRule,
        accountId: 'acc-2',
        conditions: { matchType: 'ALL', criteria: [] },
      };

      expect(evaluateRule(sampleEmail, rule)).toBe(false);
    });

    it('does not match a scoped unconditional rule when the email accountId is missing', () => {
      const rule: EmailRuleDefinition = {
        ...baseRule,
        accountId: 'acc-1',
        conditions: { matchType: 'ALL', criteria: [] },
      };

      expect(evaluateRule({ ...sampleEmail, accountId: undefined }, rule)).toBe(false);
    });

    it('ignores inactive rules', () => {
      const inactiveRule: EmailRuleDefinition = {
        ...baseRule,
        isActive: false,
      };
      expect(evaluateRule(sampleEmail, inactiveRule)).toBe(false);
    });
  });

  describe('evaluateRulesAgainstEmail', () => {
    const rule1: EmailRuleDefinition = {
      id: 'rule-1',
      name: 'Label Invoices',
      isActive: true,
      priority: 1,
      conditions: {
        matchType: 'ALL',
        criteria: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
      },
      actions: {
        addLabelIds: ['label-invoices'],
        markAsStarred: true,
      },
    };

    const rule2: EmailRuleDefinition = {
      id: 'rule-2',
      name: 'Mark Read & Stop',
      isActive: true,
      priority: 2,
      stopProcessing: true,
      conditions: {
        matchType: 'ALL',
        criteria: [{ field: 'from', operator: 'contains', value: 'stripe' }],
      },
      actions: {
        markAsRead: true,
      },
    };

    const rule3: EmailRuleDefinition = {
      id: 'rule-3',
      name: 'High Risk Tagger',
      isActive: true,
      priority: 3,
      conditions: {
        matchType: 'ALL',
        criteria: [{ field: 'body', operator: 'contains', value: 'total amount' }],
      },
      actions: {
        markAsHighRisk: true,
      },
    };

    it('executes in priority order and stops when stopProcessing is set', () => {
      const { matchedRules, combinedActions } = evaluateRulesAgainstEmail(sampleEmail, [
        rule1,
        rule2,
        rule3,
      ]);

      expect(matchedRules).toHaveLength(2);
      expect(matchedRules[0].id).toBe('rule-1');
      expect(matchedRules[1].id).toBe('rule-2');

      // Rule 3 should be skipped because Rule 2 had stopProcessing = true
      expect(combinedActions.addLabelIds).toEqual(['label-invoices']);
      expect(combinedActions.markAsStarred).toBe(true);
      expect(combinedActions.markAsRead).toBe(true);
      expect(combinedActions.markAsHighRisk).toBeUndefined();
    });
  });

  describe('applyRuleActions', () => {
    it('applies label mutations and status updates on prisma client', async () => {
      const mockPrisma = {
        email: {
          update: jest.fn().mockResolvedValue({ id: 'email-123' }),
        },
        emailLabel: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const actions = {
        addLabelIds: ['label-invoices', 'label-finance'],
        removeLabelIds: ['label-unprocessed'],
        markAsRead: true,
        markAsStarred: true,
      };

      await applyRuleActions('email-123', actions, mockPrisma as any);

      expect(mockPrisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-123' },
        data: {
          isRead: true,
          isStarred: true,
        },
      });

      expect(mockPrisma.emailLabel.createMany).toHaveBeenCalledWith({
        data: [
          { emailId: 'email-123', labelId: 'label-invoices' },
          { emailId: 'email-123', labelId: 'label-finance' },
        ],
        skipDuplicates: true,
      });

      expect(mockPrisma.emailLabel.deleteMany).toHaveBeenCalledWith({
        where: {
          emailId: 'email-123',
          labelId: { in: ['label-unprocessed'] },
        },
      });
    });
  });

  describe('processRulesForNewEmail', () => {
    beforeEach(() => {
      mockedSendEmail.mockClear();
      mockedGetReceivedAttachment.mockReset();
    });

    it('evaluates rules and applies actions for newly ingested emails', async () => {
      const mockPrisma = {
        emailRule: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'rule-auto-1',
              name: 'Forward Alerts',
              isActive: true,
              priority: 1,
              conditions: {
                matchType: 'ALL',
                criteria: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
              },
              actions: {
                addLabelIds: ['label-invoices'],
                markAsStarred: true,
                forwardTo: ['ops@company.com'],
              },
            },
          ]),
        },
        email: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'email-new-1',
            accountId: 'acc-1',
            fromAddress: 'billing@stripe.com',
            fromName: 'Stripe',
            subject: 'Invoice #1024',
            body: { bodyText: 'Here is your monthly invoice.' },
            emailLabels: [],
          }),
          update: jest.fn().mockResolvedValue({ id: 'email-new-1' }),
        },
        emailLabel: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const { processRulesForNewEmail } = await import('@/lib/rules/engine');
      await processRulesForNewEmail('email-new-1', 'acc-1', 'org-1', mockPrisma as any);

      expect(mockPrisma.emailRule.findMany).toHaveBeenCalled();
      expect(mockPrisma.email.findUnique).toHaveBeenCalledWith({
        where: { id: 'email-new-1' },
        include: {
          body: true,
          emailLabels: true,
          attachments: {
            select: {
              id: true,
              filename: true,
              contentType: true,
              sizeBytes: true,
              storagePath: true,
              ordinal: true,
              imapPart: true,
              gmailAttachmentId: true,
              createdAt: true,
            },
          },
          account: { select: { accountLabels: { select: { labelId: true } } } },
        },
      });
      expect(mockPrisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-new-1' },
        data: { isStarred: true },
      });
      expect(mockPrisma.emailLabel.createMany).toHaveBeenCalledWith({
        data: [{ emailId: 'email-new-1', labelId: 'label-invoices' }],
        skipDuplicates: true,
      });
    });

    it('forwards all received attachments with the original message', async () => {
      const mockPrisma = {
        emailRule: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'rule-forward-1',
              name: 'Forward Attachment Emails',
              isActive: true,
              priority: 1,
              conditions: {
                matchType: 'ALL',
                criteria: [{ field: 'hasAttachment', operator: 'equals', value: true }],
              },
              actions: {
                forwardTo: ['ops@company.com'],
              },
            },
          ]),
        },
        email: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'email-1',
            accountId: 'acc-1',
            fromAddress: 'sender@example.com',
            fromName: 'Sender',
            subject: 'Quarterly package',
            hasAttachments: true,
            isRead: false,
            isStarred: false,
            isHighRisk: false,
            body: {
              bodyText: 'Please review the attached files.',
              bodyHtml: '<p>Please review the attached files.</p>',
            },
            emailLabels: [],
            account: {
              accountLabels: [],
            },
            attachments: [
              {
                id: 'att-1',
                filename: 'a.pdf',
                contentType: 'application/pdf',
                sizeBytes: 1,
                storagePath: '/tmp/a.pdf',
                ordinal: 0,
                imapPart: null,
                gmailAttachmentId: null,
              },
              {
                id: 'att-2',
                filename: 'b.png',
                contentType: 'image/png',
                sizeBytes: 1,
                storagePath: '/tmp/b.png',
                ordinal: 1,
                imapPart: null,
                gmailAttachmentId: null,
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({ id: 'email-1' }),
        },
        emailLabel: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      mockedGetReceivedAttachment
        .mockResolvedValueOnce({
          filename: 'a.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1,
          content: Buffer.from('a'),
        })
        .mockResolvedValueOnce({
          filename: 'b.png',
          contentType: 'image/png',
          sizeBytes: 1,
          content: Buffer.from('b'),
        });

      const { processRulesForNewEmail } = await import('@/lib/rules/engine');
      await processRulesForNewEmail('email-1', 'acc-1', 'org-1', mockPrisma as any);

      expect(mockedSendEmail).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          attachments: [
            {
              filename: 'a.pdf',
              contentType: 'application/pdf',
              content: Buffer.from('a').toString('base64'),
            },
            {
              filename: 'b.png',
              contentType: 'image/png',
              content: Buffer.from('b').toString('base64'),
            },
          ],
        })
      );
    });

    it('does not send a partial forward when an attachment cannot be retrieved', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockPrisma = {
        emailRule: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'rule-forward-1',
              name: 'Forward Attachment Emails',
              isActive: true,
              priority: 1,
              conditions: {
                matchType: 'ALL',
                criteria: [{ field: 'hasAttachment', operator: 'equals', value: true }],
              },
              actions: {
                forwardTo: ['ops@company.com'],
              },
            },
          ]),
        },
        email: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'email-1',
            accountId: 'acc-1',
            fromAddress: 'sender@example.com',
            fromName: 'Sender',
            subject: 'Quarterly package',
            hasAttachments: true,
            isRead: false,
            isStarred: false,
            isHighRisk: false,
            body: {
              bodyText: 'Please review the attached files.',
              bodyHtml: '<p>Please review the attached files.</p>',
            },
            emailLabels: [],
            account: {
              accountLabels: [],
            },
            attachments: [
              {
                id: 'att-1',
                filename: 'a.pdf',
                contentType: 'application/pdf',
                sizeBytes: 1,
                storagePath: '/tmp/a.pdf',
                ordinal: 0,
                imapPart: null,
                gmailAttachmentId: null,
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({ id: 'email-1' }),
        },
        emailLabel: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      mockedGetReceivedAttachment.mockRejectedValue(new Error('provider unavailable'));

      const { processRulesForNewEmail } = await import('@/lib/rules/engine');
      await processRulesForNewEmail('email-1', 'acc-1', 'org-1', mockPrisma as any);

      expect(mockedSendEmail).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('uses current account labels for label-scoped automatic rule execution', async () => {
      const mockPrisma = {
        emailRule: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'rule-auto-label-1',
              name: 'VIP Invoice Rule',
              isActive: true,
              priority: 1,
              accountId: null,
              accountLabelId: 'label-vip',
              conditions: {
                matchType: 'ALL',
                criteria: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
              },
              actions: { markAsStarred: true },
            },
          ]),
        },
        email: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'email-vip-1',
            accountId: 'acc-1',
            fromAddress: 'billing@stripe.com',
            fromName: 'Stripe',
            subject: 'Invoice #2001',
            hasAttachments: false,
            isRead: false,
            isStarred: false,
            isHighRisk: false,
            body: { bodyText: 'VIP invoice body' },
            emailLabels: [],
            account: { accountLabels: [{ labelId: 'label-vip' }] },
          }),
          update: jest.fn().mockResolvedValue({ id: 'email-vip-1' }),
        },
        emailLabel: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const { processRulesForNewEmail } = await import('@/lib/rules/engine');
      await processRulesForNewEmail('email-vip-1', 'acc-1', 'org-1', mockPrisma as any);

      expect(mockPrisma.emailRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ accountId: null }),
              expect.objectContaining({ accountId: 'acc-1' }),
              expect.objectContaining({ accountLabel: expect.any(Object) }),
            ]),
          }),
        })
      );
      expect(mockPrisma.email.update).toHaveBeenCalledWith({
        where: { id: 'email-vip-1' },
        data: { isStarred: true },
      });
    });

  });
});
