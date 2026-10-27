/**
 * Bjet Lite - Friend Repository Interface & SQLite Implementation (Phase C3)
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabaseAsync } from '../db/database';
import type { FriendRow, CategoryRow } from '../db/schema';
import type { Friend, CreateFriendRequest, UpdateFriendRequest } from '../types/api';
import { mapCategoryRow } from './categoryRepository';
import { ConflictError, NotFoundError, ValidationError } from './errors';

export interface IFriendRepository {
  getAll(): Promise<Friend[]>;
  getById(id: number): Promise<Friend | null>;
  create(data: CreateFriendRequest): Promise<Friend>;
  update(id: number, data: UpdateFriendRequest): Promise<Friend>;
  delete(id: number): Promise<void>;
  findMatchingFriend(senderText: string): Promise<Friend | null>;
}

interface FriendWithCategoryRow extends FriendRow {
  c_id: number | null;
  c_name: string | null;
  c_icon: string | null;
  c_color: string | null;
  c_is_system_default: number | null;
  c_created_at: string | null;
  c_updated_at: string | null;
}

function mapFriendWithCategoryRow(row: FriendWithCategoryRow): Friend {
  return {
    id: row.id,
    user_id: 1,
    name: row.name,
    recognized_name: row.recognized_name,
    category_id: row.category_id,
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

export class SQLiteFriendRepository implements IFriendRepository {
  private getDb: () => Promise<SQLiteDatabase>;

  constructor(getDb: () => Promise<SQLiteDatabase> = getDatabaseAsync) {
    this.getDb = getDb;
  }

  private getBaseSelectQuery(): string {
    return `
      SELECT
        f.*,
        c.id as c_id,
        c.name as c_name,
        c.icon as c_icon,
        c.color as c_color,
        c.is_system_default as c_is_system_default,
        c.created_at as c_created_at,
        c.updated_at as c_updated_at
      FROM friends f
      LEFT JOIN categories c ON f.category_id = c.id
    `;
  }

  async getAll(): Promise<Friend[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<FriendWithCategoryRow>(
      `${this.getBaseSelectQuery()} ORDER BY f.name ASC;`
    );
    return rows.map(mapFriendWithCategoryRow);
  }

  async getById(id: number): Promise<Friend | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<FriendWithCategoryRow>(
      `${this.getBaseSelectQuery()} WHERE f.id = ?;`,
      [id]
    );
    return row ? mapFriendWithCategoryRow(row) : null;
  }

  async create(data: CreateFriendRequest): Promise<Friend> {
    const name = data.name.trim();
    const recognizedName = data.recognized_name.trim();

    if (!name) throw new ValidationError('Friend name is required.');
    if (!recognizedName) throw new ValidationError('Recognized name is required.');
    if (!data.category_id) throw new ValidationError('Target reimbursement category is required.');

    const db = await this.getDb();

    // Verify category exists
    const category = await db.getFirstAsync<CategoryRow>(
      `SELECT id FROM categories WHERE id = ?;`,
      [data.category_id]
    );
    if (!category) {
      throw new NotFoundError(`Category with ID ${data.category_id} not found.`);
    }

    // Check unique recognized_name case-insensitively
    const existing = await db.getFirstAsync<FriendRow>(
      `SELECT id FROM friends WHERE recognized_name = ? COLLATE NOCASE;`,
      [recognizedName]
    );
    if (existing) {
      throw new ConflictError(`Friend with recognized name "${recognizedName}" already exists.`);
    }

    const result = await db.runAsync(
      `INSERT INTO friends (name, recognized_name, category_id)
       VALUES (?, ?, ?);`,
      [name, recognizedName, data.category_id]
    );

    const created = await this.getById(result.lastInsertRowId);
    if (!created) {
      throw new Error('Failed to retrieve newly created friend.');
    }
    return created;
  }

  async update(id: number, data: UpdateFriendRequest): Promise<Friend> {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(`Friend with ID ${id} not found.`);
    }

    let newName = existing.name;
    if (data.name !== undefined) {
      newName = data.name.trim();
      if (!newName) throw new ValidationError('Friend name cannot be blank.');
    }

    let newRecognizedName = existing.recognized_name;
    if (data.recognized_name !== undefined) {
      newRecognizedName = data.recognized_name.trim();
      if (!newRecognizedName) throw new ValidationError('Recognized name cannot be blank.');

      const conflict = await db.getFirstAsync<FriendRow>(
        `SELECT id FROM friends WHERE recognized_name = ? COLLATE NOCASE AND id != ?;`,
        [newRecognizedName, id]
      );
      if (conflict) {
        throw new ConflictError(`Friend with recognized name "${newRecognizedName}" already exists.`);
      }
    }

    let newCategoryId = existing.category_id;
    if (data.category_id !== undefined) {
      const category = await db.getFirstAsync<CategoryRow>(
        `SELECT id FROM categories WHERE id = ?;`,
        [data.category_id]
      );
      if (!category) {
        throw new NotFoundError(`Category with ID ${data.category_id} not found.`);
      }
      newCategoryId = data.category_id;
    }

    await db.runAsync(
      `UPDATE friends
       SET name = ?, recognized_name = ?, category_id = ?, updated_at = datetime('now')
       WHERE id = ?;`,
      [newName, newRecognizedName, newCategoryId, id]
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated friend ${id}.`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new NotFoundError(`Friend with ID ${id} not found.`);
    }

    await db.runAsync(`DELETE FROM friends WHERE id = ?;`, [id]);
  }

  async findMatchingFriend(senderText: string): Promise<Friend | null> {
    if (!senderText || !senderText.trim()) return null;
    const cleanSender = senderText.trim().toLowerCase();

    const friends = await this.getAll();
    for (const friend of friends) {
      const pattern = friend.recognized_name.trim().toLowerCase();
      if (cleanSender.includes(pattern)) {
        return friend;
      }
    }
    return null;
  }
}

export const friendRepository = new SQLiteFriendRepository();
