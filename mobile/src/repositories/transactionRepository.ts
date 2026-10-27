/**
 * Bjet Lite - Transaction Repository Interface & SQLite Implementation (Phase C3)
 *
 * Implements authoritative ledger operations with strict financial semantics:
 * - SENT personal spending vs RECEIVED reimbursements vs TOP_UP wallet transfers
 * - Split expenses with amount_paid_for_someone_else
 * - Friend association and auto-reimbursement resolution
 * - Merchant rule auto-categorization fallback
 * - Deletion reimbursement invariant validation (with atomic rollback on bulk delete)
 * - Preflight statement import deduplication via UPI reference IDs
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabaseAsync } from '../db/database';
import type { TransactionRow } from '../db/schema';
import type {
  Transaction,
  TransactionStatus,
  TransactionDirection,
  CreateManualTransactionRequest,
  UpdateTransactionRequest,
  ReceiptConfirmRequest,
  Category,
  Friend,
} from '../types/api';
import { mapCategoryRow } from './categoryRepository';
import { SQLiteFriendRepository } from './friendRepository';
import { SQLiteMerchantRuleRepository, normalizeMerchantPattern } from './merchantRuleRepository';
import { NotFoundError, ValidationError } from './errors';

export interface GetTransactionsParams {
  limit?: number;
  skip?: number;
  status?: TransactionStatus;
  category_id?: number;
  direction?: TransactionDirection;
  month?: number;
  year?: number;
  start_date?: string;
  end_date?: string;
}

export interface ITransactionRepository {
  getTransactions(params?: GetTransactionsParams): Promise<Transaction[]>;
  getTransactionById(id: number): Promise<Transaction | null>;
  createTransaction(data: CreateManualTransactionRequest): Promise<Transaction>;
  updateTransaction(id: number, data: UpdateTransactionRequest): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;
  bulkDeleteTransactions(ids: number[]): Promise<{ deleted_count: number; transaction_ids: number[] }>;
  bulkUpdateTransactions(ids: number[], updates: Partial<UpdateTransactionRequest>): Promise<{ updated_count: number; transaction_ids: number[] }>;
  deleteTransactions(ids: number[]): Promise<{ deleted_count: number; transaction_ids: number[] }>;
  confirmTransaction(id: number, data: ReceiptConfirmRequest): Promise<Transaction>;
  findExistingUpiRefs(upiRefs: string[]): Promise<Set<string>>;
  getUncategorizedMerchants(): Promise<{ merchant_name: string; count: number }[]>;
  categorizeMerchantTransactions(
    merchantPattern: string,
    categoryId: number,
    saveRule?: boolean
  ): Promise<{ updatedCount: number; ruleCreatedOrUpdated: boolean }>;
}

interface TransactionJoinedRow extends TransactionRow {
  c_id: number | null;
  c_name: string | null;
  c_icon: string | null;
  c_color: string | null;
  c_is_system_default: number | null;
  c_created_at: string | null;
  c_updated_at: string | null;
  f_id: number | null;
  f_name: string | null;
  f_recognized_name: string | null;
  f_category_id: number | null;
  f_created_at: string | null;
  f_updated_at: string | null;
}

function mapTransactionJoinedRow(row: TransactionJoinedRow): Transaction {
  const category: Category | null = row.c_id
    ? mapCategoryRow({
        id: row.c_id,
        name: row.c_name!,
        icon: row.c_icon,
        color: row.c_color,
        is_system_default: row.c_is_system_default ?? 0,
        created_at: row.c_created_at!,
        updated_at: row.c_updated_at!,
      })
    : null;

  const friend: Friend | null = row.f_id
    ? {
        id: row.f_id,
        user_id: 1,
        name: row.f_name!,
        recognized_name: row.f_recognized_name!,
        category_id: row.f_category_id!,
        created_at: row.f_created_at!,
        updated_at: row.f_updated_at!,
        category: null,
      }
    : null;

  return {
    id: row.id,
    user_id: 1,
    amount: Number(row.amount).toFixed(2),
    currency: row.currency || 'INR',
    timestamp: row.timestamp,
    merchant_id: null,
    merchant_raw_name: row.merchant_raw_name,
    category_id: row.category_id,
    upi_reference_id: row.upi_reference_id,
    upi_vpa: row.upi_vpa,
    payment_app: row.payment_app,
    direction: row.direction,
    is_reimbursement: Boolean(row.is_reimbursement),
    friend_id: row.friend_id,
    amount_paid_for_someone_else:
      row.amount_paid_for_someone_else != null
        ? Number(row.amount_paid_for_someone_else).toFixed(2)
        : null,
    status: row.status,
    notes: row.notes,
    has_receipt: Boolean(row.receipt_image_path),
    created_at: row.created_at,
    updated_at: row.updated_at,
    category,
    merchant: null,
    friend,
  };
}

export class SQLiteTransactionRepository implements ITransactionRepository {
  private getDb: () => Promise<SQLiteDatabase>;

  constructor(getDb: () => Promise<SQLiteDatabase> = getDatabaseAsync) {
    this.getDb = getDb;
  }

  private getBaseSelectQuery(): string {
    return `
      SELECT
        t.*,
        c.id as c_id,
        c.name as c_name,
        c.icon as c_icon,
        c.color as c_color,
        c.is_system_default as c_is_system_default,
        c.created_at as c_created_at,
        c.updated_at as c_updated_at,
        f.id as f_id,
        f.name as f_name,
        f.recognized_name as f_recognized_name,
        f.category_id as f_category_id,
        f.created_at as f_created_at,
        f.updated_at as f_updated_at
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN friends f ON t.friend_id = f.id
    `;
  }

  async getTransactions(params?: GetTransactionsParams): Promise<Transaction[]> {
    const db = await this.getDb();
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params?.status) {
      conditions.push(`t.status = ?`);
      values.push(params.status);
    }

    if (params?.category_id !== undefined) {
      conditions.push(`t.category_id = ?`);
      values.push(params.category_id);
    }

    if (params?.direction) {
      conditions.push(`t.direction = ?`);
      values.push(params.direction);
    }

    if (params?.year !== undefined && params?.month !== undefined) {
      const monthStr = String(params.month).padStart(2, '0');
      conditions.push(`strftime('%Y-%m', t.timestamp) = ?`);
      values.push(`${params.year}-${monthStr}`);
    } else if (params?.year !== undefined) {
      conditions.push(`strftime('%Y', t.timestamp) = ?`);
      values.push(String(params.year));
    } else if (params?.month !== undefined) {
      const monthStr = String(params.month).padStart(2, '0');
      conditions.push(`strftime('%m', t.timestamp) = ?`);
      values.push(monthStr);
    }

    if (params?.start_date) {
      conditions.push(`t.timestamp >= ?`);
      values.push(params.start_date);
    }

    if (params?.end_date) {
      conditions.push(`t.timestamp <= ?`);
      values.push(params.end_date);
    }

    let sql = this.getBaseSelectQuery();
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY t.timestamp DESC, t.id DESC`;

    if (params?.limit !== undefined) {
      sql += ` LIMIT ?`;
      values.push(params.limit);
      if (params.skip !== undefined) {
        sql += ` OFFSET ?`;
        values.push(params.skip);
      }
    }

    const rows = await db.getAllAsync<TransactionJoinedRow>(sql, values);
    return rows.map(mapTransactionJoinedRow);
  }

  async getTransactionById(id: number): Promise<Transaction | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<TransactionJoinedRow>(
      `${this.getBaseSelectQuery()} WHERE t.id = ?;`,
      [id]
    );
    return row ? mapTransactionJoinedRow(row) : null;
  }

  /**
   * Applies merchant default rule and safely updates existing uncategorized transactions.
   */
  private async applyMerchantDefaultRule(
    db: SQLiteDatabase,
    merchantRawName: string | null | undefined,
    categoryId: number | null | undefined,
    excludeTxId?: number
  ): Promise<void> {
    if (!categoryId) {
      throw new ValidationError('Cannot set default category without selecting a category.');
    }

    const cat = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM categories WHERE id = ?;`,
      [categoryId]
    );
    if (!cat) {
      throw new NotFoundError(`Category with ID ${categoryId} not found.`);
    }
    if (cat.name.toLowerCase() === 'uncategorized') {
      throw new ValidationError("Cannot set 'Uncategorized' as a merchant default category.");
    }

    const rawMerchant = (merchantRawName || '').trim();
    if (!rawMerchant) {
      throw new ValidationError('Cannot set merchant default for a transaction without a merchant name.');
    }

    const cleanPattern = normalizeMerchantPattern(rawMerchant);
    if (!cleanPattern) {
      throw new ValidationError('Merchant pattern cannot be blank.');
    }

    const ruleRepo = new SQLiteMerchantRuleRepository(this.getDb);
    await ruleRepo.upsertRule(cleanPattern, categoryId, 1);

    // Safe backfill: Only update other transactions that are UNCATEGORIZED
    // Never overwrite a category the user deliberately selected manually
    const uncategorizedCategory = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM categories WHERE name = 'Uncategorized' COLLATE NOCASE;`
    );
    const uncatId = uncategorizedCategory?.id;

    const uncatCondition = uncatId !== undefined
      ? `(category_id IS NULL OR category_id = ${uncatId})`
      : `category_id IS NULL`;

    if (excludeTxId) {
      await db.runAsync(
        `UPDATE transactions
         SET category_id = ?, updated_at = datetime('now')
         WHERE id != ?
           AND merchant_raw_name = ? COLLATE NOCASE
           AND ${uncatCondition};`,
        [categoryId, excludeTxId, rawMerchant]
      );
    } else {
      await db.runAsync(
        `UPDATE transactions
         SET category_id = ?, updated_at = datetime('now')
         WHERE merchant_raw_name = ? COLLATE NOCASE
           AND ${uncatCondition};`,
        [categoryId, rawMerchant]
      );
    }
  }

  async createTransaction(data: CreateManualTransactionRequest): Promise<Transaction> {
    if (!data.amount || data.amount <= 0) {
      throw new ValidationError('Transaction amount must be greater than 0.');
    }

    if (data.amount_paid_for_someone_else !== undefined && data.amount_paid_for_someone_else !== null) {
      if (data.amount_paid_for_someone_else < 0) {
        throw new ValidationError('Amount paid for someone else cannot be negative.');
      }
      if (data.amount_paid_for_someone_else > data.amount) {
        throw new ValidationError('Amount paid for someone else cannot exceed transaction amount.');
      }
    }

    const direction: TransactionDirection = data.direction || 'SENT';
    let isReimbursement = Boolean(data.is_reimbursement);
    let categoryId = data.category_id ?? null;
    let friendId = data.friend_id ?? null;

    // Automatic friend matching vs reimbursement resolution
    if (direction === 'RECEIVED') {
      if (data.is_reimbursement === undefined || data.is_reimbursement === null) {
        const senderText = [data.merchant_raw_name || '', data.notes || ''].join(' ');
        const friendRepo = new SQLiteFriendRepository(this.getDb);
        const matchedFriend = await friendRepo.findMatchingFriend(senderText);
        if (matchedFriend) {
          isReimbursement = true;
          if (!categoryId) {
            categoryId = matchedFriend.category_id;
          }
          friendId = matchedFriend.id;
        } else {
          isReimbursement = false;
          friendId = null;
        }
      } else if (isReimbursement && !categoryId && friendId) {
        const friendRepo = new SQLiteFriendRepository(this.getDb);
        const friend = await friendRepo.getById(friendId);
        if (friend) {
          categoryId = friend.category_id;
        }
      }
    } else if (direction === 'SENT') {
      isReimbursement = false;
      friendId = null;
      let isUncategorized = false;
      if (categoryId) {
        const db = await this.getDb();
        const cat = await db.getFirstAsync<{ name: string }>(
          `SELECT name FROM categories WHERE id = ?;`,
          [categoryId]
        );
        if (cat?.name === 'Uncategorized') {
          isUncategorized = true;
        }
      }

      // Merchant rule auto-categorization fallback
      if ((!categoryId || isUncategorized) && data.merchant_raw_name) {
        const ruleRepo = new SQLiteMerchantRuleRepository(this.getDb);
        const matchedRule = await ruleRepo.matchRule(
          data.merchant_raw_name,
          data.upi_vpa
        );
        if (matchedRule) {
          categoryId = matchedRule.category_id;
        }
      }
    } else if (direction === 'TOP_UP') {
      isReimbursement = false;
      friendId = null;
      categoryId = null; // UPI Lite top-ups have ₹0 personal spending and no category
    }

    const db = await this.getDb();
    const timestamp = data.timestamp || new Date().toISOString();
    const currency = data.currency || 'INR';
    const status: TransactionStatus = 'CONFIRMED';
    const amountPaidForOthers = data.amount_paid_for_someone_else ?? 0;

    const result = await db.runAsync(
      `INSERT INTO transactions (
         amount, currency, timestamp, merchant_raw_name, category_id,
         upi_reference_id, upi_vpa, payment_app, direction, is_reimbursement,
         friend_id, amount_paid_for_someone_else, status, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        data.amount,
        currency,
        timestamp,
        data.merchant_raw_name || null,
        categoryId,
        data.upi_reference_id || null,
        data.upi_vpa || null,
        data.payment_app || 'Google Pay',
        direction,
        isReimbursement ? 1 : 0,
        friendId,
        amountPaidForOthers,
        status,
        data.notes || null,
      ]
    );

    const created = await this.getTransactionById(result.lastInsertRowId);
    if (!created) {
      throw new Error('Failed to retrieve newly created transaction.');
    }

    if (data.set_as_merchant_default) {
      await this.applyMerchantDefaultRule(
        db,
        created.merchant_raw_name,
        created.category_id,
        created.id
      );
    }

    return created;
  }

  async updateTransaction(id: number, data: UpdateTransactionRequest): Promise<Transaction> {
    const existing = await this.getTransactionById(id);
    if (!existing) {
      throw new NotFoundError(`Transaction with ID ${id} not found.`);
    }

    const currentAmount = parseFloat(existing.amount);
    const newAmount = data.amount !== undefined ? data.amount : currentAmount;
    if (newAmount <= 0) {
      throw new ValidationError('Transaction amount must be greater than 0.');
    }

    let newPaidForOthers =
      data.amount_paid_for_someone_else !== undefined
        ? data.amount_paid_for_someone_else
        : existing.amount_paid_for_someone_else
        ? parseFloat(existing.amount_paid_for_someone_else)
        : 0;

    if (newPaidForOthers != null) {
      if (newPaidForOthers < 0) {
        throw new ValidationError('Amount paid for someone else cannot be negative.');
      }
      if (newPaidForOthers > newAmount) {
        throw new ValidationError('Amount paid for someone else cannot exceed transaction amount.');
      }
    }

    const newDirection = data.direction || existing.direction;
    const newIsReimb =
      data.is_reimbursement !== undefined ? Boolean(data.is_reimbursement) : existing.is_reimbursement;
    const newCategoryId = data.category_id !== undefined ? data.category_id : existing.category_id;
    const newFriendId = data.friend_id !== undefined ? data.friend_id : existing.friend_id;
    const newTimestamp = data.timestamp || existing.timestamp;
    const newMerchant =
      data.merchant_raw_name !== undefined ? data.merchant_raw_name : existing.merchant_raw_name;
    const newNotes = data.notes !== undefined ? data.notes : existing.notes;
    const newCurrency = data.currency || existing.currency;

    const db = await this.getDb();
    await db.runAsync(
      `UPDATE transactions
       SET amount = ?, currency = ?, timestamp = ?, merchant_raw_name = ?,
           category_id = ?, direction = ?, is_reimbursement = ?, friend_id = ?,
           amount_paid_for_someone_else = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?;`,
      [
        newAmount,
        newCurrency,
        newTimestamp,
        newMerchant,
        newCategoryId,
        newDirection,
        newIsReimb ? 1 : 0,
        newFriendId,
        newPaidForOthers,
        newNotes,
        id,
      ]
    );

    const updated = await this.getTransactionById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated transaction ${id}.`);
    }

    if (data.set_as_merchant_default) {
      await this.applyMerchantDefaultRule(
        db,
        updated.merchant_raw_name,
        updated.category_id,
        id
      );
    }

    return updated;
  }

  /**
   * Validates the reimbursement invariant before deleting transactions:
   * Remaining Outgoing in the affected category/month/year must not be less than Received Reimbursements.
   */
  private async validateReimbursementInvariant(
    db: SQLiteDatabase,
    transactionIdsToDelete: number[]
  ): Promise<void> {
    if (transactionIdsToDelete.length === 0) return;

    // Find affected categories and periods for the SENT transactions being deleted
    const placeholders = transactionIdsToDelete.map(() => '?').join(',');
    const affected = await db.getAllAsync<{ category_id: number; year_month: string }>(
      `SELECT DISTINCT category_id, strftime('%Y-%m', timestamp) as year_month
       FROM transactions
       WHERE id IN (${placeholders}) AND direction = 'SENT' AND category_id IS NOT NULL;`,
      transactionIdsToDelete
    );

    for (const item of affected) {
      // Calculate remaining outgoing spending in that category & month excluding the deleted IDs
      const outgoingRow = await db.getFirstAsync<{ outgoing: number }>(
        `SELECT coalesce(sum(amount - coalesce(amount_paid_for_someone_else, 0)), 0) as outgoing
         FROM transactions
         WHERE category_id = ?
           AND strftime('%Y-%m', timestamp) = ?
           AND direction = 'SENT'
           AND status IN ('CONFIRMED', 'MANUAL')
           AND id NOT IN (${placeholders});`,
        [item.category_id, item.year_month, ...transactionIdsToDelete]
      );

      // Calculate total reimbursements in that category & month
      const reimbRow = await db.getFirstAsync<{ reimbursements: number }>(
        `SELECT coalesce(sum(amount), 0) as reimbursements
         FROM transactions
         WHERE category_id = ?
           AND strftime('%Y-%m', timestamp) = ?
           AND direction = 'RECEIVED'
           AND is_reimbursement = 1
           AND status IN ('CONFIRMED', 'MANUAL')
           AND id NOT IN (${placeholders});`,
        [item.category_id, item.year_month, ...transactionIdsToDelete]
      );

      const remainingOutgoing = outgoingRow?.outgoing ?? 0;
      const totalReimb = reimbRow?.reimbursements ?? 0;

      if (remainingOutgoing < totalReimb) {
        throw new ValidationError(
          `Cannot delete transaction(s): category reimbursements (₹${totalReimb.toFixed(
            2
          )}) exceed remaining personal spending (₹${remainingOutgoing.toFixed(2)}) for ${item.year_month}.`
        );
      }
    }
  }

  async deleteTransaction(id: number): Promise<void> {
    const existing = await this.getTransactionById(id);
    if (!existing) {
      throw new NotFoundError(`Transaction with ID ${id} not found.`);
    }

    const db = await this.getDb();
    await db.withTransactionAsync(async () => {
      await this.validateReimbursementInvariant(db, [id]);
      await db.runAsync(`DELETE FROM transactions WHERE id = ?;`, [id]);
    });
  }

  async bulkDeleteTransactions(
    ids: number[]
  ): Promise<{ deleted_count: number; transaction_ids: number[] }> {
    if (ids.length === 0) {
      return { deleted_count: 0, transaction_ids: [] };
    }

    const db = await this.getDb();
    const placeholders = ids.map(() => '?').join(',');

    // Verify all IDs exist
    const foundRows = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM transactions WHERE id IN (${placeholders});`,
      ids
    );
    const foundIds = new Set(foundRows.map(r => r.id));
    const missing = ids.filter(id => !foundIds.has(id));

    if (missing.length > 0) {
      throw new NotFoundError(`Transaction(s) [${missing.join(', ')}] not found.`);
    }

    // Execute within an atomic transaction with invariant validation
    await db.withTransactionAsync(async () => {
      await this.validateReimbursementInvariant(db, ids);
      await db.runAsync(`DELETE FROM transactions WHERE id IN (${placeholders});`, ids);
    });

    return {
      deleted_count: ids.length,
      transaction_ids: ids,
    };
  }

  async deleteTransactions(ids: number[]): Promise<{ deleted_count: number; transaction_ids: number[] }> {
    return this.bulkDeleteTransactions(ids);
  }

  async confirmTransaction(id: number, data: ReceiptConfirmRequest): Promise<Transaction> {
    const existing = await this.getTransactionById(id);
    if (!existing) {
      throw new NotFoundError(`Transaction with ID ${id} not found.`);
    }

    const db = await this.getDb();
    await db.runAsync(
      `UPDATE transactions
       SET amount = ?, category_id = ?, timestamp = ?, merchant_raw_name = ?,
           notes = ?, is_reimbursement = ?, status = 'CONFIRMED', updated_at = datetime('now')
       WHERE id = ?;`,
      [
        data.amount,
        data.category_id,
        data.timestamp,
        data.merchant_name || existing.merchant_raw_name,
        data.notes || existing.notes,
        data.is_reimbursement ? 1 : 0,
        id,
      ]
    );

    const updated = await this.getTransactionById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve confirmed transaction ${id}.`);
    }
    return updated;
  }

  async findExistingUpiRefs(upiRefs: string[]): Promise<Set<string>> {
    const cleanRefs = upiRefs.map(r => r.trim()).filter(Boolean);
    if (cleanRefs.length === 0) return new Set();

    const db = await this.getDb();
    const placeholders = cleanRefs.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ upi_reference_id: string }>(
      `SELECT upi_reference_id FROM transactions WHERE upi_reference_id IN (${placeholders});`,
      cleanRefs
    );

    return new Set(rows.map(r => r.upi_reference_id));
  }
  async bulkUpdateTransactions(ids: number[], updates: Partial<UpdateTransactionRequest>): Promise<{ updated_count: number; transaction_ids: number[] }> {
    if (ids.length === 0) return { updated_count: 0, transaction_ids: [] };
    
    const db = await this.getDb();
    
    // Currently only supporting bulk category updates for simplicity, can be expanded
    if (updates.category_id !== undefined) {
      const placeholders = ids.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE transactions SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders});`,
        [updates.category_id, ...ids]
      );
    }
    
    return { updated_count: ids.length, transaction_ids: ids };
  }

  /**
   * Retrieves merchants with uncategorized transactions and their respective counts.
   */
  async getUncategorizedMerchants(): Promise<{ merchant_name: string; count: number }[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{ merchant_name: string; count: number }>(
      `SELECT trim(t.merchant_raw_name) as merchant_name, count(*) as count
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.merchant_raw_name IS NOT NULL
         AND trim(t.merchant_raw_name) != ''
         AND (t.category_id IS NULL OR lower(c.name) = 'uncategorized')
       GROUP BY lower(trim(t.merchant_raw_name))
       ORDER BY count DESC;`
    );
    return rows;
  }

  /**
   * Authoritatively categorizes existing uncategorized transactions for a merchant pattern,
   * without touching transactions that already have an assigned category.
   * Optionally creates or updates the persistent user merchant rule.
   */
  async categorizeMerchantTransactions(
    merchantPattern: string,
    categoryId: number,
    saveRule: boolean = true
  ): Promise<{ updatedCount: number; ruleCreatedOrUpdated: boolean }> {
    const cleanPattern = merchantPattern.trim();
    if (!cleanPattern) {
      throw new ValidationError('Merchant pattern is required.');
    }
    const db = await this.getDb();

    // Verify category exists
    const category = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM categories WHERE id = ?;`,
      [categoryId]
    );
    if (!category) {
      throw new NotFoundError(`Category with ID ${categoryId} not found.`);
    }

    // Update ONLY uncategorized transactions matching this merchant name
    const updateResult = await db.runAsync(
      `UPDATE transactions
       SET category_id = ?, updated_at = datetime('now')
       WHERE (category_id IS NULL OR category_id IN (SELECT id FROM categories WHERE lower(name) = 'uncategorized'))
         AND (
           lower(trim(merchant_raw_name)) = lower(?)
           OR instr(lower(merchant_raw_name), lower(?)) > 0
         );`,
      [categoryId, cleanPattern, cleanPattern]
    );

    let ruleCreatedOrUpdated = false;
    if (saveRule) {
      const ruleRepo = new SQLiteMerchantRuleRepository(this.getDb);
      const existing = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM user_merchant_rules WHERE merchant_pattern = ? COLLATE NOCASE;`,
        [cleanPattern]
      );
      if (existing) {
        await ruleRepo.update(existing.id, { category_id: categoryId });
      } else {
        await ruleRepo.create({
          merchant_pattern: cleanPattern,
          category_id: categoryId,
          priority: 1,
        });
      }
      ruleCreatedOrUpdated = true;
    }

    return {
      updatedCount: updateResult.changes,
      ruleCreatedOrUpdated,
    };
  }
}

export const transactionRepository = new SQLiteTransactionRepository();
