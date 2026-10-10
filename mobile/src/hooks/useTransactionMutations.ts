/**
 * Bjet Lite - Transaction Mutations Hook (Phase C5)
 * Encapsulates create, update, delete, and bulk-delete mutations backed by SQLite transactionRepository.
 * Generic PUT never modifies transaction status.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionRepository } from '../repositories';
import { triggerAutoBackup } from '../services/backup';
import type {
  CreateManualTransactionRequest,
  UpdateTransactionRequest,
  TransactionDetailResponse,
  TransactionBulkDeleteResponse,
} from '../types/api';

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation<TransactionDetailResponse, Error, CreateManualTransactionRequest>({
    mutationFn: (data: CreateManualTransactionRequest) =>
      transactionRepository.createTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      triggerAutoBackup({ reason: 'create transaction' });
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
    mutationFn: ({ id, data }) => transactionRepository.updateTransaction(id, data),
    onSuccess: (_, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      if (data.set_as_merchant_default) {
        queryClient.invalidateQueries({ queryKey: ['rules'] });
        queryClient.invalidateQueries({ queryKey: ['merchants'] });
      }
      triggerAutoBackup({ reason: 'update transaction' });
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => transactionRepository.deleteTransaction(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.removeQueries({ queryKey: ['transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      triggerAutoBackup({ reason: 'delete transaction' });
    },
  });
}

export function useBulkDeleteTransactions() {
  const queryClient = useQueryClient();

  return useMutation<TransactionBulkDeleteResponse, Error, number[]>({
    mutationFn: (ids: number[]) => transactionRepository.bulkDeleteTransactions(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      for (const id of data.transaction_ids) {
        queryClient.removeQueries({ queryKey: ['transactions', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      triggerAutoBackup({ reason: 'bulk delete transactions' });
    },
  });
}

