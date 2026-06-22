'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { Loader2, Reply, Forward, Trash2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { LabelPicker } from '@/components/labels/LabelPicker';

interface EmailViewerProps {
  emailId: string;
  onBack?: () => void;
}

export function EmailViewer({ emailId, onBack }: EmailViewerProps) {
  const { selectedAccountId } = useAccountStore();

  const { data: email, isLoading } = useQuery({
    queryKey: ['email', emailId],
    queryFn: async () => {
      // In unified inbox, we need the account ID of the specific email
      // But for simplicity in Phase 3, we assume we can fetch it via its specific account or a global /api/emails/:id if implemented
      const accountPath = selectedAccountId === 'all' ? 'all' : selectedAccountId;
      const res = await fetch(`/api/accounts/${accountPath}/emails/${emailId}`);
      if (!res.ok) throw new Error('Failed to fetch email');
      return res.json();
    },
    enabled: !!emailId,
  });

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
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" title="Reply">
            <Reply className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors" title="Forward">
            <Forward className="w-5 h-5" />
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
          <div className="w-10 h-10 rounded-full bg-blue-100 flex flex-shrink-0 items-center justify-center text-blue-700 font-medium">
            {email.fromName ? email.fromName.charAt(0).toUpperCase() : '?'}
          </div>
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
          {email.receivedAt ? format(new Date(email.receivedAt), 'MMM d, yyyy, h:mm a') : ''}
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {email.body?.bodyHtml ? (
          <iframe
            title="Email Content"
            className="w-full h-full border-none"
            srcDoc={email.body.bodyHtml}
            sandbox="allow-popups allow-same-origin"
          />
        ) : (
          <div className="whitespace-pre-wrap font-sans text-gray-800">
            {email.body?.bodyText || 'Empty message.'}
          </div>
        )}
      </div>
    </div>
  );
}
