/**
 * Bjet Lite - Budget Repository Interface & SQLite Implementation (Phase C3)
 *
 * Implements authoritative monthly budget tracking and spending breakdown:
 * - Net Personal Spending per category: (SENT - paid_for_others) - RECEIVED reimbursements
 * - Budget utilization percentage and over-budget warnings
 * - Spending breakdown donut chart data with positive-spending filter and Uncategorized grouping
 * - Idempotent upsert and zero-limit deletion behavior
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabaseAsync } from '../db/database';
import type { BudgetRow, CategoryRow } from '../db/schema';
import type {
  Budget,
  BudgetSummary,
  MonthlySpendingBreakdown,
  CategorySpendingItem,
  SetBudgetRequest,
} from '../types/api';
import { mapCategoryRow } from './categoryRepository';
import { NotFoundError, ValidationError } from './errors';

export interface MonthlyFinancialSummary {
  month: number;
  year: number;
  personalSpending: number;
  incomingMoney: number;
  grossOutbound: number;
  netMovement: number;
  totalBudgetLimit: number;
  totalRemainingBudget: number;
  budgetUtilization: number;
  overBudgetCount: number;
  transactionCount: number;
}

export interface IBudgetRepository {
  getBudgetSummary(month: number, year: number): Promise<BudgetSummary[]>;
  getCategoryBudgetStatus(categoryId: number, month: number, year: number): Promise<BudgetSummary | null>;
  setBudget(data: SetBudgetRequest): Promise<Budget>;
  deleteBudget(categoryId: number, month: number, year: number): Promise<void>;
  getSpendingBreakdown(month: number, year: number): Promise<MonthlySpendingBreakdown>;
  getMonthlyFinancialSummary(month: number, year: number): Promise<MonthlyFinancialSummary>;
}

interface BudgetJoinedRow extends BudgetRow {
  c_id: number;
  c_name: string;
  c_icon: string | null;
  c_color: string | null;
  c_is_system_default: number;
  c_created_at: string;
  c_updated_at: string;
}

export class SQLiteBudgetRepository implements IBudgetRepository {
  private getDb: () => Promise<SQLiteDatabase>;

  constructor(getDb: () => Promise<SQLiteDatabase> = getDatabaseAsync) {
    this.getDb = getDb;
  }

  /**
   * Authoritative calculation of net spending for a category in a month/year.
   * Net Spending = (Gross SENT - Paid For Others) - RECEIVED Reimbursements
   */
  private async calculateCategoryNetSpending(
    db: SQLiteDatabase,
    categoryId: number,
    month: number,
    year: number
  ): Promise<number> {
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    const outgoingRow = await db.getFirstAsync<{ outgoing: number }>(
      `SELECT coalesce(sum(amount - coalesce(amount_paid_for_someone_else, 0)), 0) as outgoing
       FROM transactions
       WHERE category_id = ?
         AND strftime('%Y-%m', timestamp) = ?
         AND direction = 'SENT'
         AND status IN ('CONFIRMED', 'MANUAL');`,
      [categoryId, yearMonth]
    );

    const reimbRow = await db.getFirstAsync<{ reimbursements: number }>(
      `SELECT coalesce(sum(amount), 0) as reimbursements
       FROM transactions
       WHERE category_id = ?
         AND strftime('%Y-%m', timestamp) = ?
         AND direction = 'RECEIVED'
         AND is_reimbursement = 1
         AND status IN ('CONFIRMED', 'MANUAL');`,
      [categoryId, yearMonth]
    );

    const outgoing = outgoingRow?.outgoing ?? 0;
    const reimb = reimbRow?.reimbursements ?? 0;
    return outgoing - reimb;
  }

  async getBudgetSummary(month: number, year: number): Promise<BudgetSummary[]> {
    const db = await this.getDb();
    const budgetRows = await db.getAllAsync<BudgetJoinedRow>(
      `SELECT
         b.*,
         c.id as c_id,
         c.name as c_name,
         c.icon as c_icon,
         c.color as c_color,
         c.is_system_default as c_is_system_default,
         c.created_at as c_created_at,
         c.updated_at as c_updated_at
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.month = ? AND b.year = ?
       ORDER BY c.name ASC;`,
      [month, year]
    );

    const summaries: BudgetSummary[] = [];

    for (const row of budgetRows) {
      const spent = await this.calculateCategoryNetSpending(db, row.category_id, month, year);
      const limit = row.amount_limit;
      const remaining = limit - spent;
      const percentage = limit > 0 ? (spent / limit) * 100 : 0;

      summaries.push({
        id: row.id,
        user_id: 1,
        category_id: row.category_id,
        month: row.month,
        year: row.year,
        amount_limit: Number(limit).toFixed(2),
        created_at: row.created_at,
        updated_at: row.updated_at,
        category: mapCategoryRow({
          id: row.c_id,
          name: row.c_name,
          icon: row.c_icon,
          color: row.c_color,
          is_system_default: row.c_is_system_default,
          created_at: row.c_created_at,
          updated_at: row.c_updated_at,
        }),
        spent_amount: Number(spent).toFixed(2),
        remaining_amount: Number(remaining).toFixed(2),
        percentage_used: Math.round(percentage * 100) / 100,
        is_over_budget: spent > limit,
      });
    }

    return summaries;
  }

  async getCategoryBudgetStatus(
    categoryId: number,
    month: number,
    year: number
  ): Promise<BudgetSummary | null> {
    const summaries = await this.getBudgetSummary(month, year);
    return summaries.find(s => s.category_id === categoryId) || null;
  }

  async setBudget(data: SetBudgetRequest): Promise<Budget> {
    const { category_id, month, year, amount_limit } = data;

    if (month < 1 || month > 12) {
      throw new ValidationError('Month must be between 1 and 12.');
    }
    if (year < 2000 || year > 2100) {
      throw new ValidationError('Year must be between 2000 and 2100.');
    }
    if (amount_limit < 0) {
      throw new ValidationError('Amount limit cannot be negative.');
    }

    const db = await this.getDb();

    // Verify category exists
    const category = await db.getFirstAsync<CategoryRow>(
      `SELECT * FROM categories WHERE id = ?;`,
      [category_id]
    );
    if (!category) {
      throw new NotFoundError(`Category with ID ${category_id} not found.`);
    }

    if (amount_limit === 0) {
      // Setting to 0 removes the budget record for that period
      const existing = await db.getFirstAsync<BudgetRow>(
        `SELECT * FROM budgets WHERE category_id = ? AND month = ? AND year = ?;`,
        [category_id, month, year]
      );
      if (existing) {
        await db.runAsync(`DELETE FROM budgets WHERE id = ?;`, [existing.id]);
      }
      return {
        id: existing?.id ?? 0,
        user_id: 1,
        category_id,
        month,
        year,
        amount_limit: '0.00',
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        category: mapCategoryRow(category),
      };
    }

    // Upsert budget limit
    await db.runAsync(
      `INSERT INTO budgets (category_id, month, year, amount_limit)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(category_id, month, year)
       DO UPDATE SET amount_limit = excluded.amount_limit, updated_at = datetime('now');`,
      [category_id, month, year, amount_limit]
    );

    const saved = await db.getFirstAsync<BudgetRow>(
      `SELECT * FROM budgets WHERE category_id = ? AND month = ? AND year = ?;`,
      [category_id, month, year]
    );

    if (!saved) {
      throw new Error('Failed to retrieve saved budget.');
    }

    return {
      id: saved.id,
      user_id: 1,
      category_id: saved.category_id,
      month: saved.month,
      year: saved.year,
      amount_limit: Number(saved.amount_limit).toFixed(2),
      created_at: saved.created_at,
      updated_at: saved.updated_at,
      category: mapCategoryRow(category),
    };
  }

  async deleteBudget(categoryId: number, month: number, year: number): Promise<void> {
    const db = await this.getDb();
    const existing = await db.getFirstAsync<BudgetRow>(
      `SELECT id FROM budgets WHERE category_id = ? AND month = ? AND year = ?;`,
      [categoryId, month, year]
    );
    if (!existing) {
      throw new NotFoundError('Budget not found for this category and period.');
    }
    await db.runAsync(`DELETE FROM budgets WHERE id = ?;`, [existing.id]);
  }

  async getSpendingBreakdown(month: number, year: number): Promise<MonthlySpendingBreakdown> {
    const db = await this.getDb();
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    // 1. Fetch all confirmed/manual transactions in this period
    const transactions = await db.getAllAsync<{
      category_id: number | null;
      amount: number;
      amount_paid_for_someone_else: number | null;
      direction: string;
      is_reimbursement: number;
    }>(
      `SELECT category_id, amount, amount_paid_for_someone_else, direction, is_reimbursement
       FROM transactions
       WHERE strftime('%Y-%m', timestamp) = ?
         AND status IN ('CONFIRMED', 'MANUAL');`,
      [yearMonth]
    );

    const outgoingByCat = new Map<number | null, number>();
    const reimbByCat = new Map<number | null, number>();

    for (const tx of transactions) {
      if (tx.direction === 'RECEIVED' && tx.is_reimbursement) {
        if (tx.category_id !== null) {
          reimbByCat.set(tx.category_id, (reimbByCat.get(tx.category_id) || 0) + tx.amount);
        }
      } else if (tx.direction === 'SENT') {
        const paidForOthers = tx.amount_paid_for_someone_else || 0;
        const netTx = tx.amount - paidForOthers;
        outgoingByCat.set(tx.category_id, (outgoingByCat.get(tx.category_id) || 0) + netTx);
      }
    }

    // 2. Fetch all categories metadata
    const allCategories = await db.getAllAsync<CategoryRow>(`SELECT * FROM categories;`);
    const categoryMap = new Map<number, CategoryRow>();
    for (const c of allCategories) {
      categoryMap.set(c.id, c);
    }

    // 3. Compute net spending per category
    let uncatSpending = 0;
    const items: CategorySpendingItem[] = [];

    const allCategoryKeys = new Set([...outgoingByCat.keys(), ...reimbByCat.keys()]);

    for (const cid of allCategoryKeys) {
      const outgoing = outgoingByCat.get(cid) || 0;
      const reimb = reimbByCat.get(cid) || 0;
      const netSpent = outgoing - reimb;

      if (netSpent <= 0) continue; // Pie charts skip non-positive categories

      if (cid === null) {
        uncatSpending += netSpent;
      } else {
        const cat = categoryMap.get(cid);
        if (cat && cat.name.trim().toLowerCase() === 'uncategorized') {
          uncatSpending += netSpent;
        } else {
          items.push({
            category_id: cid,
            category_name: cat ? cat.name : `Category ${cid}`,
            category_color: cat?.color || '#3B82F6',
            category_icon: cat?.icon || 'help-circle',
            spent_amount: Math.round(netSpent * 100) / 100,
            percentage: 0,
          });
        }
      }
    }

    if (uncatSpending > 0) {
      items.push({
        category_id: null,
        category_name: 'Uncategorized',
        category_color: '#9E9E9E',
        category_icon: 'help-circle',
        spent_amount: Math.round(uncatSpending * 100) / 100,
        percentage: 0,
      });
    }

    // 4. Sort descending by spent_amount
    items.sort((a, b) => Number(b.spent_amount) - Number(a.spent_amount));

    // 5. Compute total and percentages
    const totalSpent = items.reduce((sum, item) => sum + Number(item.spent_amount), 0);
    const roundedTotal = Math.round(totalSpent * 100) / 100;

    if (roundedTotal > 0) {
      for (const item of items) {
        item.percentage = Math.round((Number(item.spent_amount) / roundedTotal) * 1000) / 10;
      }
    }

    return {
      month,
      year,
      total_spent: roundedTotal,
      items,
    };
  }

  async getMonthlyFinancialSummary(month: number, year: number): Promise<MonthlyFinancialSummary> {
    const db = await this.getDb();
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    const outboundRow = await db.getFirstAsync<{ outgoing: number; txCount: number }>(
      `SELECT
         coalesce(sum(amount - coalesce(amount_paid_for_someone_else, 0)), 0) as outgoing,
         count(*) as txCount
       FROM transactions
       WHERE strftime('%Y-%m', timestamp) = ?
         AND direction = 'SENT'
         AND status IN ('CONFIRMED', 'MANUAL');`,
      [yearMonth]
    );

    const reimbRow = await db.getFirstAsync<{ reimbursements: number; txCount: number }>(
      `SELECT
         coalesce(sum(amount), 0) as reimbursements,
         count(*) as txCount
       FROM transactions
       WHERE strftime('%Y-%m', timestamp) = ?
         AND direction = 'RECEIVED'
         AND is_reimbursement = 1
         AND status IN ('CONFIRMED', 'MANUAL');`,
      [yearMonth]
    );

    const grossOutbound = outboundRow?.outgoing ?? 0;
    const incomingMoney = reimbRow?.reimbursements ?? 0;
    const personalSpending = Math.max(0, grossOutbound - incomingMoney);
    const netMovement = incomingMoney - grossOutbound;
    const totalTxCount = (outboundRow?.txCount ?? 0) + (reimbRow?.txCount ?? 0);

    const summaries = await this.getBudgetSummary(month, year);
    const totalBudgetLimit = summaries.reduce(
      (acc, b) => acc + (parseFloat(b.amount_limit) || 0),
      0
    );
    const totalRemainingBudget = Math.max(0, totalBudgetLimit - personalSpending);
    const budgetUtilization =
      totalBudgetLimit > 0 ? (personalSpending / totalBudgetLimit) * 100 : 0;
    const overBudgetCount = summaries.filter((b) => b.is_over_budget).length;

    return {
      month,
      year,
      personalSpending: Math.round(personalSpending * 100) / 100,
      incomingMoney: Math.round(incomingMoney * 100) / 100,
      grossOutbound: Math.round(grossOutbound * 100) / 100,
      netMovement: Math.round(netMovement * 100) / 100,
      totalBudgetLimit: Math.round(totalBudgetLimit * 100) / 100,
      totalRemainingBudget: Math.round(totalRemainingBudget * 100) / 100,
      budgetUtilization: Math.round(budgetUtilization * 10) / 10,
      overBudgetCount,
      transactionCount: totalTxCount,
    };
  }
}

export const budgetRepository = new SQLiteBudgetRepository();
