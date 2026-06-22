'use client';

import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Paperclip, User } from 'lucide-react';

interface EmailRowProps {
  email: any;
  onClick: (id: string) => void;
  isSelected?: boolean;
}

export function EmailRow({ email, onClick, isSelected }: EmailRowProps) {
  const isUnread = !email.isRead;

  return (
    <div
      onClick={() => onClick(email.id)}
      className={clsx(
        'group cursor-pointer border-b border-gray-100 flex items-center px-4 py-3 transition-colors duration-150',
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50',
        isUnread ? 'bg-white font-semibold' : 'bg-gray-50/50 text-gray-600'
      )}
    >
      <div className="w-12 h-8 flex-shrink-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
          <User className="w-4 h-4" />
        </div>
      </div>

      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center justify-between mb-0.5">
          <span className="truncate text-sm">
            {email.fromName || email.fromAddress}
          </span>
          <span className="text-xs whitespace-nowrap text-gray-500 ml-2">
            {email.receivedAt ? formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true }) : ''}
          </span>
        </div>
        
        <div className="flex items-center text-sm">
          <span className="truncate flex-1">
            <span className={clsx('mr-2', isUnread ? 'text-gray-900' : 'text-gray-700')}>
              {email.subject || '(No Subject)'}
            </span>
            <span className="text-gray-500 font-normal truncate hidden sm:inline">
              — {email.snippet || ''}
            </span>
          </span>
          {email.hasAttachments && (
            <Paperclip className="w-3.5 h-3.5 text-gray-400 ml-2 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
