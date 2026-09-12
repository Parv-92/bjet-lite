/**
 * Bjet Mobile - useTransactions Hook
 * Provides query for listing transactions with optional filtering.
 */
import { useQuery } from '@tanstack/react-query';
import { getTransactionsApi, GetTransactionsParams } from '../api/transactions';
import { TransactionListItemResponse } from '../types/api';
import { useAuth } from './useAuth';

export function useTransactions(params?: GetTransactionsParams, options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<TransactionListItemResponse[], Error>({
    queryKey: ['transactions', params],
    queryFn: () => getTransactionsApi(params),
    staleTime: 30 * 1000,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}
