/**
 * Bjet Lite - Budget TanStack Query Hooks (Phase C6)
 * Backed by SQLite budgetRepository.
 *
 * Provides hooks for:
 * - Querying monthly budget summary: ['budgets', 'summary', month, year]
 * - Querying specific category budget status: ['budgets', categoryId, month, year]
 * - Mutating/upserting category budgets
 * - Monthly spending breakdown by category for donut chart
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetRepository } from '../repositories';
import { triggerAutoBackup } from '../services/backup';
import type {
  Budget,
  BudgetSummary,
  MonthlySpendingBreakdown,
  SetBudgetRequest,
} from '../types/api';
import type { MonthlyFinancialSummary } from '../repositories/budgetRepository';
import { useAuth } from './useAuth';

/**
 * Hook to retrieve full financial summary (personal spending, incoming money, net movement, budget usage)
 * for a specific month and year.
 * Query Key: ['budgets', 'financial-summary', month, year]
 */
export function useMonthlyFinancialSummary(
  month: number,
  year: number,
  options?: { enabled?: boolean }
) {
  const { isAuthenticated } = useAuth();

  return useQuery<MonthlyFinancialSummary, Error>({
    queryKey: ['budgets', 'financial-summary', month, year],
    queryFn: () => budgetRepository.getMonthlyFinancialSummary(month, year),
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

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
    queryFn: () => budgetRepository.getSpendingBreakdown(month, year),
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
    queryFn: () => budgetRepository.getBudgetSummary(month, year),
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

  return useQuery<BudgetSummary | null, Error>({
    queryKey: ['budgets', categoryId, month, year],
    queryFn: () => budgetRepository.getCategoryBudgetStatus(categoryId, month, year),
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && enabled && categoryId > 0,
  });
}

/**
 * Hook to create or upsert a category budget limit.
 */
export function useSetBudget() {
  const queryClient = useQueryClient();

  return useMutation<Budget, Error, SetBudgetRequest>({
    mutationFn: (data: SetBudgetRequest) => budgetRepository.setBudget(data),
    onSuccess: (_savedBudget, variables) => {
      // Invalidate the broader summary family: automatically updates Dashboard and all monthly lists
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      // Invalidate specific category budget status
      queryClient.invalidateQueries({
        queryKey: ['budgets', variables.category_id, variables.month, variables.year],
      });
      triggerAutoBackup({ reason: 'set budget' });
    },
  });
}

/**
 * Hook to delete/remove a category budget for a specific month and year.
 */
export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { category_id: number; month: number; year: number }>({
    mutationFn: ({ category_id, month, year }) => budgetRepository.deleteBudget(category_id, month, year),
    onSuccess: (_data, variables) => {
      // Invalidate the broader summary family: automatically updates Dashboard and all monthly lists
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      // Invalidate specific category budget status
      queryClient.invalidateQueries({
        queryKey: ['budgets', variables.category_id, variables.month, variables.year],
      });
      triggerAutoBackup({ reason: 'delete budget' });
    },
  });
}

