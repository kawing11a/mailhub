'use client';

import { useAccountStore } from '@/stores/accountStore';
import { X, Send, Paperclip, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { FromAddressSelect } from './FromAddressSelect';
import { parseAddresses, isValidEmail } from '@/lib/email/addresses';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';

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
    ],
    content: '',
    immediatelyRender: false,
    onUpdate: () => setBodyVersion((v) => v + 1),
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose max-w-none focus:outline-none min-h-[200px] h-full px-4 py-3',
      },
    },
  });

  // Shared accounts query (typed, with favourites metadata) for the From picker.
  const { data: accounts = [] } = useAccounts();

  const activeAccount = accounts.find((a) => a.id === selectedAccountId)
    ?? accounts[0];

  // The account we actually send/save from: the user's pick, else the active one.
  const fromAccount = accounts.find((a) => a.id === fromId) ?? activeAccount;

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

      const initialAccountId = composeDraft?.accountId || fromAccount?.id;
      initializeAutosave(
        composeDraft?.id && initialAccountId
          ? { draftId: composeDraft.id, accountId: initialAccountId }
          : null
      );
    } else {
      hasHydratedRef.current = false;
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

  const resetComposer = () => {
    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setShowBcc(false);
    setSubject('');
    setFromId(null);
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
      className={clsx(
        "fixed bg-white shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden transition-all duration-200",
        isFullScreen
          ? "inset-4 sm:inset-8 md:inset-12 rounded-xl"
          : "bottom-0 right-4 sm:right-12 md:right-24 w-[500px] max-w-[calc(100vw-32px)] rounded-t-xl max-h-[80vh] h-[550px]"
      )}
    >
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
            type="email"
          <span className="text-gray-500 w-16">To:</span>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 focus:outline-none"
            placeholder="recipient@example.com"
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
            className="flex-1 focus:outline-none font-medium"
            placeholder="Subject"
          />
        </div>

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
          <button className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
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
    </div>
  );
}
