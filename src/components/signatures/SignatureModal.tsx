'use client';

import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageExtension from '@tiptap/extension-image';
import {
  X,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Undo,
  Redo,
  Loader2,
  Image as ImageIcon,
  Link,
  Upload,
} from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      Placeholder.configure({ placeholder: 'Design your signature content...' }),
      ImageExtension.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto inline-block my-1 rounded-sm',
        },
      }),
    ],
    content: signature ? signature.contentHtml : '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[160px] p-3 text-gray-900',
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

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      editor.chain().focus().setImage({ src: dataUrl }).run();
    };
    reader.readAsDataURL(file);
    // Reset file input value
    e.target.value = '';
  };

  const handleAddImageUrl = () => {
    const url = window.prompt('Enter image URL (e.g. logo or photo link):');
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

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
      // Toast error handled by hook
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        <div className="relative w-full max-w-2xl transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h3 className="text-lg font-semibold leading-6 text-gray-900">
              {signature ? 'Edit Signature' : 'Create New Signature'}
            </h3>
            <button
              onClick={onClose}
              type="button"
              className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Hidden File Input for Image Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Form Content */}
          <form onSubmit={handleSave}>
            <div className="p-6 space-y-4">
              {/* Account Selector (if multiple accounts provided) */}
              {accounts.length > 1 && !signature && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 text-sm text-gray-900 bg-white"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Signature Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Work Signature, Mobile Brief"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500 text-sm text-gray-900"
                />
              </div>

              {/* Signature Content (TipTap Editor) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Signature Content
                </label>
                <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
                  {/* TipTap Toolbar */}
                  {editor && (
                    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 p-2">
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={clsx(
                          'p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors',
                          editor.isActive('bold') && 'bg-gray-200 text-accent-700 font-bold'
                        )}
                        title="Bold"
                      >
                        <Bold className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={clsx(
                          'p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors',
                          editor.isActive('italic') && 'bg-gray-200 text-accent-700'
                        )}
                        title="Italic"
                      >
                        <Italic className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        className={clsx(
                          'p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors',
                          editor.isActive('strike') && 'bg-gray-200 text-accent-700'
                        )}
                        title="Strikethrough"
                      >
                        <Strikethrough className="h-4 w-4" />
                      </button>
                      <div className="h-4 w-[1px] bg-gray-300 mx-1" />
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={clsx(
                          'p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors',
                          editor.isActive('bulletList') && 'bg-gray-200 text-accent-700'
                        )}
                        title="Bullet List"
                      >
                        <List className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={clsx(
                          'p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors',
                          editor.isActive('orderedList') && 'bg-gray-200 text-accent-700'
                        )}
                        title="Numbered List"
                      >
                        <ListOrdered className="h-4 w-4" />
                      </button>
                      <div className="h-4 w-[1px] bg-gray-300 mx-1" />
                      {/* Image Upload / URL Buttons */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors flex items-center space-x-1"
                        title="Upload Local Image"
                      >
                        <Upload className="h-4 w-4" />
                        <span className="text-xs font-medium hidden sm:inline">Upload Image</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddImageUrl}
                        className="p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors flex items-center space-x-1"
                        title="Insert Image URL"
                      >
                        <ImageIcon className="h-4 w-4" />
                        <span className="text-xs font-medium hidden sm:inline">Image URL</span>
                      </button>
                      <div className="h-4 w-[1px] bg-gray-300 mx-1" />
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().undo().run()}
                        className="p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors"
                        title="Undo"
                      >
                        <Undo className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().redo().run()}
                        className="p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors"
                        title="Redo"
                      >
                        <Redo className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <EditorContent editor={editor} />
                </div>
              </div>

              {/* Default Checkbox */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="isDefaultSignature"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-accent-600 focus:ring-accent-500"
                />
                <label
                  htmlFor="isDefaultSignature"
                  className="text-sm font-medium text-gray-700 cursor-pointer"
                >
                  Set as default signature for this account
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="px-4 py-2 bg-accent-600 text-white rounded-md text-sm font-medium hover:bg-accent-700 disabled:opacity-50 transition-colors shadow-sm inline-flex items-center space-x-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Signature</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
