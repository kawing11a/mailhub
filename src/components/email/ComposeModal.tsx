'use client';

import { useAccountStore } from '@/stores/accountStore';
import { X, Send, Paperclip, Trash2, Maximize2, Minimize2, FileText, Settings } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ResizableImage, imageDropAndPasteProps } from '@/components/editor/ResizableImageExtension';
import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { FromAddressSelect } from './FromAddressSelect';
import { parseAddresses, isValidEmail } from '@/lib/email/addresses';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useSignatures, Signature } from '@/hooks/useSignatures';
import { SignatureModal } from '@/components/signatures/SignatureModal';
import { SignatureSelect } from './SignatureSelect';

interface ComposerAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  content: string; // base64
}

function formatSize(bytes?: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function ComposeModal() {
  const { isComposeModalOpen, setComposeModalOpen, selectedAccountId, composeDraft, setComposeDraft } = useAccountStore();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chosen "From" account for THIS message (null = fall back to the active account).
  const [fromId, setFromId] = useState<string | null>(null);

  // Guards the one-time editor hydration so it runs only when the modal opens,
  // never again while the user is typing.
  const hasHydratedRef = useRef(false);
  // Bumped on every editor change; used to (re)arm the debounced auto-save for
  // body-only edits without putting the live HTML in a dependency array.
  const [bodyVersion, setBodyVersion] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your message...' }),
      ResizableImage.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: () => setBodyVersion((v) => v + 1),
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose max-w-none focus:outline-none min-h-[200px] h-full px-4 py-3',
      },
      handleDrop: imageDropAndPasteProps.handleDrop,
      handlePaste: imageDropAndPasteProps.handlePaste,
    },
  });

  // Shared accounts query (typed, with favourites metadata) for the From picker.
  const { data: accounts = [] } = useAccounts();

  const activeAccount = accounts.find((a) => a.id === selectedAccountId)
    ?? accounts[0];

  // The account we actually send/save from: the user's pick, else the active one.
  const fromAccount = accounts.find((a) => a.id === fromId) ?? activeAccount;

  // Signatures for current fromAccount
  const { signatures, defaultSignature } = useSignatures(fromAccount?.id);
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [editingSignatureInModal, setEditingSignatureInModal] = useState<Signature | null>(null);

  const autoInsertedAccountIdRef = useRef<string | null>(null);

  // Swaps or removes the signature HTML block in TipTap editor cleanly
  const applySignature = (signatureHtml: string | null, sigId: string | null = null) => {
    if (!editor) return;
    const currentHtml = editor.getHTML();

    // Pattern matching previous signature delimiter
    const sigRegex = /(?:<p[^>]*class="sig-dash"[^>]*>[\s\S]*|<hr[^>]*class="sig-divider"[^>]*>[\s\S]*)/i;

    // Extract user's typed body text (everything before the signature block)
    const userBody = currentHtml.replace(sigRegex, '').trimEnd();

    let newHtml = userBody;
    if (signatureHtml && signatureHtml.trim() !== '') {
      const wrappedSig = `<p class="sig-dash"><br></p><p class="sig-dash">-- </p>${signatureHtml}`;
      newHtml = userBody ? `${userBody}${wrappedSig}` : wrappedSig;
      setActiveSignatureId(sigId);
    } else {
      setActiveSignatureId(null);
    }

    editor.commands.setContent(newHtml);
    setBodyVersion((v) => v + 1);
  };

  // Reset tracking when compose modal closes
  useEffect(() => {
    if (!isComposeModalOpen) {
      autoInsertedAccountIdRef.current = null;
    }
  }, [isComposeModalOpen]);

  // Handle auto-insertion on open and clean signature swap when From account changes
  useEffect(() => {
    if (!isComposeModalOpen || !editor || !hasHydratedRef.current) return;

    // Do not overwrite existing saved drafts that already have bodyHtml
    const isNewDraft = !composeDraft?.id && (!composeDraft?.bodyHtml || composeDraft.bodyHtml.trim() === '');

    if (isNewDraft && defaultSignature) {
      if (autoInsertedAccountIdRef.current !== (fromAccount?.id || null)) {
        applySignature(defaultSignature.contentHtml, defaultSignature.id);
        autoInsertedAccountIdRef.current = fromAccount?.id || null;
      }
    }
  }, [isComposeModalOpen, editor, defaultSignature, fromAccount?.id, composeDraft]);

  // Snapshot the live editor on every bodyVersion render. The autosave hook
  // debounces and serializes these snapshots without rehydrating TipTap.
  const draftSnapshot = fromAccount
    ? {
        accountId: fromAccount.id,
        to,
        cc,
        bcc,
        subject,
        bodyHtml: editor?.getHTML() || '',
        bodyText: editor?.getText() || '',
        attachments,
      }
    : null;

  const {
    status: draftSaveStatus,
    initialize: initializeAutosave,
    flush: flushDraft,
    cancelScheduledSave,
  } = useDraftAutosave({
    enabled: isComposeModalOpen && !isSending && !isClosing,
    snapshot: draftSnapshot,
    changeVersion: bodyVersion,
  });

  useEffect(() => {
    if (isComposeModalOpen) {
      setTo(composeDraft?.to || '');
      setCc(composeDraft?.cc || '');
      setBcc(composeDraft?.bcc || '');
      setShowCc(!!composeDraft?.cc);
      setShowBcc(!!composeDraft?.bcc);
      setSubject(composeDraft?.subject || '');
      setFromId(composeDraft?.accountId ?? null);
      setAttachments(
        (composeDraft?.attachments || []).map((att) => ({
          id: att.id || crypto.randomUUID(),
          filename: att.filename,
          contentType: att.contentType,
          sizeBytes: att.sizeBytes || 0,
          content: att.content,
        }))
      );

      const initialAccountId = composeDraft?.accountId || fromAccount?.id;
      initializeAutosave(
        composeDraft?.id && initialAccountId
          ? { draftId: composeDraft.id, accountId: initialAccountId }
          : null
      );
    } else {
      hasHydratedRef.current = false;
      setIsDragging(false);
    }
    // Callers set composeDraft before opening; later saves must not rehydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposeModalOpen]);

  useEffect(() => {
    if (isComposeModalOpen && editor && !hasHydratedRef.current) {
      editor.commands.setContent(composeDraft?.bodyHtml || '', { emitUpdate: false });
      hasHydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposeModalOpen, editor]);

  if (!isComposeModalOpen) return null;

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newAttachments: ComposerAttachment[] = [];
    for (const file of fileArray) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      newAttachments.push({
        id: crypto.randomUUID(),
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        content: base64,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setBodyVersion((v) => v + 1);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
    setBodyVersion((v) => v + 1);
  };

  const resetComposer = () => {
    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setShowBcc(false);
    setSubject('');
    setFromId(null);
    setAttachments([]);
    setIsDragging(false);
    editor?.commands.clearContent();
    initializeAutosave(null);
    hasHydratedRef.current = false;
    setComposeDraft(null);
    setComposeModalOpen(false);
  };

  const handleSend = async () => {
    if (!fromAccount || !to) return;

    const toList = parseAddresses(to);
    const ccList = parseAddresses(cc);
    const bccList = parseAddresses(bcc);

    if (toList.length === 0) return;
    const invalid = [...toList, ...ccList, ...bccList].find((a) => !isValidEmail(a));
    if (invalid) {
      alert(`Invalid email address: ${invalid}`);
      return;
    }

    setIsSending(true);
    cancelScheduledSave();

    try {
      const identity = await flushDraft();
      if (!identity || identity.accountId !== fromAccount.id) {
        throw new Error('Draft was not saved to the selected From account');
      }

      const res = await fetch(`/api/accounts/${fromAccount.id}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: identity.draftId,
          to: toList,
          ...(ccList.length ? { cc: ccList } : {}),
          ...(bccList.length ? { bcc: bccList } : {}),
          subject,
          bodyHtml: editor?.getHTML(),
          bodyText: editor?.getText(),
          attachments: attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            contentType: a.contentType,
            content: a.content,
            sizeBytes: a.sizeBytes,
          })),
        }),
      });

      if (!res.ok) throw new Error('Failed to send email');

      resetComposer();
    } catch (error) {
      console.error(error);
      alert('Failed to save or send email. Your message is still open.');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = async () => {
    if (isClosing || isSending) return;

    setIsClosing(true);
    cancelScheduledSave();

    try {
      const identity = await flushDraft();
      if (identity) {
        try {
          const syncRes = await fetch(`/api/accounts/${identity.accountId}/drafts/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftId: identity.draftId }),
          });
          if (!syncRes.ok) throw new Error('Provider draft sync failed');
          const syncResult = await syncRes.json();
          if (syncResult.warning) throw new Error(syncResult.warning);
        } catch (syncError) {
          console.error(syncError);
          alert('Draft saved locally, but it could not be synced to the email provider.');
        }
      }

      resetComposer();
    } catch (error) {
      console.error('Draft save failed while closing:', error);
      alert('Draft could not be saved. The message will remain open.');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={clsx(
        "fixed bg-white shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden transition-all duration-200",
        isFullScreen
          ? "inset-4 sm:inset-8 md:inset-12 rounded-xl"
          : "bottom-0 right-4 sm:right-8 lg:right-16 w-[580px] max-w-[calc(100vw-32px)] rounded-t-xl max-h-[85vh] h-[580px]"
      )}
    >
      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-accent-50/90 border-2 border-dashed border-accent-500 rounded-xl z-50 flex flex-col items-center justify-center pointer-events-none transition-all">
          <Paperclip className="w-10 h-10 text-accent-600 mb-2 animate-bounce" />
          <p className="text-sm font-semibold text-accent-800">Drop files here to attach</p>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        className="hidden"
      />

      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-medium text-sm">New Message</span>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={handleClose}
            disabled={isClosing || isSending}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm flex-shrink-0">
          <span className="text-gray-500 w-16">From:</span>
          <FromAddressSelect accounts={accounts} value={fromAccount} onChange={setFromId} />
        </div>

        <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm flex-shrink-0">
          <span className="text-gray-500 w-16">To:</span>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 focus:outline-none"
            placeholder="recipient@example.com, another@example.com"
          />
          <div className="flex flex-shrink-0 items-center gap-3 pl-2 text-xs text-gray-500">
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)} className="hover:text-gray-700">
                Cc
              </button>
            )}
            {!showBcc && (
              <button type="button" onClick={() => setShowBcc(true)} className="hover:text-gray-700">
                Bcc
              </button>
            )}
          </div>
        </div>

        {showCc && (
          <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm flex-shrink-0">
            <span className="text-gray-500 w-16">Cc:</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="flex-1 focus:outline-none"
              placeholder="cc@example.com, another@example.com"
            />
          </div>
        )}

        {showBcc && (
          <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm flex-shrink-0">
            <span className="text-gray-500 w-16">Bcc:</span>
            <input
              type="text"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className="flex-1 focus:outline-none"
              placeholder="bcc@example.com, another@example.com"
            />
          </div>
        )}

        <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm flex-shrink-0">
          <span className="text-gray-500 w-16">Subject:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 focus:outline-none font-medium"
            placeholder="Subject"
          />
        </div>

        {/* Attachments list */}
        {attachments.length > 0 && (
          <div className="border-b border-gray-100 px-4 py-2 flex flex-wrap gap-2 max-h-28 overflow-y-auto bg-gray-50 flex-shrink-0">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center space-x-2 bg-white border border-gray-200 rounded-md px-2.5 py-1 text-xs text-gray-700 shadow-sm"
              >
                <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="font-medium truncate max-w-[140px]" title={att.filename}>
                  {att.filename}
                </span>
                <span className="text-gray-400">({formatSize(att.sizeBytes)})</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
                  className="p-0.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TipTap Editor */}
        <div className="flex-1 text-sm bg-white cursor-text overflow-y-auto">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>

      {/* Footer Toolbar */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSend}
            disabled={isSending || isClosing || !to || !fromAccount}
            className="bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors shadow-sm"
          >
            <span>{isSending ? 'Sending...' : 'Send'}</span>
            {!isSending && <Send className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Signature Selector Dropdown */}
          <SignatureSelect
            signatures={signatures}
            activeSignatureId={activeSignatureId}
            onSelectSignature={(sig) => {
              if (sig) {
                applySignature(sig.contentHtml, sig.id);
              } else {
                applySignature(null);
              }
            }}
            onOpenManageModal={() => {
              setEditingSignatureInModal(null);
              setIsSignatureModalOpen(true);
            }}
          />

          <span
            className={clsx(
              'text-xs',
              draftSaveStatus === 'error' ? 'text-red-600' : 'text-gray-400'
            )}
          >
            {draftSaveStatus === 'saving' && 'Saving...'}
            {draftSaveStatus === 'saved' && 'Saved'}
            {draftSaveStatus === 'error' && 'Save failed'}
          </span>
        </div>
        <button
          onClick={handleClose}
          disabled={isClosing || isSending}
          className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Signature Editor Modal inline */}
      {fromAccount && (
        <SignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          accountId={fromAccount.id}
          accounts={accounts}
          signature={editingSignatureInModal}
          onSaved={(savedSig) => {
            applySignature(savedSig.contentHtml, savedSig.id);
          }}
        />
      )}
    </div>
  );
}
