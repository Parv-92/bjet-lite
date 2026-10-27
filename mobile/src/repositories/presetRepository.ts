/**
 * Bjet Lite - Budget Preset Repository Interface & SQLite Implementation (Phase C3)
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabaseAsync } from '../db/database';
import type { BudgetPresetRow, BudgetPresetItemRow } from '../db/schema';
import type {
  BudgetPreset,
  BudgetPresetItem,
  BudgetSummary,
  CreateBudgetPresetRequest,
  UpdateBudgetPresetRequest,
  ApplyBudgetPresetRequest,
} from '../types/api';
import { SQLiteBudgetRepository } from './budgetRepository';
import { mapCategoryRow } from './categoryRepository';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export interface IBudgetPresetRepository {
  getAll(): Promise<BudgetPreset[]>;
  getById(id: number): Promise<BudgetPreset | null>;
  create(data: CreateBudgetPresetRequest): Promise<BudgetPreset>;
  update(id: number, data: UpdateBudgetPresetRequest): Promise<BudgetPreset>;
  delete(id: number): Promise<void>;
  applyPreset(presetId: number, data: ApplyBudgetPresetRequest): Promise<BudgetSummary[]>;
}

interface PresetItemJoinedRow extends BudgetPresetItemRow {
  c_id: number;
  c_name: string;
  c_icon: string | null;
  c_color: string | null;
  c_is_system_default: number;
  c_created_at: string;
  c_updated_at: string;
}

export class SQLiteBudgetPresetRepository implements IBudgetPresetRepository {
  private getDb: () => Promise<SQLiteDatabase>;

  constructor(getDb: () => Promise<SQLiteDatabase> = getDatabaseAsync) {
    this.getDb = getDb;
  }

  async getAll(): Promise<BudgetPreset[]> {
    const db = await this.getDb();
    const presets = await db.getAllAsync<BudgetPresetRow>(
      `SELECT * FROM budget_presets ORDER BY name ASC;`
    );

    const result: BudgetPreset[] = [];
    for (const p of presets) {
      const fullPreset = await this.getById(p.id);
      if (fullPreset) {
        result.push(fullPreset);
      }
    }
    return result;
  }

  async getById(id: number): Promise<BudgetPreset | null> {
    const db = await this.getDb();
    const preset = await db.getFirstAsync<BudgetPresetRow>(
      `SELECT * FROM budget_presets WHERE id = ?;`,
      [id]
    );
    if (!preset) return null;

    const itemRows = await db.getAllAsync<PresetItemJoinedRow>(
      `SELECT
         i.*,
         c.id as c_id,
         c.name as c_name,
         c.icon as c_icon,
         c.color as c_color,
         c.is_system_default as c_is_system_default,
         c.created_at as c_created_at,
         c.updated_at as c_updated_at
       FROM budget_preset_items i
       JOIN categories c ON i.category_id = c.id
       WHERE i.preset_id = ?
       ORDER BY c.name ASC;`,
      [id]
    );

    const items: BudgetPresetItem[] = itemRows.map(row => ({
      id: row.id,
      preset_id: row.preset_id,
      category_id: row.category_id,
      amount: Number(row.amount).toFixed(2),
      category: mapCategoryRow({
        id: row.c_id,
        name: row.c_name,
        icon: row.c_icon,
        color: row.c_color,
        is_system_default: row.c_is_system_default,
        created_at: row.c_created_at,
        updated_at: row.c_updated_at,
      }),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return {
      id: preset.id,
      user_id: 1,
      name: preset.name,
      items,
      created_at: preset.created_at,
      updated_at: preset.updated_at,
    };
  }

  async create(data: CreateBudgetPresetRequest): Promise<BudgetPreset> {
    const name = data.name.trim();
    if (!name) throw new ValidationError('Preset name is required.');
    if (!data.items || data.items.length === 0) {
      throw new ValidationError('A budget preset must have at least one category item.');
    }

    const db = await this.getDb();

    // Check name uniqueness case-insensitively
    const existing = await db.getFirstAsync<BudgetPresetRow>(
      `SELECT id FROM budget_presets WHERE name = ? COLLATE NOCASE;`,
      [name]
    );
    if (existing) {
      throw new ConflictError(`Budget preset "${name}" already exists.`);
    }

    let presetId = 0;
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        `INSERT INTO budget_presets (name) VALUES (?);`,
        [name]
      );
      presetId = result.lastInsertRowId;

      for (const item of data.items) {
        if (item.amount < 0) {
          throw new ValidationError('Preset item amount cannot be negative.');
        }
        await db.runAsync(
          `INSERT INTO budget_preset_items (preset_id, category_id, amount)
           VALUES (?, ?, ?);`,
          [presetId, item.category_id, item.amount]
        );
      }
    });

    const created = await this.getById(presetId);
    if (!created) {
      throw new Error('Failed to retrieve newly created budget preset.');
    }
    return created;
  }

  async update(id: number, data: UpdateBudgetPresetRequest): Promise<BudgetPreset> {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(`Budget preset with ID ${id} not found.`);
    }

    const newName = data.name !== undefined ? data.name.trim() : existing.name;
    if (!newName) throw new ValidationError('Preset name cannot be blank.');

    if (data.name !== undefined) {
      const conflict = await db.getFirstAsync<BudgetPresetRow>(
        `SELECT id FROM budget_presets WHERE name = ? COLLATE NOCASE AND id != ?;`,
        [newName, id]
      );
      if (conflict) {
        throw new ConflictError(`Budget preset "${newName}" already exists.`);
      }
    }

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE budget_presets SET name = ?, updated_at = datetime('now') WHERE id = ?;`,
        [newName, id]
      );

      if (data.items !== undefined) {
        // Replace items
        await db.runAsync(`DELETE FROM budget_preset_items WHERE preset_id = ?;`, [id]);
        for (const item of data.items) {
          if (item.amount < 0) {
            throw new ValidationError('Preset item amount cannot be negative.');
          }
          await db.runAsync(
            `INSERT INTO budget_preset_items (preset_id, category_id, amount)
             VALUES (?, ?, ?);`,
            [id, item.category_id, item.amount]
          );
        }
      }
    });

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated budget preset ${id}.`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(`Budget preset with ID ${id} not found.`);
    }

    await db.runAsync(`DELETE FROM budget_presets WHERE id = ?;`, [id]);
  }

  async applyPreset(presetId: number, data: ApplyBudgetPresetRequest): Promise<BudgetSummary[]> {
    const { month, year } = data;
    if (month < 1 || month > 12) throw new ValidationError('Month must be between 1 and 12.');
    if (year < 2000 || year > 2100) throw new ValidationError('Year must be between 2000 and 2100.');

    const preset = await this.getById(presetId);
    if (!preset) {
      throw new NotFoundError(`Budget preset with ID ${presetId} not found.`);
    }

    const db = await this.getDb();
    const budgetRepo = new SQLiteBudgetRepository(this.getDb);
    await db.withTransactionAsync(async () => {
      for (const item of preset.items) {
        await budgetRepo.setBudget({
          category_id: item.category_id,
          month,
          year,
          amount_limit: parseFloat(item.amount),
        });
      }
    });

    return await budgetRepo.getBudgetSummary(month, year);
  }
}

export const budgetPresetRepository = new SQLiteBudgetPresetRepository();
