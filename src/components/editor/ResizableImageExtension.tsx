import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import { useState, useRef, useCallback, useEffect } from 'react';
import clsx from 'clsx';

function ResizableImageComponent(props: NodeViewProps) {
  const { node, updateAttributes, selected } = props;
  const { src, alt, title, width } = node.attrs;
  const [isResizing, setIsResizing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentWidth = width || 'auto';

  const handleMouseDown = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = imageRef.current?.offsetWidth || 200;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      let newWidth = startWidth;
      if (corner.includes('right')) {
        newWidth = Math.max(50, startWidth + deltaX);
      } else {
        newWidth = Math.max(50, startWidth - deltaX);
      }
      updateAttributes({ width: `${Math.round(newWidth)}px` });
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    setIsResizing(true);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const setPresetWidth = (preset: string) => {
    updateAttributes({ width: preset });
  };

  return (
    <NodeViewWrapper className="inline-block relative max-w-full my-2 select-none group">
      <div
        className={clsx(
          'relative inline-block transition-all',
          (selected || isResizing) && 'ring-2 ring-accent-500 rounded-sm'
        )}
        style={{ width: currentWidth, maxWidth: '100%' }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt || ''}
          title={title || ''}
          className="block w-full h-auto rounded-sm object-contain"
          style={{ width: '100%', height: 'auto' }}
        />

        {/* Resize Handles (shown when image is selected or being resized) */}
        {(selected || isResizing) && (
          <>
            {/* Top Left */}
            <div
              onMouseDown={(e) => handleMouseDown(e, 'top-left')}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-accent-600 border-2 border-white rounded-full cursor-nwse-resize z-20 shadow-sm"
            />
            {/* Top Right */}
            <div
              onMouseDown={(e) => handleMouseDown(e, 'top-right')}
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-accent-600 border-2 border-white rounded-full cursor-nesw-resize z-20 shadow-sm"
            />
            {/* Bottom Left */}
            <div
              onMouseDown={(e) => handleMouseDown(e, 'bottom-left')}
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-accent-600 border-2 border-white rounded-full cursor-nesw-resize z-20 shadow-sm"
            />
            {/* Bottom Right */}
            <div
              onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-accent-600 border-2 border-white rounded-full cursor-nwse-resize z-20 shadow-sm"
            />
          </>
        )}

        {/* Quick Width Presets Bar (shown on hover or selected) */}
        {(selected || isResizing) && (
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center space-x-1 bg-gray-900 bg-opacity-90 text-white px-2 py-1 rounded-md text-[11px] font-medium shadow-md z-30 pointer-events-auto">
            <button
              type="button"
              onClick={() => setPresetWidth('25%')}
              className="hover:text-accent-300 px-1 rounded"
            >
              25%
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => setPresetWidth('50%')}
              className="hover:text-accent-300 px-1 rounded"
            >
              50%
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => setPresetWidth('75%')}
              className="hover:text-accent-300 px-1 rounded"
            >
              75%
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => setPresetWidth('100%')}
              className="hover:text-accent-300 px-1 rounded"
            >
              100%
            </button>
            <span>|</span>
            <button
              type="button"
              onClick={() => setPresetWidth('auto')}
              className="hover:text-accent-300 px-1 rounded"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 'auto',
        renderHTML: (attributes) => {
          if (!attributes.width || attributes.width === 'auto') {
            return { style: 'max-width: 100%; height: auto;' };
          }
          return {
            width: attributes.width,
            style: `width: ${attributes.width}; max-width: 100%; height: auto;`,
          };
        },
        parseHTML: (element) => element.getAttribute('width') || element.style.width || 'auto',
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

/** Helper to handle drag-and-drop and paste of image files onto the TipTap editor */
export const imageDropAndPasteProps = {
  handleDrop: (view: any, event: DragEvent, slice: any, moved: boolean) => {
    if (moved || !event.dataTransfer?.files?.length) return false;
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith('image/')
    );
    if (files.length === 0) return false;

    event.preventDefault();
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const node = view.state.schema.nodes.image.create({ src: url });
        const transaction = view.state.tr.insert(view.state.selection.to, node);
        view.dispatch(transaction);
      };
      reader.readAsDataURL(file);
    });
    return true;
  },
  handlePaste: (view: any, event: ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items || []).filter((item) =>
      item.type.startsWith('image/')
    );
    if (items.length === 0) return false;

    event.preventDefault();
    items.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        const node = view.state.schema.nodes.image.create({ src: url });
        const transaction = view.state.tr.insert(view.state.selection.to, node);
        view.dispatch(transaction);
      };
      reader.readAsDataURL(file);
    });
    return true;
  },
};
