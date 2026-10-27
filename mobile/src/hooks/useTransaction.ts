/**
 * Bjet Lite - useTransaction Hook (Phase C5)
 * Fetches single transaction details strictly adhering to TransactionDetailResponse from SQLite.
 */
import { useQuery } from '@tanstack/react-query';
import { transactionRepository, NotFoundError } from '../repositories';
import type { TransactionDetailResponse } from '../types/api';
import { useAuth } from './useAuth';

export function useTransaction(id: number) {
  const { isAuthenticated } = useAuth();

  return useQuery<TransactionDetailResponse, Error>({
    queryKey: ['transactions', id],
    queryFn: async () => {
      const tx = await transactionRepository.getTransactionById(id);
      if (!tx) {
        throw new NotFoundError(`Transaction with ID ${id} not found.`);
      }
      return tx;
    },
    enabled: isAuthenticated && !!id && !isNaN(id) && id > 0,
    staleTime: 30 * 1000,
  });
}
