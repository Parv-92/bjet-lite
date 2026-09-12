/**
 * Bjet Mobile - Dashboard TanStack Query Hooks
 * Composes domain queries (budgets and transactions) for dashboard server state.
 */
import { useQuery } from '@tanstack/react-query';
import { getBudgetSummaryApi } from '../api/budgets';
import { getRecentTransactionsApi, getPendingTransactionsApi } from '../api/transactions';
import { getApiErrorMessage } from '../api/client';
import { BudgetSummary, TransactionListItemResponse } from '../types/api';
import { useAuth } from './useAuth';

export function useBudgetSummary(month: number, year: number) {
  const { isAuthenticated } = useAuth();

  return useQuery<BudgetSummary[], Error>({
    queryKey: ['budgets', 'summary', month, year],
    queryFn: () => getBudgetSummaryApi(month, year),
    staleTime: 60_000, // 1 minute
    retry: 1,
    enabled: isAuthenticated,
  });
}

export function useRecentTransactions(limit: number = 5) {
  const { isAuthenticated } = useAuth();

  return useQuery<TransactionListItemResponse[], Error>({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => getRecentTransactionsApi(limit),
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated,
  });
}

export function usePendingTransactions(limit: number = 5) {
  const { isAuthenticated } = useAuth();

  return useQuery<TransactionListItemResponse[], Error>({
    queryKey: ['transactions', 'pending', limit],
    queryFn: () => getPendingTransactionsApi(limit),
    staleTime: 30_000,
    retry: 1,
    enabled: isAuthenticated,
  });
}

export function useDashboard(
  month: number = new Date().getMonth() + 1,
  year: number = new Date().getFullYear()
) {
  const budgetQuery = useBudgetSummary(month, year);
  const recentQuery = useRecentTransactions(5);
  const pendingQuery = usePendingTransactions(5);

  const budgetSummary = budgetQuery.data || [];
  const recentTransactions = recentQuery.data || [];
  const pendingTransactions = pendingQuery.data || [];

  // Compute overall budget metrics:
  // Note: Backend spent_amount excludes PENDING_CONFIRMATION transactions.
  const totalLimit = budgetSummary.reduce(
    (acc, item) => acc + (parseFloat(item.amount_limit) || 0),
    0
  );
  const totalSpent = budgetSummary.reduce(
    (acc, item) => acc + (parseFloat(item.spent_amount) || 0),
    0
  );
  const totalRemaining = Math.max(0, totalLimit - totalSpent);
  const utilizationPercentage = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
  const overBudgetCount = budgetSummary.filter((item) => item.is_over_budget).length;

  const isLoading = budgetQuery.isLoading || recentQuery.isLoading || pendingQuery.isLoading;
  const isRefetching =
    budgetQuery.isRefetching || recentQuery.isRefetching || pendingQuery.isRefetching;
  const isError = budgetQuery.isError || recentQuery.isError || pendingQuery.isError;

  const error = budgetQuery.error || recentQuery.error || pendingQuery.error;
  const errorMessage = error ? getApiErrorMessage(error) : null;

  const refetchAll = async () => {
    await Promise.all([budgetQuery.refetch(), recentQuery.refetch(), pendingQuery.refetch()]);
  };

  return {
    month,
    year,
    budgetSummary,
    recentTransactions,
    pendingTransactions,
    metrics: {
      totalLimit,
      totalSpent,
      totalRemaining,
      utilizationPercentage,
      overBudgetCount,
    },
    isLoading,
    isRefetching,
    isError,
    errorMessage,
    refetchAll,
  };
}

export default useDashboard;
