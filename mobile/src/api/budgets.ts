/**
 * Bjet Mobile - Budgets API
 * Conforming strictly to API Contract v0.3.0.
 * Paths have strictly NO trailing slashes.
 */
import { apiClient } from './client';
import { Budget, BudgetSummary, MonthlySpendingBreakdown, SetBudgetRequest } from '../types/api';

/**
 * Retrieve all category budget summaries for a given month and year.
 * GET /api/v1/budgets/summary?month={month}&year={year}
 */
export async function getBudgetSummaryApi(month: number, year: number): Promise<BudgetSummary[]> {
  const response = await apiClient.get<BudgetSummary[]>('/budgets/summary', {
    params: { month, year },
  });
  return response.data;
}

/**
 * Retrieve monthly spending breakdown by category for the pie chart.
 * GET /api/v1/budgets/spending-breakdown?month={month}&year={year}
 */
export async function getMonthlySpendingBreakdownApi(
  month: number,
  year: number
): Promise<MonthlySpendingBreakdown> {
  const response = await apiClient.get<MonthlySpendingBreakdown>('/budgets/spending-breakdown', {
    params: { month, year },
  });
  return response.data;
}

/**
 * Set or upsert a category budget for a specific month and year.
 * POST /api/v1/budgets
 *
 * Backend upsert behavior:
 * - Returns 201 Created if creating a new budget for that category/month/year.
 * - Returns 200 OK if updating an existing budget limit.
 * Both 200 and 201 resolve successfully.
 */
export async function setBudgetApi(data: SetBudgetRequest): Promise<Budget> {
  const response = await apiClient.post<Budget>('/budgets', data);
  return response.data;
}

/**
 * Retrieve budget status for a specific category and period.
 * GET /api/v1/budgets/{category_id}?month={month}&year={year}
 */
export async function getCategoryBudgetStatusApi(
  categoryId: number,
  month: number,
  year: number
): Promise<BudgetSummary> {
  const response = await apiClient.get<BudgetSummary>(`/budgets/${categoryId}`, {
    params: { month, year },
  });
  return response.data;
}

/**
 * Delete / remove a category budget for a specific month and year.
 * DELETE /api/v1/budgets/{category_id}?month={month}&year={year}
 */
export async function deleteBudgetApi(
  categoryId: number,
  month: number,
  year: number
): Promise<void> {
  await apiClient.delete(`/budgets/${categoryId}`, {
    params: { month, year },
  });
}

