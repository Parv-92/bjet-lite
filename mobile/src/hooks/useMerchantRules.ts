/**
 * Bjet Mobile - Merchant Rules Query Hook (Phase 10 / Bjet Lite)
 * Fetches user merchant rules from local SQLite merchantRuleRepository.
 */
import { useQuery } from '@tanstack/react-query';
import { merchantRuleRepository, transactionRepository } from '../repositories';
import { UserMerchantRule } from '../types/rules';
import { useAuth } from './useAuth';

/**
 * Hook to retrieve all merchant rules for the current user.
 * Query key: ['rules', 'list']
 */
export function useMerchantRules(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<UserMerchantRule[], Error>({
    queryKey: ['rules', 'list'],
    queryFn: () => merchantRuleRepository.getAll(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

/**
 * Hook to retrieve a single merchant rule by ID from the rules list.
 * Query key: ['rules', 'detail', id]
 */
export function useMerchantRule(id: number) {
  const { isAuthenticated } = useAuth();

  return useQuery<UserMerchantRule | null, Error>({
    queryKey: ['rules', 'detail', id],
    queryFn: () => merchantRuleRepository.getById(id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && typeof id === 'number' && !isNaN(id) && id > 0,
  });
}

/**
 * Hook to retrieve merchants with uncategorized transactions.
 * Query key: ['merchants', 'uncategorized']
 */
export function useUncategorizedMerchants() {
  const { isAuthenticated } = useAuth();

  return useQuery<{ merchant_name: string; count: number }[], Error>({
    queryKey: ['merchants', 'uncategorized'],
    queryFn: () => transactionRepository.getUncategorizedMerchants(),
    staleTime: 30_000,
    retry: 1,
    enabled: isAuthenticated,
  });
}

