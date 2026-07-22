'use client';

import { useAccountStore } from '@/stores/accountStore';
import { X, Send, Paperclip, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { FromAddressSelect } from './FromAddressSelect';

export function ComposeModal() {
  const { isComposeModalOpen, setComposeModalOpen, selectedAccountId, composeDraft, setComposeDraft } = useAccountStore();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // Chosen "From" account for THIS message (null = fall back to the active account).
  const [fromId, setFromId] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your message...' }),
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose max-w-none focus:outline-none min-h-[200px] h-full px-4 py-3',
      },
    },
  });

  useEffect(() => {
    if (isComposeModalOpen && composeDraft) {
      setTo(composeDraft.to || '');
      setSubject(composeDraft.subject || '');
      // We can't use editor inside this useEffect directly if editor is initialized after.
      // But editor is created with useEditor above, so it is available.
    }
  }, [isComposeModalOpen, composeDraft]);

  // Sync editor content separately since editor might be null initially
  useEffect(() => {
    if (isComposeModalOpen && composeDraft && editor) {
      editor.commands.setContent(composeDraft.bodyHtml || '');
    }
  }, [isComposeModalOpen, composeDraft, editor]);

  // Shared accounts query (typed, with favourites metadata) for the From picker.
  const { data: accounts = [] } = useAccounts();

  const activeAccount = selectedAccountId !== 'all'
    ? accounts.find((a) => a.id === selectedAccountId)
    : accounts[0]; // Default to first account if 'all' is selected

  // The account we actually send/save from: the user's pick, else the active one.
  const fromAccount = accounts.find((a) => a.id === fromId) ?? activeAccount;

  // Debounced auto-save
  useEffect(() => {
    if (!isComposeModalOpen || !fromAccount) return;

    // Don't auto-save if completely empty to avoid spamming empty drafts
    if (!to && !subject && (!editor || editor.isEmpty)) return;

    const bodyHtml = editor?.getHTML() || '';
    const bodyText = editor?.getText() || '';

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/accounts/${fromAccount.id}/drafts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: composeDraft?.id,
            to,
            subject,
            bodyHtml,
            bodyText,
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          // Update the draft id in the store if it's new, so we keep updating the same draft
          if (data.draftId && data.draftId !== composeDraft?.id) {
            setComposeDraft({ 
              id: data.draftId, 
              to, 
              subject, 
              bodyHtml 
            });
          }
        }
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [to, subject, editor?.getHTML(), isComposeModalOpen, fromAccount?.id]);

  if (!isComposeModalOpen) return null;

  const handleSend = async () => {
    if (!fromAccount || !to) return;
    setIsSending(true);

    try {
      const res = await fetch(`/api/accounts/${fromAccount.id}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: composeDraft?.id,
          to: [to],
          subject,
          bodyHtml: editor?.getHTML(),
          bodyText: editor?.getText(),
        }),
      });

      if (!res.ok) throw new Error('Failed to send email');

      setComposeModalOpen(false);
      setComposeDraft(null);
      setTo('');
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
    if (composeDraft?.id && fromAccount) {
      // Sync final draft to IMAP asynchronously when closing
      fetch(`/api/accounts/${fromAccount.id}/drafts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: composeDraft.id }),
      }).catch(console.error);
    }

    setTo('');
    setSubject('');
    setFromId(null);
    editor?.commands.clearContent();
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
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 focus:outline-none"
            placeholder="recipient@example.com"
          />
        </div>

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
