'use client';

import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { X, Bold, Italic, Strikethrough, List, ListOrdered, Undo, Redo, Check } from 'lucide-react';
import clsx from 'clsx';
import { useSignatures, Signature } from '@/hooks/useSignatures';

interface AccountOption {
  id: string;
  label?: string | null;
  emailAddress: string;
}

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  accounts?: AccountOption[];
  signature?: Signature | null;
  onSaved?: (savedSignature: Signature) => void;
}

export function SignatureModal({
  isOpen,
  onClose,
  accountId: initialAccountId,
  accounts = [],
  signature = null,
  onSaved,
}: SignatureModalProps) {
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const { createSignature, updateSignature, isCreating, isUpdating } = useSignatures(selectedAccountId);

  useEffect(() => {
    setSelectedAccountId(initialAccountId);
  }, [initialAccountId]);

  useEffect(() => {
    if (signature) {
      setName(signature.name);
      setIsDefault(signature.isDefault);
    } else {
      setName('');
      setIsDefault(false);
    }
  }, [signature, isOpen]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Design your rich-text signature...' }),
    ],
    content: signature ? signature.contentHtml : '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none p-3 min-h-[140px] focus:outline-none text-slate-800 dark:text-slate-100',
      },
    },
  });

  useEffect(() => {
    if (editor && isOpen) {
      editor.commands.setContent(signature ? signature.contentHtml : '');
    }
  }, [isOpen, signature, editor]);

  if (!isOpen) return null;

  const isSaving = isCreating || isUpdating;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const contentHtml = editor?.getHTML() || '';

    try {
      if (signature) {
        const res = await updateSignature({
          id: signature.id,
          name: name.trim(),
          contentHtml,
          isDefault,
        });
        if (res.signature && onSaved) onSaved(res.signature);
      } else {
        const res = await createSignature({
          name: name.trim(),
          contentHtml,
          isDefault,
        });
        if (res.signature && onSaved) onSaved(res.signature);
      }
      onClose();
    } catch (err) {
      // toast error handled by hook
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {signature ? 'Edit Signature' : 'Create New Signature'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {/* Account Selector (if multiple accounts available) */}
          {accounts.length > 1 && !signature && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Email Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label ? `${acc.label} (${acc.emailAddress})` : acc.emailAddress}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Signature Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Signature Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Work Signature, Short Mobile, Sales"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Rich Text Editor */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Signature Content
            </label>
            <div className="rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
              {/* TipTap Toolbar */}
              {editor && (
                <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/50">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={clsx(
                      'rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700',
                      editor.isActive('bold') && 'bg-slate-200 dark:bg-slate-700 text-blue-600 font-bold'
                    )}
                    title="Bold"
                  >
                    <Bold className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={clsx(
                      'rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700',
                      editor.isActive('italic') && 'bg-slate-200 dark:bg-slate-700 text-blue-600'
                    )}
                    title="Italic"
                  >
                    <Italic className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={clsx(
                      'rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700',
                      editor.isActive('strike') && 'bg-slate-200 dark:bg-slate-700 text-blue-600'
                    )}
                    title="Strikethrough"
                  >
                    <Strikethrough className="h-4 w-4" />
                  </button>
                  <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={clsx(
                      'rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700',
                      editor.isActive('bulletList') && 'bg-slate-200 dark:bg-slate-700 text-blue-600'
                    )}
                    title="Bullet List"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={clsx(
                      'rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700',
                      editor.isActive('orderedList') && 'bg-slate-200 dark:bg-slate-700 text-blue-600'
                    )}
                    title="Numbered List"
                  >
                    <ListOrdered className="h-4 w-4" />
                  </button>
                  <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().undo().run()}
                    className="rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Undo"
                  >
                    <Undo className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().redo().run()}
                    className="rounded p-1 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="Redo"
                  >
                    <Redo className="h-4 w-4" />
                  </button>
                </div>
              )}
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Set as Default Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultSignature"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
            <label
              htmlFor="isDefaultSignature"
              className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Set as default signature for this account
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save Signature</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
