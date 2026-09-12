/**
 * Bjet Mobile - Friends API
 * Conforming strictly to API Contract v0.3.0.
 * Paths have strictly NO trailing slashes.
 */
import { apiClient } from './client';
import { Friend, CreateFriendRequest, UpdateFriendRequest } from '../types/api';

/**
 * Retrieve all configured friends for the current user.
 * GET /api/v1/friends
 */
export async function getFriendsApi(): Promise<Friend[]> {
  const response = await apiClient.get<Friend[]>('/friends');
  return response.data;
}

/**
 * Create a new friend configuration.
 * POST /api/v1/friends
 */
export async function createFriendApi(data: CreateFriendRequest): Promise<Friend> {
  const response = await apiClient.post<Friend>('/friends', data);
  return response.data;
}

/**
 * Retrieve details of a friend.
 * GET /api/v1/friends/{id}
 */
export async function getFriendApi(friendId: number): Promise<Friend> {
  const response = await apiClient.get<Friend>(`/friends/${friendId}`);
  return response.data;
}

/**
 * Update an existing friend.
 * PUT /api/v1/friends/{id}
 */
export async function updateFriendApi(friendId: number, data: UpdateFriendRequest): Promise<Friend> {
  const response = await apiClient.put<Friend>(`/friends/${friendId}`, data);
  return response.data;
}

/**
 * Delete a friend.
 * DELETE /api/v1/friends/{id}
 */
export async function deleteFriendApi(friendId: number): Promise<void> {
  await apiClient.delete(`/friends/${friendId}`);
}
