'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import type { AccountLabel } from '@/components/accounts/LabelFilterMenu';

/** Translucent version of a label colour, for the unselected chip background. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16) || 59;
  const g = parseInt(hex.slice(3, 5), 16) || 130;
  const b = parseInt(hex.slice(5, 7), 16) || 246;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Black or white text, whichever reads better on the given colour. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  // Perceived luminance (ITU-R BT.601).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

const CHIP_BASE =
  'flex-none cursor-pointer select-none rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors';

/**
 * Single-select label filter for the sidebar: a horizontal row of colour-filled
 * chips (with a leading "All" reset chip). The row hides its scrollbar but stays
 * scrollable via the mouse wheel and by dragging.
 */
export function LabelFilterChips({
  labels,
  selectedLabelId,
  onSelect,
}: {
  labels: AccountLabel[];
  selectedLabelId: string | null;
  onSelect: (labelId: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    moved: false,
    captured: false,
  });

  // Vertical wheel scrolls the row horizontally, smoothly. Registered natively
  // as non-passive so preventDefault() actually stops the page from scrolling.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      el.scrollBy({ left: e.deltaY, behavior: 'smooth' });
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    // Note: no pointer capture here — capturing on a plain click swallows the
    // chip's click event. We only capture once a real drag begins (below).
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      captured: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const drag = dragRef.current;
    if (!el || !drag.active) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 5) {
      drag.moved = true;
      el.setPointerCapture(e.pointerId);
      drag.captured = true;
    }
    if (drag.moved) el.scrollLeft = drag.startScroll - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const drag = dragRef.current;
    if (drag.captured && el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    drag.active = false;
    drag.captured = false;
  };

  // Swallow the click that ends a drag so scrubbing the row never selects a chip.
  const select = (labelId: string | null) => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    onSelect(labelId);
  };

  const allSelected = selectedLabelId === null;

  return (
    <div
      ref={scrollRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-hide"
    >
      <button
        type="button"
        onClick={() => select(null)}
        aria-pressed={allSelected}
        className={clsx(
          CHIP_BASE,
          allSelected
            ? 'border-accent-600 bg-accent-600 text-white'
            : 'border-gray-200 text-gray-600 hover:bg-gray-100'
        )}
      >
        All
      </button>

      {labels.map((label) => {
        const color = label.color || '#3B82F6';
        const selected = selectedLabelId === label.id;
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => select(label.id)}
            aria-pressed={selected}
            title={label.name}
            className={CHIP_BASE}
            style={
              selected
                ? { backgroundColor: color, borderColor: color, color: contrastText(color) }
                : { backgroundColor: hexToRgba(color, 0.08), borderColor: color, color }
            }
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
