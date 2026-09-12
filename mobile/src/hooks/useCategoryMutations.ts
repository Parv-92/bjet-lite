/**
 * Bjet Mobile - useCategoryMutations Hook (Phase 9)
 * Provides typed mutations for Category CRUD with proper cache invalidation.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCategoryApi,
  updateCategoryApi,
  deleteCategoryApi,
} from '../api/categories';
import { CreateCategoryRequest, UpdateCategoryRequest, Category } from '../types/api';

/**
 * Mutation hook to create a user-owned custom category.
 * Invalidates ['categories'] and ['budgets', 'summary'].
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation<Category, Error, CreateCategoryRequest>({
    mutationFn: (data: CreateCategoryRequest) => createCategoryApi(data),
    onSuccess: () => {
      // Invalidate all category queries (list + detail)
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      // Invalidate budget queries so new category appears in budget creation
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
    },
  });
}

/**
 * Mutation hook to update a user-owned custom category.
 * Invalidates ['categories'], ['transactions'], and ['budgets', 'summary'].
 */
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation<Category, Error, { id: number; data: UpdateCategoryRequest }>({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryRequest }) =>
      updateCategoryApi(id, data),
    onSuccess: (data, variables) => {
      // Invalidate all category queries
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories', variables.id] });
      // Invalidate transactions so updated category metadata displays correctly
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      // Invalidate budgets so updated category metadata displays correctly
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      // Invalidate rules so rule cards reflect updated category name/icon/color
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}

/**
 * Mutation hook to delete a user-owned custom category.
 * If deletion is blocked because the category is referenced, the backend error is preserved.
 * Invalidates ['categories'], ['budgets', 'summary'], ['rules'], and removes stale detail cache.
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => deleteCategoryApi(id),
    onSuccess: (_data, id) => {
      // Invalidate all category queries
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      // Remove stale category detail cache
      queryClient.removeQueries({ queryKey: ['categories', id] });
      // Invalidate budget queries
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });
      // Invalidate rules defensively
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    },
  });
}
