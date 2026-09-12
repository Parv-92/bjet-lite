/**
 * Bjet Mobile - Transactions API
 * Conforming strictly to API Contract v0.3.0.
 * Default backend ordering is guaranteed newest-first: desc(Transaction.timestamp).
 * Paths have strictly NO trailing slashes.
 */
import { apiClient } from './client';
import {
  TransactionListItemResponse,
  TransactionDetailResponse,
  TransactionStatus,
  CreateManualTransactionRequest,
  UpdateTransactionRequest,
  TransactionBulkDeleteResponse,
} from '../types/api';

export interface GetTransactionsParams {
  limit?: number;
  skip?: number;
  status?: TransactionStatus;
  category_id?: number;
  start_date?: string;
  end_date?: string;
}

/**
 * Fetch a list of transactions with optional filtering and pagination.
 * Guaranteed newest-first by backend default: desc(Transaction.timestamp).
 * GET /api/v1/transactions
 */
export async function getTransactionsApi(
  params?: GetTransactionsParams
): Promise<TransactionListItemResponse[]> {
  const response = await apiClient.get<TransactionListItemResponse[]>('/transactions', {
    params,
  });
  return response.data;
}

/**
 * Fetch the latest 5 transactions.
 * GET /api/v1/transactions?limit=5
 */
export async function getRecentTransactionsApi(
  limit: number = 5
): Promise<TransactionListItemResponse[]> {
  return getTransactionsApi({ limit });
}

/**
 * Fetch transactions requiring confirmation.
 * GET /api/v1/transactions?status=PENDING_CONFIRMATION&limit=5
 */
export async function getPendingTransactionsApi(
  limit: number = 5
): Promise<TransactionListItemResponse[]> {
  return getTransactionsApi({ status: 'PENDING_CONFIRMATION', limit });
}

/**
 * Get detailed transaction by ID.
 * GET /api/v1/transactions/{id}
 */
export async function getTransactionApi(
  id: number
): Promise<TransactionDetailResponse> {
  const response = await apiClient.get<TransactionDetailResponse>(`/transactions/${id}`);
  return response.data;
}

/**
 * Create a manual transaction.
 * POST /api/v1/transactions
 */
export async function createTransactionApi(
  data: CreateManualTransactionRequest
): Promise<TransactionDetailResponse> {
  const response = await apiClient.post<TransactionDetailResponse>('/transactions', data);
  return response.data;
}

/**
 * Update transaction fields (category, notes, amount, timestamp, etc.).
 * Status cannot be modified via generic PUT.
 * PUT /api/v1/transactions/{id}
 */
export async function updateTransactionApi(
  id: number,
  data: UpdateTransactionRequest
): Promise<TransactionDetailResponse> {
  const response = await apiClient.put<TransactionDetailResponse>(`/transactions/${id}`, data);
  return response.data;
}

/**
 * Delete a transaction by ID.
 * DELETE /api/v1/transactions/{id}
 */
export async function deleteTransactionApi(id: number): Promise<void> {
  await apiClient.delete(`/transactions/${id}`);
}

/**
 * Bulk delete transactions by IDs.
 * DELETE /api/v1/transactions/bulk
 */
export async function bulkDeleteTransactionsApi(
  transactionIds: number[]
): Promise<TransactionBulkDeleteResponse> {
  const response = await apiClient.delete<TransactionBulkDeleteResponse>('/transactions/bulk', {
    data: { transaction_ids: transactionIds },
  });
  return response.data;
}

/**
 * Confirm a pending draft transaction.
 * Validates user-reviewed fields and transitions status from PENDING_CONFIRMATION to CONFIRMED.
 * POST /api/v1/transactions/{id}/confirm
 */
export async function confirmTransactionApi(
  id: number,
  data: import('../types/api').ReceiptConfirmRequest
): Promise<TransactionDetailResponse> {
  const response = await apiClient.post<TransactionDetailResponse>(
    `/transactions/${id}/confirm`,
    data
  );
  return response.data;
}

