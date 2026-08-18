'use client';

import { CalendarEventSection } from '@/components/calendar/CalendarEventSection';
import { isCalendarAttachment } from '@/lib/calendar/ics-parser';
import { LabelBadge } from '@/components/labels/LabelBadge';
import { buildReplyAllRecipients } from '@/lib/email/addresses';
import { extractCleanEmailText } from '@/lib/email/clean-text';
import { formatStoredAddresses } from '@/lib/email/display-addresses';
import { getEmailDisplayTimestamp } from '@/lib/email/timestamps';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, AlertTriangle, Download, Forward, Loader2, Mail, Paperclip, Reply, ReplyAll, Sparkles, Trash2, ShieldAlert, ShieldCheck, ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { EmailExplainPanel } from './EmailExplainPanel';
import { EmailToolbox } from './EmailToolbox';
import { RuleModal } from '@/components/rules/RuleModal';

interface EmailViewerProps {
  emailId: string;
  onBack?: () => void;
}

export function EmailViewer({ emailId, onBack }: EmailViewerProps) {
  const { selectedAccountId, setComposeModalOpen, setComposeDraft } = useAccountStore();
  const { showAvatars, timeFormat } = useUIStore();

  const [downloadConfirmStep, setDownloadConfirmStep] = useState(0);
  const [pendingDownloadUrl, setPendingDownloadUrl] = useState<string | null>(null);
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [initialRuleData, setInitialRuleData] = useState<any | null>(null);

  const queryClient = useQueryClient();
  const { data: email, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${selectedAccountId}/emails/${emailId}`);
      if (!res.ok) throw new Error('Failed to fetch email');
      return res.json();
    },
    enabled: !!emailId && !!selectedAccountId,
  });

  const { data: labelsData } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      return res.json();
    },
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      return res.json();
    },
  });

  const labels = labelsData?.labels || [];
  const accounts = Array.isArray(accountsData) ? accountsData : [];

  const handleCreateRuleFromEmail = () => {
    if (!email) return;
    setInitialRuleData({
      name: `Filter: ${email.fromName || email.fromAddress}`,
      accountId: email.accountId,
      conditions: {
        matchType: 'ALL',
        criteria: [
          { field: 'from', operator: 'contains', value: email.fromAddress || '' },
        ],
      },
      actions: {
        addLabelIds: [],
        markAsRead: false,
        markAsStarred: false,
      },
    });
    setIsRuleModalOpen(true);
  };

  const labelSpamMutation = useMutation({
    mutationFn: async (label: 'spam' | 'ham') => {
      if (!email) return;
      const res = await fetch('/api/ai/spam/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId: email.id,
          subject: email.subject,
          snippet: email.snippet,
          fromAddress: email.fromAddress,
          label,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit spam feedback');
      return data;
    },
    onSuccess: (data, label) => {
      queryClient.setQueryData(['email', emailId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          isHighRisk: label === 'spam',
          riskReason: label === 'spam' ? 'Flagged as definite spam by user feedback' : null,
        };
      });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['spam-stats'] });
      toast.success(
        label === 'spam'
          ? '🎯 Marked as Definite Spam. Model trained!'
          : '🛡️ Marked as Safe. Model updated!'
      );
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update spam label');
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ isRead }: { isRead: boolean }) => {
      const res = await fetch(`/api/accounts/${selectedAccountId}/emails/${emailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead }),
      });
      if (!res.ok) throw new Error('Failed to update email');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['accountStats'] });
      queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
      if (onBack) onBack();
    },
  });

  const handleMarkUnread = () => {
    updateEmailMutation.mutate({ isRead: false });
  };

  const deleteEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/accounts/${selectedAccountId}/emails/${emailId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete email');
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['accountStats'] });
      queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });

      if (result?.serverSynced === false) {
        toast.error('Removed locally, but the mail server could not be updated');
      } else {
        toast.success(result?.permanent ? 'Email permanently deleted' : 'Email moved to trash');
      }
      if (onBack) onBack();
    },
    onError: () => toast.error('Failed to delete email'),
  });

  const handleDelete = () => {
    // Deleting from trash is permanent and propagates to the mail server.
    if (email?.folder === 'TRASH') {
      const confirmed = window.confirm(
        `Permanently delete "${email.subject || '(no subject)'}"?\n\nThis removes it from the mail server too and cannot be undone.`
      );
      if (!confirmed) return;
    }
    deleteEmailMutation.mutate();
  };

  const labelCounts = useMemo(
    () =>
      new Map<string, number>(
        (email?.emailLabels || []).map((el: any) => [el.label.id, 1] as [string, number])
      ),
    [email?.emailLabels]
  );

  const regularAttachments = useMemo(() => {
    if (!email?.attachments) return [];
    return email.attachments.filter((att: any) => !isCalendarAttachment(att));
  }, [email?.attachments]);

  const calendarAttachments = useMemo(() => {
    if (!email?.attachments) return [];
    return email.attachments.filter((att: any) => isCalendarAttachment(att));
  }, [email?.attachments]);

  const inlineIcsContent = useMemo(() => {
    if (calendarAttachments.length > 0) return null;
    const text = email?.body?.bodyText || '';
    if (text.includes('BEGIN:VCALENDAR')) {
      const startIdx = text.indexOf('BEGIN:VCALENDAR');
      const endIdx = text.indexOf('END:VCALENDAR');
      if (endIdx > startIdx) {
        return text.substring(startIdx, endIdx + 'END:VCALENDAR'.length);
      }
    }
    const html = email?.body?.bodyHtml || '';
    if (html.includes('BEGIN:VCALENDAR')) {
      const startIdx = html.indexOf('BEGIN:VCALENDAR');
      const endIdx = html.indexOf('END:VCALENDAR');
      if (endIdx > startIdx) {
        const raw = html.substring(startIdx, endIdx + 'END:VCALENDAR'.length);
        return raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
      }
    }
    return null;
  }, [email?.body?.bodyText, email?.body?.bodyHtml, calendarAttachments]);

  const hasMeetingInEmail = useMemo(() => {
    if (calendarAttachments.length > 0 || inlineIcsContent) return true;
    const combined = (email?.body?.bodyText || '') + ' ' + (email?.body?.bodyHtml || '');
    return combined.includes('teams.microsoft.com') || combined.includes('Microsoft Teams meeting') || combined.includes('zoom.us') || combined.includes('meet.google.com');
  }, [calendarAttachments.length, inlineIcsContent, email?.body?.bodyText, email?.body?.bodyHtml]);

  const getFormattedDate = (date?: Date | null) => {
    if (!date) return '';
    return format(date, timeFormat === '24h' ? 'MMM d, yyyy, HH:mm' : 'MMM d, yyyy, h:mm a');
  };

  const toRecipients = formatStoredAddresses(email?.toAddresses);
  const ccRecipients = formatStoredAddresses(email?.ccAddresses);
  const bccRecipients = formatStoredAddresses(email?.bccAddresses);
  const canShowBcc = email?.folder === 'SENT' || email?.isDraft;
  const displayTimestamp = email ? getEmailDisplayTimestamp(email) : null;

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleReply = () => {
    if (!email) return;
    const fromStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    const dateStr = getFormattedDate(getEmailDisplayTimestamp(email));
    const quoteHtml = `
      <br/><br/>
      <div class="gmail_quote" style="border-left: 1px solid #ccc; margin: 0 0 0 .8ex; padding-left: 1ex;">
        On ${dateStr}, ${fromStr} wrote:<br/>
        <blockquote class="gmail_quote" style="margin: 0 0 0 .8ex; border-left: 1px #ccc solid; padding-left: 1ex;">
          ${email.body?.bodyHtml || email.body?.bodyText || ''}
        </blockquote>
      </div>
    `;
    const cleanBody = email.body?.bodyText || extractCleanEmailText(email.body?.bodyHtml);
    setComposeDraft({
      accountId: email.accountId,
      to: email.fromAddress,
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      bodyHtml: quoteHtml,
      replyToSubject: email.subject,
      replyToBody: cleanBody,
    });
    setComposeModalOpen(true);
  };

  const handleReplyAll = () => {
    if (!email) return;
    const fromStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    const dateStr = getFormattedDate(getEmailDisplayTimestamp(email));
    const quoteHtml = `
      <br/><br/>
      <div class="gmail_quote" style="border-left: 1px solid #ccc; margin: 0 0 0 .8ex; padding-left: 1ex;">
        On ${dateStr}, ${fromStr} wrote:<br/>
        <blockquote class="gmail_quote" style="margin: 0 0 0 .8ex; border-left: 1px #ccc solid; padding-left: 1ex;">
          ${email.body?.bodyHtml || email.body?.bodyText || ''}
        </blockquote>
      </div>
    `;

    const recipients = buildReplyAllRecipients({
      replyTo: email.replyTo,
      fromAddress: email.fromAddress,
      toAddresses: email.toAddresses,
      ccAddresses: email.ccAddresses,
      currentAccountAddress: email.account?.emailAddress,
    });

    const cleanBody = email.body?.bodyText || extractCleanEmailText(email.body?.bodyHtml);
    setComposeDraft({
      accountId: email.accountId,
      to: recipients.to.join(', '),
      cc: recipients.cc.join(', '),
      subject: email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject || ''}`,
      bodyHtml: quoteHtml,
      replyToSubject: email.subject,
      replyToBody: cleanBody,
    });
    setComposeModalOpen(true);
  };

  const handleForward = () => {
    if (!email) return;
    const fromStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    const dateStr = getFormattedDate(getEmailDisplayTimestamp(email));
    const quoteHtml = `
      <br/><br/>
      <div class="gmail_quote">
        ---------- Forwarded message ---------<br/>
        From: ${fromStr}<br/>
        Date: ${dateStr}<br/>
        Subject: ${email.subject || ''}<br/>
        To: ${email.toAddresses?.map((t: any) => t.address).join(', ') || ''}<br/>
        <br/>
        ${email.body?.bodyHtml || email.body?.bodyText || ''}
      </div>
    `;
    const cleanBody = email.body?.bodyText || extractCleanEmailText(email.body?.bodyHtml);
    setComposeDraft({
      accountId: email.accountId,
      to: '',
      subject: email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`,
      bodyHtml: quoteHtml,
      replyToSubject: email.subject,
      replyToBody: cleanBody,
    });
    setComposeModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Email not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-md sm:hidden">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h2 className="text-xl font-semibold text-gray-900 truncate">
            {email.subject || '(No Subject)'}
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <EmailToolbox
            accountId={email.accountId || selectedAccountId || undefined}
            emailSubject={email.subject || ''}
            emailText={email.body?.bodyText || email.snippet || ''}
          />
          <button
            onClick={() => setIsExplainOpen(!isExplainOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors shadow-xs ${
              isExplainOpen
                ? 'bg-purple-600 text-white border-purple-600'
                : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
            }`}
            title="AI Explain Email"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>AI Explain</span>
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button onClick={handleReply} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" title="Reply">
            <Reply className="w-5 h-5" />
          </button>
          <button onClick={handleReplyAll} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" title="Reply All">
            <ReplyAll className="w-5 h-5" />
          </button>
          <button onClick={handleForward} className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" title="Forward">
            <Forward className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button
            onClick={handleCreateRuleFromEmail}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Create rule from this email"
          >
            <ListFilter className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button
            onClick={() => labelSpamMutation.mutate(email.isHighRisk ? 'ham' : 'spam')}
            disabled={labelSpamMutation.isPending}
            className={`p-2 rounded-md transition-colors ${
              email.isHighRisk
                ? 'text-green-600 hover:bg-green-50'
                : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
            }`}
            title={email.isHighRisk ? "Mark & Train as Safe (Not Spam)" : "Report & Train as Definite Spam"}
          >
            {email.isHighRisk ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          {email.folder === 'INBOX' && (
            <>
              <button
                onClick={handleMarkUnread}
                disabled={updateEmailMutation.isPending}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                title="Mark as unread"
              >
                {updateEmailMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
              </button>
              <div className="w-px h-6 bg-gray-200 mx-1" />
            </>
          )}
          <button
            onClick={handleDelete}
            disabled={deleteEmailMutation.isPending}
            className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
            title={email?.folder === 'TRASH' ? 'Delete permanently' : 'Delete'}
          >
            {deleteEmailMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Header Info */}
      <div className="p-6 border-b border-gray-100 flex items-start justify-between">
        <div className="flex items-center space-x-3">
          {showAvatars && (
            <div className="w-10 h-10 rounded-full bg-accent-100 flex flex-shrink-0 items-center justify-center text-accent-700 font-medium">
              {email.fromName ? email.fromName.charAt(0).toUpperCase() : '?'}
            </div>
          )}
          <div>
            <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
              <span>{email.fromName}</span>
              <span className="text-gray-500 text-sm font-normal">&lt;{email.fromAddress}&gt;</span>
              {email.account && (
                <span
                  className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300"
                  title={email.account.emailAddress}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: email.account.color || '#3B82F6' }}
                  />
                  <span>{email.account.label || email.account.emailAddress}</span>
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 mt-0.5">
              To: {toRecipients}
            </div>
            {ccRecipients && (
              <div className="text-sm text-gray-500 mt-0.5 break-words">
                Cc: {ccRecipients}
              </div>
            )}
            {canShowBcc && bccRecipients && (
              <div className="text-sm text-gray-500 mt-0.5 break-words">
                Bcc: {bccRecipients}
              </div>
            )}
            {email.emailLabels?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {email.emailLabels.map((el: any) => (
                  <LabelBadge key={el.label.id} label={el.label} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {getFormattedDate(displayTimestamp)}
        </div>
      </div>
      {/* Attachments Section — pinned under the addresses, above the body */}
      {regularAttachments.length > 0 ? (
        <div className="px-6 py-4 border-b border-gray-100 max-h-56 overflow-y-auto flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-900 flex items-center mb-4">
            <Paperclip className="w-4 h-4 mr-2 text-gray-500" />
            Attachments ({regularAttachments.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {regularAttachments.map((att: any) => {
              const downloadUrl = `/api/accounts/${selectedAccountId}/emails/${emailId}/attachments/${att.id}`;
              const isSpam = email.folder === 'SPAM' || email.folder === 'JUNK';

              return (
                <div key={att.id} className="flex items-center p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-gray-900 truncate" title={att.filename}>
                      {att.filename || 'Unnamed attachment'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatSize(att.sizeBytes)}
                    </p>
                  </div>
                  <a
                    href={downloadUrl}
                    download
                    onClick={(e) => {
                      if (isSpam) {
                        e.preventDefault();
                        setPendingDownloadUrl(downloadUrl);
                        setDownloadConfirmStep(1);
                      }
                    }}
                    className="p-2 text-gray-500 hover:text-accent-600 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      ) : email.hasAttachments && calendarAttachments.length === 0 ? (
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-900 flex items-center mb-2">
            <Paperclip className="w-4 h-4 mr-2 text-gray-500" />
            Attachments
          </h3>
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            This email has attachments, but they were not saved to the server during the initial sync.
            Only newly synced emails will have their attachments available for download.
          </div>
        </div>
      ) : null}

      {/* Calendar Event Timetable View for Calendar Attachments, Inline Invites or Teams Meetings */}
      {hasMeetingInEmail && (
        <CalendarEventSection
          attachments={calendarAttachments}
          inlineIcsContent={inlineIcsContent}
          defaultSubject={email.subject}
          selectedAccountId={email.accountId || selectedAccountId}
          emailId={emailId}
          email={email}
        />
      )}

      {/* Security Warning Banner if High Risk */}
      {email.isHighRisk && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start justify-between gap-4 text-amber-900 shadow-sm">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold">Security Warning:</span> This message was flagged as high risk by automated spam check.
              {email.riskReason && (
                <p className="mt-1 text-xs text-amber-800 bg-amber-100/60 p-2 rounded border border-amber-200 font-mono">
                  <span className="font-semibold font-sans">Reason:</span> {email.riskReason}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => labelSpamMutation.mutate('spam')}
              disabled={labelSpamMutation.isPending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
              title="Confirm this is definite spam and train detection model"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Definite Spam</span>
            </button>
            <button
              onClick={() => labelSpamMutation.mutate('ham')}
              disabled={labelSpamMutation.isPending}
              className="px-3 py-1.5 bg-white border border-green-600 text-green-700 hover:bg-green-50 rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
              title="Mark as safe (false positive) and train model"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>It&apos;s Safe</span>
            </button>
          </div>
        </div>
      )}

      {/* Body Content & Side Explanation Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {email.body?.bodyHtml ? (
            <iframe
              title="Email Content"
              className="w-full h-full min-h-[400px] border-none"
              srcDoc={
                email.body.bodyHtml.includes('<head>')
                  ? email.body.bodyHtml.replace(
                      '<head>',
                      `<head><style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 12px; line-height: 1.5; font-size: 14px; }
                        h1 { font-size: 1.5rem !important; font-weight: 700 !important; margin: 1rem 0 0.5rem 0 !important; }
                        h2 { font-size: 1.25rem !important; font-weight: 600 !important; margin: 0.875rem 0 0.5rem 0 !important; }
                        h3 { font-size: 1.125rem !important; font-weight: 600 !important; margin: 0.75rem 0 0.375rem 0 !important; }
                        ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin: 0.5rem 0 !important; }
                        ol { list-style-type: decimal !important; padding-left: 1.5rem !important; margin: 0.5rem 0 !important; }
                        li { margin: 0.25rem 0 !important; display: list-item !important; }
                        blockquote { border-left: 3px solid #cbd5e1 !important; padding-left: 1rem !important; margin: 0.75rem 0 !important; color: #4b5563 !important; font-style: italic !important; }
                        code { background: #f3f4f6 !important; color: #111827 !important; padding: 2px 5px !important; border-radius: 4px !important; font-family: monospace !important; }
                        pre { background: #1f2937 !important; color: #f9fafb !important; padding: 10px 14px !important; border-radius: 6px !important; overflow-x: auto !important; }
                        a { color: #2563eb !important; text-decoration: underline !important; }
                        s, del, strike { text-decoration: line-through !important; color: #6b7280 !important; }
                        strong, b { font-weight: 700 !important; }
                        em, i { font-style: italic !important; }
                        img { max-width: 100% !important; height: auto !important; display: inline-block !important; }
                        hr { border: 0 !important; border-top: 1px solid #e5e7eb !important; margin: 1rem 0 !important; }
                      </style>`
                    )
                  : `<!DOCTYPE html><html><head><style>
                      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 12px; line-height: 1.5; font-size: 14px; }
                      h1 { font-size: 1.5rem !important; font-weight: 700 !important; margin: 1rem 0 0.5rem 0 !important; }
                      h2 { font-size: 1.25rem !important; font-weight: 600 !important; margin: 0.875rem 0 0.5rem 0 !important; }
                      h3 { font-size: 1.125rem !important; font-weight: 600 !important; margin: 0.75rem 0 0.375rem 0 !important; }
                      ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin: 0.5rem 0 !important; }
                      ol { list-style-type: decimal !important; padding-left: 1.5rem !important; margin: 0.5rem 0 !important; }
                      li { margin: 0.25rem 0 !important; display: list-item !important; }
                      blockquote { border-left: 3px solid #cbd5e1 !important; padding-left: 1rem !important; margin: 0.75rem 0 !important; color: #4b5563 !important; font-style: italic !important; }
                      code { background: #f3f4f6 !important; color: #111827 !important; padding: 2px 5px !important; border-radius: 4px !important; font-family: monospace !important; }
                      pre { background: #1f2937 !important; color: #f9fafb !important; padding: 10px 14px !important; border-radius: 6px !important; overflow-x: auto !important; }
                      a { color: #2563eb !important; text-decoration: underline !important; }
                      s, del, strike { text-decoration: line-through !important; color: #6b7280 !important; }
                      strong, b { font-weight: 700 !important; }
                      em, i { font-style: italic !important; }
                      img { max-width: 100% !important; height: auto !important; display: inline-block !important; }
                      hr { border: 0 !important; border-top: 1px solid #e5e7eb !important; margin: 1rem 0 !important; }
                    </style></head><body>${email.body.bodyHtml}</body></html>`
              }
              sandbox="allow-popups allow-same-origin"
              translate="yes"
            />
          ) : (
            <div className="whitespace-pre-wrap font-sans text-gray-800">
              {email.body?.bodyText || 'Empty message.'}
            </div>
          )}
        </div>

        <EmailExplainPanel
          emailId={email.id}
          subject={email.subject}
          bodyText={email.body?.bodyText || email.snippet}
          isOpen={isExplainOpen}
          onClose={() => setIsExplainOpen(false)}
        />
      </div>

      {/* Playful Spam Warning Modal */}
      {downloadConfirmStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full text-center">
            <div className="mb-6">
              {downloadConfirmStep === 1 && (
                <>
                  <h3 className="text-xl font-bold text-red-600 mb-2">Hold your horses! 🐎</h3>
                  <p className="text-gray-600">
                    This email is in the SPAM folder. Are you sure you want to download this file? It could be from a Nigerian Prince!
                  </p>
                </>
              )}
              {downloadConfirmStep === 2 && (
                <>
                  <h3 className="text-xl font-bold text-orange-600 mb-2">Really sure? 🤔</h3>
                  <p className="text-gray-600">
                    Like, 100% sure? We take zero responsibility if your computer starts mining crypto for hackers.
                  </p>
                </>
              )}
              {downloadConfirmStep === 3 && (
                <>
                  <h3 className="text-xl font-bold text-yellow-600 mb-2">Last Chance! 🛑</h3>
                  <p className="text-gray-600">
                    Okay, brave soul. Proceed at your own peril!
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-center space-x-3">
              <button
                onClick={() => {
                  setDownloadConfirmStep(0);
                  setPendingDownloadUrl(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Nevermind, I'm scared 🏃‍♂️
              </button>
              <button
                onClick={() => {
                  if (downloadConfirmStep < 3) {
                    setDownloadConfirmStep(step => step + 1);
                  } else {
                    // Proceed with download
                    if (pendingDownloadUrl) {
                      const a = document.createElement('a');
                      a.href = pendingDownloadUrl;
                      a.download = '';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }
                    setDownloadConfirmStep(0);
                    setPendingDownloadUrl(null);
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                {downloadConfirmStep === 1 ? "I know what I'm doing 😎" :
                  downloadConfirmStep === 2 ? "Yes, I like living dangerously 🎲" :
                    "GIVE ME THE FILE! 📥"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Email Rule Modal */}
      <RuleModal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['rules'] });
          queryClient.invalidateQueries({ queryKey: ['email', emailId] });
          queryClient.invalidateQueries({ queryKey: ['emails'] });
        }}
        initialRule={initialRuleData}
        accounts={accounts}
        labels={labels}
      />
    </div>
  );
}
