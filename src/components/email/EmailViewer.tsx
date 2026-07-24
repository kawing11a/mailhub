'use client';

import { LabelBadge } from '@/components/labels/LabelBadge';
import { buildReplyAllRecipients } from '@/lib/email/addresses';
import { formatStoredAddresses } from '@/lib/email/display-addresses';
import { getEmailDisplayTimestamp } from '@/lib/email/timestamps';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, AlertTriangle, Download, Forward, Loader2, Mail, Paperclip, Reply, ReplyAll, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

interface EmailViewerProps {
  emailId: string;
  onBack?: () => void;
}

export function EmailViewer({ emailId, onBack }: EmailViewerProps) {
  const { selectedAccountId, setComposeModalOpen, setComposeDraft } = useAccountStore();
  const { showAvatars, timeFormat } = useUIStore();

  const [downloadConfirmStep, setDownloadConfirmStep] = useState(0);
  const [pendingDownloadUrl, setPendingDownloadUrl] = useState<string | null>(null);

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

  const labelCounts = useMemo(
    () =>
      new Map<string, number>(
        (email?.emailLabels || []).map((el: any) => [el.label.id, 1] as [string, number])
      ),
    [email?.emailLabels]
  );

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
    setComposeDraft({
      accountId: email.accountId,
      to: email.fromAddress,
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      bodyHtml: quoteHtml
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

    setComposeDraft({
      accountId: email.accountId,
      to: recipients.to.join(', '),
      cc: recipients.cc.join(', '),
      subject: email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject || ''}`,
      bodyHtml: quoteHtml
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
    setComposeDraft({
      accountId: email.accountId,
      to: '',
      subject: email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || ''}`,
      bodyHtml: quoteHtml
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
            onClick={handleMarkUnread}
            disabled={updateEmailMutation.isPending}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
            title="Mark as unread"
          >
            {updateEmailMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete">
            <Trash2 className="w-5 h-5" />
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
            <div className="font-medium text-gray-900">
              {email.fromName} <span className="text-gray-500 text-sm font-normal">&lt;{email.fromAddress}&gt;</span>
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
      {email.attachments && email.attachments.length > 0 ? (
        <div className="px-6 py-4 border-b border-gray-100 max-h-56 overflow-y-auto flex-shrink-0">
          <h3 className="text-sm font-medium text-gray-900 flex items-center mb-4">
            <Paperclip className="w-4 h-4 mr-2 text-gray-500" />
            Attachments ({email.attachments.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {email.attachments.map((att: any) => {
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
      ) : email.hasAttachments ? (
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

      {/* Security Warning Banner if High Risk */}
      {email.isHighRisk && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start space-x-3 text-amber-900 shadow-sm">
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
      )}

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {email.body?.bodyHtml ? (
          <iframe
            title="Email Content"
            className="w-full h-full min-h-[400px] border-none"
            srcDoc={email.body.bodyHtml}
            sandbox="allow-popups allow-same-origin"
            translate="yes"
          />
        ) : (
          <div className="whitespace-pre-wrap font-sans text-gray-800">
            {email.body?.bodyText || 'Empty message.'}
          </div>
        )}
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
    </div>
  );
}
