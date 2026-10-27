/**
 * Bjet Lite - Category Repository Interface & SQLite Implementation (Phase C3)
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabaseAsync } from '../db/database';
import type { CategoryRow } from '../db/schema';
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '../types/api';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export interface ICategoryRepository {
  getAll(): Promise<Category[]>;
  getById(id: number): Promise<Category | null>;
  create(data: CreateCategoryRequest): Promise<Category>;
  update(id: number, data: UpdateCategoryRequest): Promise<Category>;
  delete(id: number): Promise<void>;
}

export function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    is_system_default: Boolean(row.is_system_default),
    user_id: row.is_system_default ? null : 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SQLiteCategoryRepository implements ICategoryRepository {
  private getDb: () => Promise<SQLiteDatabase>;

  constructor(getDb: () => Promise<SQLiteDatabase> = getDatabaseAsync) {
    this.getDb = getDb;
  }

  async getAll(): Promise<Category[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<CategoryRow>(
      `SELECT * FROM categories ORDER BY is_system_default DESC, name ASC;`
    );
    return rows.map(mapCategoryRow);
  }

  async getById(id: number): Promise<Category | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<CategoryRow>(
      `SELECT * FROM categories WHERE id = ?;`,
      [id]
    );
    return row ? mapCategoryRow(row) : null;
  }

  async create(data: CreateCategoryRequest): Promise<Category> {
    const name = data.name.trim();
    if (!name) {
      throw new ValidationError('Category name is required.');
    }

    const db = await this.getDb();

    // Check case-insensitive uniqueness
    const existing = await db.getFirstAsync<CategoryRow>(
      `SELECT * FROM categories WHERE name = ? COLLATE NOCASE;`,
      [name]
    );
    if (existing) {
      throw new ConflictError(`Category with name "${name}" already exists.`);
    }

    const icon = data.icon?.trim() || null;
    const color = data.color?.trim() || null;

    const result = await db.runAsync(
      `INSERT INTO categories (name, icon, color, is_system_default)
       VALUES (?, ?, ?, 0);`,
      [name, icon, color]
    );

    const created = await this.getById(result.lastInsertRowId);
    if (!created) {
      throw new Error('Failed to retrieve newly created category.');
    }
    return created;
  }

  async update(id: number, data: UpdateCategoryRequest): Promise<Category> {
    const db = await this.getDb();
    const existing = await db.getFirstAsync<CategoryRow>(
      `SELECT * FROM categories WHERE id = ?;`,
      [id]
    );

    if (!existing) {
      throw new NotFoundError(`Category with ID ${id} not found.`);
    }

    if (existing.is_system_default) {
      throw new ValidationError('System default categories cannot be modified.');
    }

    let newName = existing.name;
    if (data.name !== undefined) {
      newName = data.name.trim();
      if (!newName) {
        throw new ValidationError('Category name cannot be empty.');
      }

      // Check unique constraint against other categories
      const conflict = await db.getFirstAsync<CategoryRow>(
        `SELECT * FROM categories WHERE name = ? COLLATE NOCASE AND id != ?;`,
        [newName, id]
      );
      if (conflict) {
        throw new ConflictError(`Category with name "${newName}" already exists.`);
      }
    }

    const newIcon = data.icon !== undefined ? (data.icon ? data.icon.trim() : null) : existing.icon;
    const newColor = data.color !== undefined ? (data.color ? data.color.trim() : null) : existing.color;

    await db.runAsync(
      `UPDATE categories
       SET name = ?, icon = ?, color = ?, updated_at = datetime('now')
       WHERE id = ?;`,
      [newName, newIcon, newColor, id]
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated category ${id}.`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    const db = await this.getDb();
    const existing = await db.getFirstAsync<CategoryRow>(
      `SELECT * FROM categories WHERE id = ?;`,
      [id]
    );

    if (!existing) {
      throw new NotFoundError(`Category with ID ${id} not found.`);
    }

    if (existing.is_system_default) {
      throw new ValidationError('System default categories cannot be deleted.');
    }

    // Reference restriction checks matching backend domain rules
    const txRef = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM transactions WHERE category_id = ?;`,
      [id]
    );
    const presetRef = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM budget_preset_items WHERE category_id = ?;`,
      [id]
    );
    const ruleRef = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM user_merchant_rules WHERE category_id = ?;`,
      [id]
    );
    const friendRef = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM friends WHERE category_id = ?;`,
      [id]
    );

    const reasons: string[] = [];
    if (txRef && txRef.count > 0) reasons.push('existing transactions');
    if (presetRef && presetRef.count > 0) reasons.push('budget presets');
    if (ruleRef && ruleRef.count > 0) reasons.push('merchant rules');
    if (friendRef && friendRef.count > 0) reasons.push('friend reimbursement settings');

    if (reasons.length > 0) {
      throw new ValidationError(
        `Category cannot be deleted because it is currently used by: ${reasons.join(', ')}.`
      );
    }

    await db.withTransactionAsync(async () => {
      // Remove any budgets for this category
      await db.runAsync(`DELETE FROM budgets WHERE category_id = ?;`, [id]);
      await db.runAsync(`DELETE FROM categories WHERE id = ?;`, [id]);
    });
  }
}

export const categoryRepository = new SQLiteCategoryRepository();
