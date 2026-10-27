/**
 * Bjet Lite - Local SQLite Database Initializer (Phase C2)
 *
 * Manages the SQLite database connection, PRAGMA settings,
 * foreign key enforcement, migration execution, and idempotent category seeding.
 */

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrations';
import { DEFAULT_CATEGORIES } from './schema';

export const LITE_DB_NAME = 'bjet_lite.db';

let activeDatabase: SQLiteDatabase | null = null;
let initPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Returns the active open SQLiteDatabase instance.
 * Automatically initializes if not already open, and prevents concurrent initializations.
 */
export async function getDatabaseAsync(): Promise<SQLiteDatabase> {
  if (activeDatabase) {
    return activeDatabase;
  }
  if (initPromise) {
    return initPromise;
  }
  return initDatabase();
}

/**
 * Initializes the Bjet Lite SQLite database.
 *
 * Guarantees:
 * 1. Enables foreign key enforcement (PRAGMA foreign_keys = ON).
 * 2. Enables Write-Ahead Logging (PRAGMA journal_mode = WAL) for performance & concurrency.
 * 3. Idempotently applies all pending schema migrations.
 * 4. Idempotently ensures all system default categories are seeded.
 * 5. Safe on repeated invocations (idempotent, no destructive resets).
 */
export async function initDatabase(dbName: string = LITE_DB_NAME): Promise<SQLiteDatabase> {
  // Prevent concurrent initialization of the primary database
  if (dbName === LITE_DB_NAME && initPromise) {
    return initPromise;
  }

  const doInit = async () => {
    try {
      const db = await SQLite.openDatabaseAsync(dbName, { useNewConnection: true });
      await db.execAsync('PRAGMA foreign_keys = ON;');

      // 2. Enable WAL mode for mobile performance
      await db.execAsync('PRAGMA journal_mode = WAL;');

      // 3. Apply schema migrations via PRAGMA user_version
      await runMigrations(db);

      // 4. Ensure default categories are seeded idempotently
      await seedDefaultCategories(db);

      if (dbName === LITE_DB_NAME) {
        activeDatabase = db;
      }

      return db;
    } finally {
      if (dbName === LITE_DB_NAME) {
        initPromise = null; // Clear the promise once done, so activeDatabase is used directly next time or retried if failed
      }
    }
  };

  if (dbName === LITE_DB_NAME) {
    initPromise = doInit();
    return initPromise;
  }

  return doInit();
}

/**
 * Idempotently seeds the 11 system default categories.
 */
export async function seedDefaultCategories(db: SQLiteDatabase): Promise<void> {
  for (const cat of DEFAULT_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO categories (name, icon, color, is_system_default)
       VALUES (?, ?, ?, 1);`,
      [cat.name, cat.icon, cat.color]
    );
  }
}

/**
 * Closes the active database connection if open.
 */
export async function closeDatabaseAsync(): Promise<void> {
  if (activeDatabase) {
    await activeDatabase.closeAsync();
    activeDatabase = null;
  }
}

/**
 * Deletes a local database file (for isolated test suites).
 */
export async function deleteDatabaseAsync(dbName: string = LITE_DB_NAME): Promise<void> {
  await closeDatabaseAsync();
  await SQLite.deleteDatabaseAsync(dbName);
}
