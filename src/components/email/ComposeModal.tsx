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

export function ComposeModal() {
  const { isComposeModalOpen, setComposeModalOpen, selectedAccountId, composeDraft, setComposeDraft } = useAccountStore();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Chosen "From" account for THIS message (null = fall back to the active account).
  const [fromId, setFromId] = useState<string | null>(null);

  // The id of the draft this compose is auto-saving to. Kept in a ref (not in the
  // store) so that receiving a fresh draftId from the server never re-renders or
  // re-hydrates the editor and wipes what the user is typing.
  const draftIdRef = useRef<string | null>(null);
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

  // Seed the header fields once when the modal opens, and reset the hydration
  // guard when it closes. Callers set composeDraft and open the modal together,
  // so composeDraft is already current on the render that flips isComposeModalOpen.
  useEffect(() => {
    if (isComposeModalOpen) {
      setTo(composeDraft?.to || '');
      setCc(composeDraft?.cc || '');
      setBcc(composeDraft?.bcc || '');
      // Reveal Cc/Bcc rows when the draft carries them.
      setShowCc(!!composeDraft?.cc);
      setShowBcc(!!composeDraft?.bcc);
      setSubject(composeDraft?.subject || '');
      draftIdRef.current = composeDraft?.id ?? null;
    } else {
      hasHydratedRef.current = false;
    }
    // Intentionally keyed on open/close only, reading composeDraft at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposeModalOpen]);

  // Hydrate the editor body exactly once per open (editor may be null on the
  // first render because of immediatelyRender: false). emitUpdate is disabled so
  // seeding the draft doesn't trip the auto-save.
  useEffect(() => {
    if (isComposeModalOpen && editor && !hasHydratedRef.current) {
      editor.commands.setContent(composeDraft?.bodyHtml || '', { emitUpdate: false });
      hasHydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposeModalOpen, editor]);

  // Shared accounts query (typed, with favourites metadata) for the From picker.
  const { data: accounts = [] } = useAccounts();

  const activeAccount = selectedAccountId !== 'all'
    ? accounts.find((a) => a.id === selectedAccountId)
    : accounts[0]; // Default to first account if 'all' is selected

  // The account we actually send/save from: the user's pick, else the active one.
  const fromAccount = accounts.find((a) => a.id === fromId) ?? activeAccount;

  // Debounced auto-save. Re-arms whenever a field or the body (bodyVersion)
  // changes. The body HTML is read at fire time, and the returned draftId is
  // stored in a ref — never pushed back into the store — so the editor is never
  // re-hydrated out from under the user.
  useEffect(() => {
    if (!isComposeModalOpen || !fromAccount) return;

    // Don't auto-save if completely empty to avoid spamming empty drafts
    if (!to && !cc && !bcc && !subject && (!editor || editor.isEmpty)) return;

    const timer = setTimeout(async () => {
      const bodyHtml = editor?.getHTML() || '';
      const bodyText = editor?.getText() || '';

      try {
        const res = await fetch(`/api/accounts/${fromAccount.id}/drafts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: draftIdRef.current ?? undefined,
            to,
            cc,
            bcc,
            subject,
            bodyHtml,
            bodyText,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // Keep saving to the same draft on subsequent auto-saves.
          if (data.draftId) draftIdRef.current = data.draftId;
        }
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, bodyVersion, isComposeModalOpen, fromAccount?.id]);

  if (!isComposeModalOpen) return null;

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

    try {
      const res = await fetch(`/api/accounts/${fromAccount.id}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: draftIdRef.current ?? undefined,
          to: toList,
          ...(ccList.length ? { cc: ccList } : {}),
          ...(bccList.length ? { bcc: bccList } : {}),
          subject,
          bodyHtml: editor?.getHTML(),
          bodyText: editor?.getText(),
        }),
      });

      if (!res.ok) throw new Error('Failed to send email');

      setComposeModalOpen(false);
      setComposeDraft(null);
      draftIdRef.current = null;
      hasHydratedRef.current = false;
      setTo('');
      setCc('');
      setBcc('');
      setShowCc(false);
      setShowBcc(false);
      setSubject('');
      setFromId(null);
      editor?.commands.clearContent();
    } catch (error) {
      console.error(error);
      alert('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (draftIdRef.current && fromAccount) {
      // Sync final draft to IMAP asynchronously when closing
      fetch(`/api/accounts/${fromAccount.id}/drafts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draftIdRef.current }),
      }).catch(console.error);
    }

    setTo('');
    setCc('');
    setBcc('');
    setShowCc(false);
    setShowBcc(false);
    setSubject('');
    setFromId(null);
    editor?.commands.clearContent();
    draftIdRef.current = null;
    hasHydratedRef.current = false;
    setComposeDraft(null);
    setComposeModalOpen(false);
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
            disabled={isSending || !to || !fromAccount}
            className="bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors shadow-sm"
          >
            <span>{isSending ? 'Sending...' : 'Send'}</span>
            {!isSending && <Send className="w-3.5 h-3.5" />}
          </button>
          <button className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
        <button 
          onClick={handleClose}
          className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
