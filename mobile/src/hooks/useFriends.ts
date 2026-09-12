/**
 * Bjet Mobile - Friends Hook
 * Query and mutation hooks for managing friend recognition configurations.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFriendsApi,
  createFriendApi,
  updateFriendApi,
  deleteFriendApi,
} from '../api/friends';
import { Friend, CreateFriendRequest, UpdateFriendRequest } from '../types/api';
import { useAuth } from './useAuth';

export function useFriends(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();

  return useQuery<Friend[], Error>({
    queryKey: ['friends'],
    queryFn: getFriendsApi,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: isAuthenticated && (options?.enabled ?? true),
  });
}

export function useCreateFriend() {
  const queryClient = useQueryClient();

  return useMutation<Friend, Error, CreateFriendRequest>({
    mutationFn: (data: CreateFriendRequest) => createFriendApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useUpdateFriend() {
  const queryClient = useQueryClient();

  return useMutation<Friend, Error, { id: number; data: UpdateFriendRequest }>({
    mutationFn: ({ id, data }) => updateFriendApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}

export function useDeleteFriend() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => deleteFriendApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}
