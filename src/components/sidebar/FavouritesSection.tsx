'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { usePathname, useRouter } from 'next/navigation';
import { GripVertical, Pencil, Check, X } from 'lucide-react';
import clsx from 'clsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

interface FavouriteAccount {
  id: string;
  label?: string | null;
  emailAddress: string;
  color?: string | null;
  authError?: string | null;
  isActive?: boolean;
  sortOrder: number;
}

function FavouriteRow({
  account,
  editing,
  isSelected,
  onSelect,
  onRemove,
}: {
  account: FavouriteAccount;
  editing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group flex items-center rounded-md pr-1 transition-colors',
        isDragging && 'opacity-60 z-10',
        isSelected ? 'bg-accent-600 shadow-sm' : 'hover:bg-gray-200'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className={clsx(
          'flex-shrink-0 cursor-grab touch-none rounded p-1 active:cursor-grabbing',
          isSelected ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-gray-600'
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={onSelect}
        className={clsx(
          'flex min-w-0 flex-1 items-center space-x-3 rounded-md py-2 pl-1 pr-2 text-left text-sm font-medium',
          isSelected ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'
        )}
      >
        <div
          className={clsx(
            'h-2 w-2 flex-shrink-0 rounded-full',
            account.authError
              ? 'bg-red-500'
              : account.isActive === false
                ? 'bg-yellow-500'
                : 'bg-green-500'
          )}
          title={
            account.authError
              ? 'Authentication Error'
              : account.isActive === false
                ? 'Sync Problem'
                : 'Connected and syncing'
          }
        />
        <span className="truncate">{account.label || account.emailAddress}</span>
      </button>
      {editing && (
        <button
          onClick={onRemove}
          title="Remove from favourites"
          className={clsx(
            'flex-shrink-0 rounded p-1 transition-colors',
            isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FavouritesSection() {
  const { selectedAccountId, setSelectedAccountId } = useAccountStore();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const sensors = useSensors(
    // A small activation distance keeps normal clicks (select account) working.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: favourites = [] } = useQuery<FavouriteAccount[]>({
    queryKey: ['favourites'],
    queryFn: async () => {
      const res = await fetch('/api/favourites');
      if (!res.ok) throw new Error('Failed to fetch favourites');
      return res.json();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedAccountIds: string[]) => {
      const res = await fetch('/api/favourites/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedAccountIds }),
      });
      if (!res.ok) throw new Error('Failed to reorder favourites');
      return res.json();
    },
    // The UI is updated optimistically in onDragEnd; on failure, resync from server.
    onError: () => queryClient.invalidateQueries({ queryKey: ['favourites'] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch(`/api/favourites/${accountId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove favourite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favourites'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    if (!pathname.startsWith('/inbox')) {
      router.push('/inbox');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = favourites.findIndex((f) => f.id === active.id);
    const newIndex = favourites.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(favourites, oldIndex, newIndex);
    queryClient.setQueryData(['favourites'], reordered); // optimistic
    reorderMutation.mutate(reordered.map((f) => f.id));
  };

  // Nothing favourited yet — hide the section entirely.
  if (favourites.length === 0) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <div className="flex flex-none items-center justify-between pb-1 pt-2 pl-3 pr-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Favourites
        </p>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          title={editing ? 'Done editing' : 'Edit favourites'}
          className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={favourites.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
            {favourites.map((account) => (
              <FavouriteRow
                key={account.id}
                account={account}
                editing={editing}
                isSelected={selectedAccountId === account.id}
                onSelect={() => handleSelect(account.id)}
                onRemove={() => removeMutation.mutate(account.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
