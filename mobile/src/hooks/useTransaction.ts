/**
 * Bjet Mobile - useTransaction Hook
 * Fetches single transaction details strictly adhering to TransactionDetailResponse.
 */
import { useQuery } from '@tanstack/react-query';
import { getTransactionApi } from '../api/transactions';
import { TransactionDetailResponse } from '../types/api';
import { useAuth } from './useAuth';

export function useTransaction(id: number) {
  const { isAuthenticated } = useAuth();

  return useQuery<TransactionDetailResponse, Error>({
    queryKey: ['transactions', id],
    queryFn: () => getTransactionApi(id),
    enabled: isAuthenticated && !!id && !isNaN(id) && id > 0,
    staleTime: 30 * 1000,
  });
}
