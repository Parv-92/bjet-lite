/**
 * Bjet Lite - Friends Hook (Phase C7)
 * Backed by SQLite friendRepository.
 * Query and mutation hooks for managing friend recognition configurations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { friendRepository } from '../repositories';
import type { Friend, CreateFriendRequest, UpdateFriendRequest } from '../types/api';
import { useAuth } from './useAuth';

export function useFriends(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<Friend[], Error>({
    queryKey: ['friends'],
    queryFn: () => friendRepository.getAll(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

export function useCreateFriend() {
  const queryClient = useQueryClient();

  return useMutation<Friend, Error, CreateFriendRequest>({
    mutationFn: (data: CreateFriendRequest) => friendRepository.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useUpdateFriend() {
  const queryClient = useQueryClient();

  return useMutation<Friend, Error, { id: number; data: UpdateFriendRequest }>({
    mutationFn: ({ id, data }) => friendRepository.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useDeleteFriend() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => friendRepository.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
