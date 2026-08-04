'use client';

import { format, isToday } from 'date-fns';
import clsx from 'clsx';
import { Paperclip, User, Check, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useMemo } from 'react';
import { LabelBadge } from '@/components/labels/LabelBadge';
import { getEmailDisplayTimestamp } from '@/lib/email/timestamps';

interface EmailRowProps {
  email: any;
  onClick: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, email: any) => void;
  isSelected?: boolean;
  /** Render a multi-select checkbox zone at the left edge of the row. */
  selectable?: boolean;
  isChecked?: boolean;
  /** True when any email in the list is checked — keeps all checkboxes visible. */
  selectionActive?: boolean;
  onToggleSelect?: (id: string) => void;
  showAccountBadge?: boolean;
}

export function EmailRow({
  email,
  onClick,
  onContextMenu,
  isSelected,
  selectable,
  isChecked,
  selectionActive,
  onToggleSelect,
  showAccountBadge = true,
}: EmailRowProps) {
  const isUnread = email.folder === 'INBOX' && !email.isRead;
  const { showAvatars, timeFormat } = useUIStore();
  const snippet = typeof email.snippet === 'string' ? email.snippet.trim() : '';

  const accountInfo = email.account;
  const accountLabel = accountInfo?.label || accountInfo?.emailAddress;
  const accountColor = accountInfo?.color || '#3B82F6';

  const formattedTime = useMemo(() => {
    const date = getEmailDisplayTimestamp(email);
    if (!date) return '';
    if (isToday(date)) {
      return format(date, timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
    }
    return format(date, timeFormat === '24h' ? 'MMM d, HH:mm' : 'MMM d, h:mm a');
  }, [email.folder, email.sentAt, email.receivedAt, email.createdAt, timeFormat]);

  return (
    <div
      onClick={() => onClick(email.id)}
      onContextMenu={(e) => onContextMenu?.(e, email)}
      className={clsx(
        'group cursor-pointer border-b flex items-center px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] transition-colors duration-150',
        isSelected 
          ? 'envelope-active bg-accent-50 border-b-accent-100 relative' 
          : isUnread 
            ? 'bg-white hover:bg-gray-50 border-b-gray-100' 
            : 'bg-gray-50/40 hover:bg-gray-100/50 border-b-gray-100',
        isUnread ? 'font-semibold' : 'text-gray-600'
      )}
    >
      {selectable && (
        <label
          onClick={(e) => e.stopPropagation()}
          className={clsx(
            'relative w-8 self-stretch flex-shrink-0 flex items-center justify-center cursor-pointer transition-opacity',
            isChecked || selectionActive
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          )}
        >
          <span
            className={clsx(
              'w-5 h-5 rounded border flex items-center justify-center transition-colors',
              isChecked
                ? 'bg-accent-600 border-accent-600 text-white'
                : 'border-gray-300 bg-white hover:border-accent-400'
            )}
          >
            {isChecked && <Check className="w-3.5 h-3.5" />}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={!!isChecked}
            onChange={() => onToggleSelect?.(email.id)}
            aria-label={`Select email: ${email.subject || '(No Subject)'}`}
          />
        </label>
      )}

      {showAvatars && (
        <div className="w-12 h-8 flex-shrink-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center text-accent-700">
            <User className="w-4 h-4" />
          </div>
        </div>
      )}

      <div className={clsx("flex-1 min-w-0 pr-4", !showAvatars && "pl-[var(--spacing-density-col)]")}>
        <div className="flex items-center justify-between mb-0.5">
          <span className={clsx("truncate text-sm flex items-center gap-1.5 min-w-0", isUnread ? "text-gray-900 font-bold" : "text-gray-900 font-medium")}>
            <span className="truncate">{email.fromName || email.fromAddress}</span>
            {showAccountBadge && accountLabel && (
              <span
                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-800 max-w-[220px] truncate flex-shrink-0 border border-gray-300 shadow-2xs"
                title={accountInfo?.emailAddress || accountLabel}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accountColor }}
                />
                <span className="truncate">{accountLabel}</span>
              </span>
            )}
            {email.isHighRisk && (
              <span
                title={email.riskReason || 'Flagged as high risk'}
                className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold flex-shrink-0"
              >
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span>High Risk</span>
              </span>
            )}
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
            {snippet && (
              <span className="text-gray-500 font-normal truncate hidden sm:inline">
                — {snippet}
              </span>
            )}
          </span>
          {email.emailLabels?.length > 0 && (
            <span className="hidden sm:flex items-center gap-1 ml-2 flex-shrink-0">
              {email.emailLabels.slice(0, 2).map((el: any) => (
                <LabelBadge key={el.label.id} label={el.label} />
              ))}
              {email.emailLabels.length > 2 && (
                <span className="text-[11px] text-gray-400">
                  +{email.emailLabels.length - 2}
                </span>
              )}
            </span>
          )}
          {email.hasAttachments && (
            <Paperclip className="w-3.5 h-3.5 text-gray-400 ml-2 flex-shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
