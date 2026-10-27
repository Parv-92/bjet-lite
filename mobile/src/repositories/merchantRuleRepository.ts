/**
 * Bjet Lite - Merchant Rule Repository Interface & SQLite Implementation (Phase C3)
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabaseAsync } from '../db/database';
import type { UserMerchantRuleRow } from '../db/schema';
import type { UserMerchantRule, CreateMerchantRuleRequest } from '../types/rules';
import { mapCategoryRow } from './categoryRepository';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export interface IMerchantRuleRepository {
  getAll(): Promise<UserMerchantRule[]>;
  getById(id: number): Promise<UserMerchantRule | null>;
  create(data: CreateMerchantRuleRequest): Promise<UserMerchantRule>;
  update(id: number, data: Partial<CreateMerchantRuleRequest>): Promise<UserMerchantRule>;
  replaceRule(id: number, data: CreateMerchantRuleRequest): Promise<UserMerchantRule>;
  delete(id: number): Promise<void>;
  matchRule(merchantName: string, upiVpa?: string | null): Promise<UserMerchantRule | null>;
}

interface RuleWithCategoryRow extends UserMerchantRuleRow {
  c_id: number | null;
  c_name: string | null;
  c_icon: string | null;
  c_color: string | null;
  c_is_system_default: number | null;
  c_created_at: string | null;
  c_updated_at: string | null;
}

function mapRuleWithCategoryRow(row: RuleWithCategoryRow): UserMerchantRule {
  return {
    id: row.id,
    user_id: 1,
    merchant_pattern: row.merchant_pattern,
    category_id: row.category_id,
    priority: row.priority,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category: row.c_id
      ? mapCategoryRow({
          id: row.c_id,
          name: row.c_name!,
          icon: row.c_icon,
          color: row.c_color,
          is_system_default: row.c_is_system_default ?? 0,
          created_at: row.c_created_at!,
          updated_at: row.c_updated_at!,
        })
      : null,
  };
}

export class SQLiteMerchantRuleRepository implements IMerchantRuleRepository {
  private getDb: () => Promise<SQLiteDatabase>;

  constructor(getDb: () => Promise<SQLiteDatabase> = getDatabaseAsync) {
    this.getDb = getDb;
  }

  private getBaseSelectQuery(): string {
    return `
      SELECT
        r.*,
        c.id as c_id,
        c.name as c_name,
        c.icon as c_icon,
        c.color as c_color,
        c.is_system_default as c_is_system_default,
        c.created_at as c_created_at,
        c.updated_at as c_updated_at
      FROM user_merchant_rules r
      LEFT JOIN categories c ON r.category_id = c.id
    `;
  }

  async getAll(): Promise<UserMerchantRule[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<RuleWithCategoryRow>(
      `${this.getBaseSelectQuery()} ORDER BY r.priority DESC, r.created_at DESC;`
    );
    return rows.map(mapRuleWithCategoryRow);
  }

  async getById(id: number): Promise<UserMerchantRule | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<RuleWithCategoryRow>(
      `${this.getBaseSelectQuery()} WHERE r.id = ?;`,
      [id]
    );
    return row ? mapRuleWithCategoryRow(row) : null;
  }

  async create(data: CreateMerchantRuleRequest): Promise<UserMerchantRule> {
    const pattern = data.merchant_pattern.trim();
    if (!pattern) throw new ValidationError('Merchant pattern is required.');
    if (!data.category_id) throw new ValidationError('Category ID is required.');

    const db = await this.getDb();

    // Verify category exists
    const category = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM categories WHERE id = ?;`,
      [data.category_id]
    );
    if (!category) {
      throw new NotFoundError(`Category with ID ${data.category_id} not found.`);
    }

    // Check unique pattern case-insensitively
    const existing = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM user_merchant_rules WHERE merchant_pattern = ? COLLATE NOCASE;`,
      [pattern]
    );
    if (existing) {
      throw new ConflictError(`Rule for merchant pattern "${pattern}" already exists.`);
    }

    const priority = data.priority ?? 1;

    const result = await db.runAsync(
      `INSERT INTO user_merchant_rules (merchant_pattern, category_id, priority)
       VALUES (?, ?, ?);`,
      [pattern, data.category_id, priority]
    );

    const created = await this.getById(result.lastInsertRowId);
    if (!created) {
      throw new Error('Failed to retrieve newly created merchant rule.');
    }
    return created;
  }

  async update(id: number, data: Partial<CreateMerchantRuleRequest>): Promise<UserMerchantRule> {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(`Merchant rule with ID ${id} not found.`);
    }

    let newPattern = existing.merchant_pattern;
    if (data.merchant_pattern !== undefined) {
      newPattern = data.merchant_pattern.trim();
      if (!newPattern) throw new ValidationError('Merchant pattern cannot be blank.');

      const conflict = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM user_merchant_rules WHERE merchant_pattern = ? COLLATE NOCASE AND id != ?;`,
        [newPattern, id]
      );
      if (conflict) {
        throw new ConflictError(`Rule for merchant pattern "${newPattern}" already exists.`);
      }
    }

    let newCategoryId = existing.category_id;
    if (data.category_id !== undefined) {
      const category = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM categories WHERE id = ?;`,
        [data.category_id]
      );
      if (!category) {
        throw new NotFoundError(`Category with ID ${data.category_id} not found.`);
      }
      newCategoryId = data.category_id;
    }

    const newPriority = data.priority !== undefined ? data.priority : existing.priority;

    await db.runAsync(
      `UPDATE user_merchant_rules
       SET merchant_pattern = ?, category_id = ?, priority = ?, updated_at = datetime('now')
       WHERE id = ?;`,
      [newPattern, newCategoryId, newPriority, id]
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated rule ${id}.`);
    }
    return updated;
  }

  async replaceRule(id: number, data: CreateMerchantRuleRequest): Promise<UserMerchantRule> {
    // In local SQLite, replaceRule runs atomically inside a transaction
    const db = await this.getDb();
    let replaced: UserMerchantRule | null = null;
    await db.withTransactionAsync(async () => {
      await this.delete(id);
      replaced = await this.create(data);
    });
    if (!replaced) {
      throw new Error('Failed to replace merchant rule.');
    }
    return replaced;
  }

  async delete(id: number): Promise<void> {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(`Merchant rule with ID ${id} not found.`);
    }

    await db.runAsync(`DELETE FROM user_merchant_rules WHERE id = ?;`, [id]);
  }

  async matchRule(merchantName: string, upiVpa?: string | null): Promise<UserMerchantRule | null> {
    const textToMatch = [merchantName || '', upiVpa || ''].join(' ').trim().toLowerCase();
    if (!textToMatch) return null;

    const rules = await this.getAll();
    for (const rule of rules) {
      const pattern = rule.merchant_pattern.trim().toLowerCase();
      if (textToMatch.includes(pattern)) {
        return rule;
      }
    }
    return null;
  }
}

export const merchantRuleRepository = new SQLiteMerchantRuleRepository();
