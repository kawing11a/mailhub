'use client';

import { format, isToday } from 'date-fns';
import clsx from 'clsx';
import { Paperclip, User } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useMemo } from 'react';

interface EmailRowProps {
  email: any;
  onClick: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, email: any) => void;
  isSelected?: boolean;
}

export function EmailRow({ email, onClick, onContextMenu, isSelected }: EmailRowProps) {
  const isUnread = !email.isRead;
  const { showAvatars, timeFormat } = useUIStore();

  const formattedTime = useMemo(() => {
    if (!email.receivedAt) return '';
    const date = new Date(email.receivedAt);
    if (isToday(date)) {
      return format(date, timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
    }
    return format(date, timeFormat === '24h' ? 'MMM d, HH:mm' : 'MMM d, h:mm a');
  }, [email.receivedAt, timeFormat]);

  return (
    <div
      onClick={() => onClick(email.id)}
      onContextMenu={(e) => onContextMenu?.(e, email)}
      className={clsx(
        'group cursor-pointer border-b flex items-center px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] transition-colors duration-150',
        isSelected 
          ? 'bg-accent-50 border-b-accent-100 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-accent-500' 
          : isUnread 
            ? 'bg-white hover:bg-gray-50 border-b-gray-100' 
            : 'bg-gray-50/40 hover:bg-gray-100/50 border-b-gray-100',
        isUnread ? 'font-semibold' : 'text-gray-600'
      )}
    >
      {showAvatars && (
        <div className="w-12 h-8 flex-shrink-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center text-accent-700">
            <User className="w-4 h-4" />
          </div>
        </div>
      )}

      <div className={clsx("flex-1 min-w-0 pr-4", !showAvatars && "pl-[var(--spacing-density-col)]")}>
        <div className="flex items-center justify-between mb-0.5">
          <span className={clsx("truncate text-sm", isUnread ? "text-gray-900 font-bold" : "text-gray-900 font-medium")}>
            {email.fromName || email.fromAddress}
          </span>
          <span className="text-xs whitespace-nowrap text-gray-500 ml-2">
            {formattedTime}
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
