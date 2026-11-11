'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface EmailActionMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

interface EmailActionMenuProps {
  label: string;
  title?: string;
  icon?: ReactNode;
  triggerClassName?: string;
  items: readonly EmailActionMenuItem[];
  heading?: string;
}

export function EmailActionMenu({
  label,
  title,
  icon = <MoreHorizontal className="h-5 w-5" />,
  triggerClassName = 'rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100',
  items,
  heading,
}: EmailActionMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const positionMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(256, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const estimatedHeight = Math.min(420, items.length * 40 + (heading ? 38 : 8));
    const top = rect.bottom + estimatedHeight <= window.innerHeight - 8
      ? rect.bottom + 4
      : Math.max(8, rect.top - estimatedHeight - 4);
    setMenuStyle({ position: 'fixed', top, left, width });
  }, [items.length, heading]);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onReflow = () => positionMenu();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, positionMenu]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-controls={menuId}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title || label}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {icon}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[60] cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            ref={menuRef}
            role="dialog"
            aria-label={label}
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof Node &&
                !event.currentTarget.contains(nextTarget) &&
                nextTarget !== triggerRef.current
              ) {
                setOpen(false);
              }
            }}
            style={menuStyle}
            className="z-[70] max-h-[min(26rem,calc(100vh-1rem))] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1.5 text-sm shadow-xl"
          >
            {heading && (
              <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {heading}
              </div>
            )}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  item.tone === 'danger'
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
