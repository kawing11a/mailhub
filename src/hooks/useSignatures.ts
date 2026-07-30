'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export interface Signature {
  id: string;
  accountId: string;
  name: string;
  contentHtml: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useSignatures(accountId?: string | null) {
  const queryClient = useQueryClient();

  const {
    data: signatures = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Signature[]>({
    queryKey: ['signatures', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const res = await fetch(`/api/accounts/${accountId}/signatures`);
      if (!res.ok) {
        throw new Error('Failed to fetch signatures');
      }
      const data = await res.json();
      return data.signatures || [];
    },
    enabled: !!accountId,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; contentHtml: string; isDefault?: boolean }) => {
      if (!accountId) throw new Error('Account ID is required');
      const res = await fetch(`/api/accounts/${accountId}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create signature');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signatures', accountId] });
      toast.success('Signature created');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      contentHtml?: string;
      isDefault?: boolean;
    }) => {
      const res = await fetch(`/api/signatures/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update signature');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signatures', accountId] });
      toast.success('Signature updated');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/signatures/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete signature');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signatures', accountId] });
      toast.success('Signature deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/signatures/${id}/set-default`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to set default signature');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signatures', accountId] });
      toast.success('Default signature updated');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const defaultSignature = signatures.find((s) => s.isDefault) || signatures[0] || null;

  return {
    signatures,
    defaultSignature,
    isLoading,
    isError,
    error,
    refetch,
    createSignature: createMutation.mutateAsync,
    updateSignature: updateMutation.mutateAsync,
    deleteSignature: deleteMutation.mutateAsync,
    setDefaultSignature: setDefaultMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isSettingDefault: setDefaultMutation.isPending,
  };
}
