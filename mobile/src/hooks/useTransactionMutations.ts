/**
 * Bjet Mobile - Transaction Mutations Hook
 * Encapsulates create, update, and delete mutations with cache invalidations.
 * Generic PUT never modifies transaction status.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createTransactionApi,
  updateTransactionApi,
  deleteTransactionApi,
  bulkDeleteTransactionsApi,
} from '../api/transactions';
import {
  CreateManualTransactionRequest,
  UpdateTransactionRequest,
  TransactionDetailResponse,
  TransactionBulkDeleteResponse,
} from '../types/api';

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation<TransactionDetailResponse, Error, CreateManualTransactionRequest>({
    mutationFn: (data: CreateManualTransactionRequest) => createTransactionApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation<
    TransactionDetailResponse,
    Error,
    { id: number; data: UpdateTransactionRequest }
  >({
    mutationFn: ({ id, data }) => updateTransactionApi(id, data),
    onSuccess: (_, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      if (data.set_as_merchant_default) {
        queryClient.invalidateQueries({ queryKey: ['rules'] });
        queryClient.invalidateQueries({ queryKey: ['merchants'] });
      }
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => deleteTransactionApi(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.removeQueries({ queryKey: ['transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
    },
  });
}

export function useBulkDeleteTransactions() {
  const queryClient = useQueryClient();

  return useMutation<TransactionBulkDeleteResponse, Error, number[]>({
    mutationFn: (ids: number[]) => bulkDeleteTransactionsApi(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      for (const id of data.transaction_ids) {
        queryClient.removeQueries({ queryKey: ['transactions', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
