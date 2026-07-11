'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { Loader2, Reply, ReplyAll, Forward, Trash2, ArrowLeft, Mail, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { LabelPicker } from '@/components/labels/LabelPicker';
import { parseEmailToChat, extractTextFromHtml } from '@/lib/email/parser';

interface EmailViewerProps {
  emailId: string;
  onBack?: () => void;
}

export function EmailViewer({ emailId, onBack }: EmailViewerProps) {
  const { selectedAccountId, setComposeModalOpen, setComposeDraft } = useAccountStore();
  const { showAvatars, timeFormat, chatMode, setChatMode } = useUIStore();

  const queryClient = useQueryClient();
  const { data: email, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: async () => {
      const accountPath = selectedAccountId === 'all' ? 'all' : selectedAccountId;
      const res = await fetch(`/api/accounts/${accountPath}/emails/${emailId}`);
      if (!res.ok) throw new Error('Failed to fetch email');
      return res.json();
    },
    enabled: !!emailId,
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ isRead }: { isRead: boolean }) => {
      const accountPath = selectedAccountId === 'all' ? email.accountId : selectedAccountId;
      const res = await fetch(`/api/accounts/${accountPath}/emails/${emailId}`, {
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
      if (onBack) onBack();
    },
  });

  const handleMarkUnread = () => {
    updateEmailMutation.mutate({ isRead: false });
  };

  const getFormattedDate = (dateString?: string) => {
    if (!dateString) return '';
    return format(new Date(dateString), timeFormat === '24h' ? 'MMM d, yyyy, HH:mm' : 'MMM d, yyyy, h:mm a');
  };

  const handleReply = () => {
    if (!email) return;
    const fromStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    const dateStr = getFormattedDate(email.receivedAt);
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
      to: email.fromAddress,
      subject: email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || ''}`,
      bodyHtml: quoteHtml
    });
    setComposeModalOpen(true);
  };

  const handleReplyAll = () => {
    if (!email) return;
    const fromStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    const dateStr = getFormattedDate(email.receivedAt);
    const quoteHtml = `
      <br/><br/>
      <div class="gmail_quote" style="border-left: 1px solid #ccc; margin: 0 0 0 .8ex; padding-left: 1ex;">
        On ${dateStr}, ${fromStr} wrote:<br/>
        <blockquote class="gmail_quote" style="margin: 0 0 0 .8ex; border-left: 1px #ccc solid; padding-left: 1ex;">
          ${email.body?.bodyHtml || email.body?.bodyText || ''}
        </blockquote>
      </div>
    `;

    const replyTo = email.replyTo || email.fromAddress || '';
    const allTos = Array.isArray(email.toAddresses) ? email.toAddresses.map((a: any) => a.address) : [];
    const allCcs = Array.isArray(email.ccAddresses) ? email.ccAddresses.map((a: any) => a.address) : [];
    
    // Combine unique addresses for the 'to' field since ComposeModal only has a single 'to' input
    const uniqueToAddresses = Array.from(new Set([replyTo, ...allTos, ...allCcs])).filter(Boolean).join(', ');

    setComposeDraft({
      to: uniqueToAddresses,
      subject: email.subject?.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject || ''}`,
      bodyHtml: quoteHtml
    });
    setComposeModalOpen(true);
  };

  const handleForward = () => {
    if (!email) return;
    const fromStr = email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress;
    const dateStr = getFormattedDate(email.receivedAt);
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
          <LabelPicker emailId={emailId} />
          <button 
            onClick={() => setChatMode(!chatMode)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" 
            title={chatMode ? "Switch to Classic View" : "Switch to Chat View"}
          >
            {chatMode ? <Mail className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
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
              To: {email.toAddresses?.map((t: any) => t.address).join(', ')}
            </div>
          </div>
        </div>
        <div className="text-sm text-gray-500 whitespace-nowrap">
          {getFormattedDate(email.receivedAt)}
        </div>
      </div>

      {/* Body Content */}
      <div className={`flex-1 overflow-y-auto ${chatMode ? 'bg-gray-50 p-6' : 'p-6'}`}>
        {chatMode ? (
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-200 max-w-[85%]">
                <div className="text-xs text-gray-500 mb-1 font-medium">{email.fromName || email.fromAddress}</div>
                <div className="whitespace-pre-wrap break-words overflow-hidden font-sans text-gray-800 text-sm">
                  {parseEmailToChat(email.body?.bodyText || extractTextFromHtml(email.body?.bodyHtml || '') || '') || 'Empty message.'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          email.body?.bodyHtml ? (
            <iframe
              title="Email Content"
              className="w-full h-full border-none bg-white"
              srcDoc={email.body.bodyHtml}
              sandbox="allow-popups allow-same-origin"
            />
          ) : (
            <div className="whitespace-pre-wrap font-sans text-gray-800 bg-white">
              {email.body?.bodyText || 'Empty message.'}
            </div>
          )
        )}
      </div>
    </div>
  );
}
