/**
 * Bjet Mobile - Merchant Rules Query Hook (Phase 10)
 * Fetches user merchant rules configured on backend for auto-categorization suggestions.
 */
import { useQuery } from '@tanstack/react-query';
import { getMerchantRulesApi } from '../api/rules';
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
    queryFn: getMerchantRulesApi,
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
    queryFn: async () => {
      const allRules = await getMerchantRulesApi();
      return allRules.find((r) => r.id === id) || null;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && typeof id === 'number' && !isNaN(id) && id > 0,
  });
}
