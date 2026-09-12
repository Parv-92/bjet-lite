/**
 * Bjet Mobile - Budget Presets API
 * Conforming strictly to API Contract v0.3.0.
 * Paths have strictly NO trailing slashes.
 */
import { apiClient } from './client';
import {
  BudgetPreset,
  BudgetSummary,
  CreateBudgetPresetRequest,
  UpdateBudgetPresetRequest,
  ApplyBudgetPresetRequest,
} from '../types/api';

/**
 * Retrieve all budget presets for the current user.
 * GET /api/v1/budget-presets
 */
export async function getBudgetPresetsApi(): Promise<BudgetPreset[]> {
  const response = await apiClient.get<BudgetPreset[]>('/budget-presets');
  return response.data;
}

/**
 * Create a new budget preset.
 * POST /api/v1/budget-presets
 */
export async function createBudgetPresetApi(data: CreateBudgetPresetRequest): Promise<BudgetPreset> {
  const response = await apiClient.post<BudgetPreset>('/budget-presets', data);
  return response.data;
}

/**
 * Retrieve details of a budget preset.
 * GET /api/v1/budget-presets/{id}
 */
export async function getBudgetPresetApi(presetId: number): Promise<BudgetPreset> {
  const response = await apiClient.get<BudgetPreset>(`/budget-presets/${presetId}`);
  return response.data;
}

/**
 * Update an existing budget preset.
 * PUT /api/v1/budget-presets/{id}
 */
export async function updateBudgetPresetApi(
  presetId: number,
  data: UpdateBudgetPresetRequest
): Promise<BudgetPreset> {
  const response = await apiClient.put<BudgetPreset>(`/budget-presets/${presetId}`, data);
  return response.data;
}

/**
 * Delete a budget preset.
 * DELETE /api/v1/budget-presets/{id}
 */
export async function deleteBudgetPresetApi(presetId: number): Promise<void> {
  await apiClient.delete(`/budget-presets/${presetId}`);
}

/**
 * Apply a budget preset to a target month and year.
 * POST /api/v1/budget-presets/{id}/apply
 */
export async function applyBudgetPresetApi(
  presetId: number,
  data: ApplyBudgetPresetRequest
): Promise<BudgetSummary[]> {
  const response = await apiClient.post<BudgetSummary[]>(`/budget-presets/${presetId}/apply`, data);
  return response.data;
}
