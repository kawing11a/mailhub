import { z } from 'zod';

// --- Auth schemas ---

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().min(1, 'Organization name is required').max(255),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// --- Organization schemas ---

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, 'Name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'member']).default('member'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

// --- Email Account schemas ---

export const createAccountSchema = z.object({
  label: z.string().min(1).max(100),
  emailAddress: z.string().email(),
  provider: z.enum(['imap', 'gmail', 'outlook']),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color')
    .optional(),
  avatarInitials: z.string().max(3).optional(),

  // IMAP/SMTP fields (required if provider is 'imap')
  imapHost: z.string().optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
}).refine(
  (data) => {
    if (data.provider === 'imap') {
      return !!(data.imapHost && data.imapPort && data.smtpHost && data.smtpPort && data.username && data.password);
    }
    return true;
  },
  { message: 'IMAP/SMTP fields are required for imap provider' }
);

export const updateAccountSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  avatarInitials: z.string().max(3).optional(),
  isActive: z.boolean().optional(),
  
  // allow updating IMAP credentials
  imapHost: z.string().optional(),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

// --- Email operation schemas ---

export const sendEmailSchema = z.object({
  draftId: z.string().optional(),
  to: z.array(z.string().email('Invalid email address')),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
});

export const updateEmailSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
});

// --- Label schemas ---

export const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#3B82F6'),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

export const updateLabelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  description: z.string().optional(),
  icon: z.string().max(50).optional(),
});

export const updateLabelAccountsSchema = z.object({
  accountIds: z.array(z.string().uuid()).max(200),
});

export const bulkEmailLabelsSchema = z
  .object({
    emailIds: z.array(z.string().uuid()).min(1).max(100),
    addLabelIds: z.array(z.string().uuid()).max(50).default([]),
    removeLabelIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine((d) => d.addLabelIds.length + d.removeLabelIds.length > 0, {
    message: 'Provide at least one label to add or remove',
  });

// --- Query schemas ---

export const emailListQuerySchema = z.object({
  folder: z.enum(['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM']).default('INBOX'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
  unreadOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  labelId: z.string().uuid().optional(),
});

// --- Type exports ---

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailSchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type UpdateLabelAccountsInput = z.infer<typeof updateLabelAccountsSchema>;
export type BulkEmailLabelsInput = z.infer<typeof bulkEmailLabelsSchema>;
export type EmailListQuery = z.infer<typeof emailListQuerySchema>;
