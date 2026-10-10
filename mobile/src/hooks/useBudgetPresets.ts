/**
 * Bjet Lite - Budget Presets Hook (Phase C6)
 * Backed by SQLite budgetPresetRepository.
 * Query and mutation hooks for managing reusable budget presets.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetPresetRepository } from '../repositories';
import { triggerAutoBackup } from '../services/backup';
import type {
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
    queryFn: () => budgetPresetRepository.getAll(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

export function useCreateBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<BudgetPreset, Error, CreateBudgetPresetRequest>({
    mutationFn: (data: CreateBudgetPresetRequest) => budgetPresetRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
      triggerAutoBackup({ reason: 'create budget preset' });
    },
  });
}

export function useUpdateBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<BudgetPreset, Error, { id: number; data: UpdateBudgetPresetRequest }>({
    mutationFn: ({ id, data }) => budgetPresetRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
      triggerAutoBackup({ reason: 'update budget preset' });
    },
  });
}

export function useDeleteBudgetPreset() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => budgetPresetRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
      triggerAutoBackup({ reason: 'delete budget preset' });
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
    mutationFn: ({ id, data }) => budgetPresetRepository.applyPreset(id, data),
    onSuccess: (_, { data }) => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary', data.month, data.year] });
      queryClient.invalidateQueries({ queryKey: ['budget-presets'] });
      triggerAutoBackup({ reason: 'apply budget preset' });
    },
  });
}
