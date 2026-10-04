/**
 * Bjet Mobile - Budget TanStack Query Hooks (Phase 8)
 *
 * Provides hooks for:
 * - Querying monthly budget summary: ['budgets', 'summary', month, year]
 * - Querying specific category budget status: ['budgets', categoryId, month, year]
 * - Mutating/upserting category budgets via POST /api/v1/budgets
 *
 * Invalidation Strategy:
 * - Invalidation of broader ['budgets', 'summary'] query family automatically refreshes
 *   all monthly summaries and the Dashboard.
 * - Invalidation of specific ['budgets', categoryId, month, year] refreshes category status.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBudgetSummaryApi,
  getCategoryBudgetStatusApi,
  getMonthlySpendingBreakdownApi,
  setBudgetApi,
  deleteBudgetApi,
} from '../api/budgets';
import { Budget, BudgetSummary, MonthlySpendingBreakdown, SetBudgetRequest } from '../types/api';
import { useAuth } from './useAuth';

/**
 * Hook to retrieve monthly spending breakdown by category for the pie chart.
 * Query Key: ['budgets', 'spending-breakdown', month, year]
 */
export function useMonthlySpendingBreakdown(
  month: number,
  year: number,
  options?: { enabled?: boolean }
) {
  const { isAuthenticated } = useAuth();

  return useQuery<MonthlySpendingBreakdown, Error>({
    queryKey: ['budgets', 'spending-breakdown', month, year],
    queryFn: () => getMonthlySpendingBreakdownApi(month, year),
    staleTime: 60_000, // 60 seconds
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

/**
 * Hook to retrieve monthly budget summary for a given month and year.
 * Query Key: ['budgets', 'summary', month, year]
 */
export function useBudgetSummary(month: number, year: number, options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<BudgetSummary[], Error>({
    queryKey: ['budgets', 'summary', month, year],
    queryFn: () => getBudgetSummaryApi(month, year),
    staleTime: 60_000, // 60 seconds
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

/**
 * Hook to retrieve single category budget status for a given month and year.
 * Query Key: ['budgets', categoryId, month, year]
 */
export function useCategoryBudgetStatus(
  categoryId: number,
  month: number,
  year: number,
  enabled: boolean = true
) {
  const { isAuthenticated } = useAuth();

  return useQuery<BudgetSummary, Error>({
    queryKey: ['budgets', categoryId, month, year],
    queryFn: () => getCategoryBudgetStatusApi(categoryId, month, year),
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && enabled && categoryId > 0,
  });
}

/**
 * Hook to create or upsert a category budget limit.
 * Handles both 201 Created and 200 OK responses smoothly.
 */
export function useSetBudget() {
  const queryClient = useQueryClient();

  return useMutation<Budget, Error, SetBudgetRequest>({
    mutationFn: (data: SetBudgetRequest) => setBudgetApi(data),
    onSuccess: (savedBudget, variables) => {
      // Invalidate the broader summary family: automatically updates Dashboard and all monthly lists
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      // Invalidate specific category budget status
      queryClient.invalidateQueries({
        queryKey: ['budgets', variables.category_id, variables.month, variables.year],
      });
    },
  });
}

/**
 * Hook to delete/remove a category budget for a specific month and year.
 */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { category_id: number; month: number; year: number }>({
    mutationFn: ({ category_id, month, year }) => deleteBudgetApi(category_id, month, year),
    onSuccess: (_data, variables) => {
      // Invalidate the broader summary family: automatically updates Dashboard and all monthly lists
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      queryClient.invalidateQueries({
        queryKey: ['budgets', 'spending-breakdown', variables.month, variables.year],
      });
      // Invalidate specific category budget status
      queryClient.invalidateQueries({
        queryKey: ['budgets', variables.category_id, variables.month, variables.year],
      });
    },
  });
}

