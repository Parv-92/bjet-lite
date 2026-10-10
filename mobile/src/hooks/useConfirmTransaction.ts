/**
 * Bjet Lite - Transaction Confirmation Hook (Phase C5)
 * Dedicated mutation for confirming PENDING_CONFIRMATION transactions backed by SQLite.
 * Transitions draft to CONFIRMED and invalidates transactions and budget caches.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { transactionRepository } from '../repositories';
import { triggerAutoBackup } from '../services/backup';
import type { ReceiptConfirmRequest, TransactionDetailResponse } from '../types/api';

export function useConfirmTransaction() {
  const queryClient = useQueryClient();

  return useMutation<
    TransactionDetailResponse,
    Error,
    { id: number; data: ReceiptConfirmRequest }
  >({
    mutationFn: ({ id, data }) => transactionRepository.confirmTransaction(id, data),
    onSuccess: (confirmedTx, { id }) => {
      // Invalidate queries so transactions list, transaction detail, and budgets are fresh
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', id] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      queryClient.setQueryData(['transactions', id], confirmedTx);
      triggerAutoBackup({ reason: 'confirm transaction' });
    },
  });
}
