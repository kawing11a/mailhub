'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/** Shape returned by GET /api/accounts (favourite state + ordering included). */
export interface SidebarAccount {
  id: string;
  label?: string | null;
  emailAddress: string;
  provider?: string | null;
  color?: string | null;
  avatarInitials?: string | null;
  isActive?: boolean;
  authError?: string | null;
  isFavourite: boolean;
  /** Position among the user's favourites; null when not favourited. */
  sortOrder: number | null;
}

/** The name to show for an account, falling back to its address. */
export function accountDisplayName(account: SidebarAccount): string {
  return account.label?.trim() || account.emailAddress;
}

/**
 * Base guard for showing the address as a second line: there must be a label and
 * it must differ from the address, otherwise we'd print the same string twice.
 */
export function shouldShowEmail(account: SidebarAccount): boolean {
  const name = account.label?.trim();
  return !!name && name !== account.emailAddress;
}

/** Display name normalised for comparison ("Support" and "support " collide). */
export function normalizedDisplayName(account: SidebarAccount): string {
  return accountDisplayName(account).trim().toLowerCase();
}

/**
 * Normalised display names shared by two or more accounts. The sidebar uses this
 * to reveal the address only where the name alone can't identify the account.
 */
export function duplicateDisplayNames(accounts: SidebarAccount[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const account of accounts) {
    const name = normalizedDisplayName(account);
    if (seen.has(name)) duplicates.add(name);
    else seen.add(name);
  }
  return duplicates;
}

/** Favourited accounts in their user-defined order. */
export function sortedFavourites(accounts: SidebarAccount[]): SidebarAccount[] {
  return accounts
    .filter((a) => a.isFavourite)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/** Accounts sorted alphabetically by display name (used for "Others"). */
export function sortedByName(accounts: SidebarAccount[]): SidebarAccount[] {
  return [...accounts].sort((a, b) =>
    accountDisplayName(a).localeCompare(accountDisplayName(b))
  );
}

/** Single source for the account list — drives both the sidebar and the modal. */
export function useAccounts() {
  return useQuery<SidebarAccount[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });
}

/**
 * Favourite add/remove/reorder, shared by the sidebar and the all-accounts modal.
 * All three update the ['accounts'] cache optimistically. Removing shows an Undo
 * toast that restores the account to its exact previous position — a plain re-add
 * would append it to the end instead.
 */
export function useFavouriteMutations() {
  const queryClient = useQueryClient();

  const patchAccounts = (
    updater: (accounts: SidebarAccount[]) => SidebarAccount[]
  ) =>
    queryClient.setQueryData<SidebarAccount[]>(['accounts'], (old) =>
      old ? updater(old) : old
    );

  const resync = () => queryClient.invalidateQueries({ queryKey: ['accounts'] });

  const addMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch('/api/favourites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error('Failed to add favourite');
      return res.json();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch(`/api/favourites/${accountId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove favourite');
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
  });

  const addFavourite = async (accountId: string) => {
    patchAccounts((accounts) => {
      const maxOrder = accounts.reduce(
        (max, a) => (a.isFavourite ? Math.max(max, a.sortOrder ?? 0) : max),
        -1
      );
      return accounts.map((a) =>
        a.id === accountId ? { ...a, isFavourite: true, sortOrder: maxOrder + 1 } : a
      );
    });

    try {
      await addMutation.mutateAsync(accountId);
    } catch {
      toast.error('Failed to add favourite');
    } finally {
      resync();
    }
  };

  /** Re-add then restore the captured ordering, so the row returns where it was. */
  const undoRemove = async (accountId: string, previousOrder: string[]) => {
    try {
      await addMutation.mutateAsync(accountId);
      await reorderMutation.mutateAsync(previousOrder);
    } catch {
      toast.error('Failed to restore favourite');
    } finally {
      resync();
    }
  };

  const removeFavourite = async (accountId: string) => {
    // Capture the ordering *before* removal so Undo can restore the exact position.
    const current = queryClient.getQueryData<SidebarAccount[]>(['accounts']) ?? [];
    const previousOrder = sortedFavourites(current).map((a) => a.id);
    const name = current.find((a) => a.id === accountId);

    patchAccounts((accounts) =>
      accounts.map((a) =>
        a.id === accountId ? { ...a, isFavourite: false, sortOrder: null } : a
      )
    );

    try {
      await removeMutation.mutateAsync(accountId);
    } catch {
      toast.error('Failed to remove favourite');
      resync();
      return;
    }
    resync();

    toast.custom(
      (t) => (
        <div className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="truncate">
            Removed {name ? accountDisplayName(name) : 'account'} from favourites
          </span>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              undoRemove(accountId, previousOrder);
            }}
            className="flex-shrink-0 font-semibold text-accent-300 underline-offset-2 hover:underline"
          >
            Undo
          </button>
        </div>
      ),
      { duration: 6000 }
    );
  };

  const toggleFavourite = (account: SidebarAccount) =>
    account.isFavourite ? removeFavourite(account.id) : addFavourite(account.id);

  const reorderFavourites = (orderedAccountIds: string[]) => {
    patchAccounts((accounts) =>
      accounts.map((a) => {
        const index = orderedAccountIds.indexOf(a.id);
        return index === -1 ? a : { ...a, sortOrder: index };
      })
    );
    reorderMutation.mutate(orderedAccountIds, { onError: resync });
  };

  return {
    addFavourite,
    removeFavourite,
    toggleFavourite,
    reorderFavourites,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}
