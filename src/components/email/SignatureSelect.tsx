'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ChevronDown, Check, Settings, Plus } from 'lucide-react';
import clsx from 'clsx';
import { Signature } from '@/hooks/useSignatures';

interface SignatureSelectProps {
  signatures: Signature[];
  activeSignatureId: string | null;
  onSelectSignature: (sig: Signature | null) => void;
  onOpenManageModal: () => void;
}

export function SignatureSelect({
  signatures,
  activeSignatureId,
  onSelectSignature,
  onOpenManageModal,
}: SignatureSelectProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const positionMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      position: 'fixed',
      bottom: window.innerHeight - rect.top + 4,
      left: Math.min(rect.left, window.innerWidth - 260),
    });
  };

  const toggleMenu = () => {
    if (!open) positionMenu();
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    const onReflow = () => positionMenu();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  const activeSig = signatures.find((s) => s.id === activeSignatureId);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="flex items-center gap-1.5 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
        title="Signature options"
      >
        <FileText className="h-3.5 w-3.5 text-gray-500" />
        <span className="truncate">Signatures</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={menuStyle}
              className="z-[70] w-64 overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-lg text-xs"
            >
              <div className="px-3 py-1.5 font-semibold text-gray-400 uppercase tracking-wider text-[10px]">
                Signatures
              </div>

              <div className="max-h-56 overflow-y-auto py-1">
                {signatures.length === 0 ? (
                  <div className="px-3 py-2 text-gray-400 italic">No signatures created</div>
                ) : (
                  signatures.map((sig) => {
                    const isSelected = sig.id === activeSignatureId;
                    return (
                      <button
                        key={sig.id}
                        type="button"
                        onClick={() => {
                          onSelectSignature(sig);
                          setOpen(false);
                        }}
                        className={clsx(
                          'flex w-full items-center justify-between px-3 py-2 rounded-md text-left transition-colors',
                          isSelected ? 'bg-accent-50 text-accent-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                        )}
                      >
                        <span className="truncate">{sig.name}</span>
                        <div className="flex items-center gap-1.5">
                          {sig.isDefault && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                              Default
                            </span>
                          )}
                          {isSelected && <Check className="h-3.5 w-3.5 text-accent-600" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  onSelectSignature(null);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 rounded-md text-left text-gray-500 hover:bg-gray-50 border-t border-gray-100 mt-1"
              >
                <span>None (No signature)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenManageModal();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-left font-medium text-accent-600 hover:bg-accent-50 transition-colors border-t border-gray-100 mt-1"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Manage / Create Signatures...</span>
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
