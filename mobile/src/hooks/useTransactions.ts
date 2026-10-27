/**
 * Bjet Lite - useTransactions Hook (Phase C5)
 * Provides query for listing transactions backed by SQLite transactionRepository.
 */
import { useQuery } from '@tanstack/react-query';
import { transactionRepository } from '../repositories';
import type { GetTransactionsParams } from '../repositories';
import type { TransactionListItemResponse } from '../types/api';
import { useAuth } from './useAuth';

export type { GetTransactionsParams };

export function useTransactions(params?: GetTransactionsParams, options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<TransactionListItemResponse[], Error>({
    queryKey: ['transactions', params],
    queryFn: () => transactionRepository.getTransactions(params),
    staleTime: 30 * 1000,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}
