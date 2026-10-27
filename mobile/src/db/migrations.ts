/**
 * Bjet Lite - Database Migrations (Phase C2)
 *
 * Implements a lightweight, versioned migration runner for SQLite.
 * Uses PRAGMA user_version to track migration state safely without resets.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CREATE_CATEGORIES_TABLE,
  CREATE_FRIENDS_TABLE,
  CREATE_TRANSACTIONS_TABLE,
  CREATE_BUDGETS_TABLE,
  CREATE_USER_MERCHANT_RULES_TABLE,
  CREATE_BUDGET_PRESETS_TABLE,
  CREATE_BUDGET_PRESET_ITEMS_TABLE,
  CREATE_INDEXES,
  DEFAULT_CATEGORIES,
} from './schema';

export interface Migration {
  version: number;
  name: string;
  up: (db: SQLiteDatabase) => Promise<void>;
}

/**
 * Migration 1: Initial schema creation and default categories seeding
 */
const migrationV1: Migration = {
  version: 1,
  name: 'initial_schema_and_default_categories',
  up: async (db: SQLiteDatabase) => {
    // 1. Create all core tables
    await db.execAsync(CREATE_CATEGORIES_TABLE);
    await db.execAsync(CREATE_FRIENDS_TABLE);
    await db.execAsync(CREATE_TRANSACTIONS_TABLE);
    await db.execAsync(CREATE_BUDGETS_TABLE);
    await db.execAsync(CREATE_USER_MERCHANT_RULES_TABLE);
    await db.execAsync(CREATE_BUDGET_PRESETS_TABLE);
    await db.execAsync(CREATE_BUDGET_PRESET_ITEMS_TABLE);

    // 2. Create performance & deduplication indexes
    for (const indexSql of CREATE_INDEXES) {
      await db.execAsync(indexSql);
    }

    // 3. Seed default categories idempotently
    for (const cat of DEFAULT_CATEGORIES) {
      await db.runAsync(
        `INSERT OR IGNORE INTO categories (name, icon, color, is_system_default)
         VALUES (?, ?, ?, 1);`,
        [cat.name, cat.icon, cat.color]
      );
    }
  },
};

/**
 * Ordered list of all registered migrations.
 */
export const MIGRATIONS: Migration[] = [migrationV1];

/**
 * Executes all pending migrations in order, updating PRAGMA user_version atomically.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = versionRow?.user_version ?? 0;

  const pending = MIGRATIONS.filter(m => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );

  if (pending.length === 0) {
    return;
  }

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }
}
