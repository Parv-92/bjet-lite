/**
 * Bjet Mobile - Budget Presets Hook
 * Query and mutation hooks for managing reusable budget presets.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBudgetPresetsApi,
  createBudgetPresetApi,
  updateBudgetPresetApi,
  deleteBudgetPresetApi,
  applyBudgetPresetApi,
} from '../api/presets';
import {
  BudgetPreset,
  BudgetSummary,
  CreateBudgetPresetRequest,
  UpdateBudgetPresetRequest,
  ApplyBudgetPresetRequest,
} from '../types/api';
import { useAuth } from './useAuth';

export function useBudgetPresets(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<BudgetPreset[], Error>({
    queryKey: ['budget-presets'],
    queryFn: getBudgetPresetsApi,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

export function useCreateBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<BudgetPreset, Error, CreateBudgetPresetRequest>({
    mutationFn: (data: CreateBudgetPresetRequest) => createBudgetPresetApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
    },
  });
}

export function useUpdateBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<BudgetPreset, Error, { id: number; data: UpdateBudgetPresetRequest }>({
    mutationFn: ({ id, data }) => updateBudgetPresetApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
    },
  });
}

export function useDeleteBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => deleteBudgetPresetApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
    },
  });
}

export function useApplyBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<
    BudgetSummary[],
    Error,
    { id: number; data: ApplyBudgetPresetRequest }
  >({
    mutationFn: ({ id, data }) => applyBudgetPresetApi(id, data),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary', data.month, data.year] });
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
    },
  });
}
