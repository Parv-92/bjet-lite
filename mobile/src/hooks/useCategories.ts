/**
 * Bjet Lite - useCategories Hook (Phase C4)
 * Fetches categories list and individual category details from SQLite categoryRepository.
 */
import { useQuery } from '@tanstack/react-query';
import { categoryRepository, NotFoundError } from '../repositories';
import type { Category } from '../types/api';
import { useAuth } from './useAuth';

/**
 * Hook to retrieve all categories available to the authenticated user.
 * Backed by local SQLite categoryRepository.
 * Query key: ['categories', 'list']
 */
export function useCategories(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<Category[], Error>({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryRepository.getAll(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

/**
 * Hook to retrieve a single category by ID.
 * Backed by local SQLite categoryRepository.
 * Query key: ['categories', id]
 */
export function useCategory(id: number) {
  const { isAuthenticated } = useAuth();

  return useQuery<Category, Error>({
    queryKey: ['categories', id],
    queryFn: async () => {
      const category = await categoryRepository.getById(id);
      if (!category) {
        throw new NotFoundError(`Category with ID ${id} not found.`);
      }
      return category;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && typeof id === 'number' && !isNaN(id) && id > 0,
  });
}
