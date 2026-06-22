'use client';

import { useAccountStore } from '@/stores/accountStore';
import { X, Send, Paperclip, Trash2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export function ComposeModal() {
  const { isComposeModalOpen, setComposeModalOpen, selectedAccountId } = useAccountStore();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Fetch accounts to select the "From" address if unified inbox is selected
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      return res.json();
    },
  });

  const activeAccount = selectedAccountId !== 'all' 
    ? accounts?.find((a: any) => a.id === selectedAccountId)
    : accounts?.[0]; // Default to first account if 'all' is selected

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your message...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  });

  if (!isComposeModalOpen) return null;

  const handleSend = async () => {
    if (!activeAccount || !to) return;
    setIsSending(true);

    try {
      const res = await fetch(`/api/accounts/${activeAccount.id}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [{ address: to }],
          subject,
          bodyHtml: editor?.getHTML(),
          bodyText: editor?.getText(),
        }),
      });

      if (!res.ok) throw new Error('Failed to send email');
      
      setComposeModalOpen(false);
      setTo('');
      setSubject('');
      editor?.commands.clearContent();
    } catch (error) {
      console.error(error);
      alert('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-0 right-24 w-[500px] bg-white rounded-t-xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden max-h-[80vh]">
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between">
        <span className="font-medium text-sm">New Message</span>
        <button 
          onClick={() => setComposeModalOpen(false)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form Fields */}
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm">
          <span className="text-gray-500 w-12">From:</span>
          <span className="font-medium bg-gray-100 px-2 py-0.5 rounded text-gray-700">
            {activeAccount?.emailAddress || 'Loading...'}
          </span>
        </div>
        
        <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm">
          <span className="text-gray-500 w-12">To:</span>
          <input 
            type="email" 
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 focus:outline-none" 
            placeholder="recipient@example.com"
          />
        </div>

        <div className="border-b border-gray-100 px-4 py-2 flex items-center text-sm">
          <span className="text-gray-500 w-12">Subject:</span>
          <input 
            type="text" 
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 focus:outline-none font-medium" 
            placeholder="Subject"
          />
        </div>

        {/* TipTap Editor */}
        <div className="flex-1 text-sm bg-white cursor-text">
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Footer Toolbar */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSend}
            disabled={isSending || !to || !activeAccount}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-md font-medium text-sm flex items-center space-x-2 transition-colors shadow-sm"
          >
            <span>{isSending ? 'Sending...' : 'Send'}</span>
            {!isSending && <Send className="w-3.5 h-3.5" />}
          </button>
          <button className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
        </div>
        <button 
          onClick={() => {
            setTo('');
            setSubject('');
            editor?.commands.clearContent();
            setComposeModalOpen(false);
          }}
          className="p-2 hover:bg-gray-200 rounded text-gray-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
