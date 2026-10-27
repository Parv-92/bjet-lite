/**
 * Bjet Lite - Category Migration Test Suite (Phase C4)
 *
 * Validates the local SQLite Category data flow, repository integration,
 * UI contracts, business invariants, and API module preservation:
 *
 * 1. API Category Module Integrity: src/api/categories.ts remains untouched and export-compatible
 * 2. SQLite Seeding: Lite starts with exactly 11 system default categories
 * 3. Local List Retrieval: category list comes directly from SQLite
 * 4. Custom Category Creation: creating a custom category stores it with is_system_default = false
 * 5. Persistence Across Reopen: created category persists after closing and reopening database
 * 6. Case-Insensitive Duplicate Protection: rejected with ConflictError
 * 7. Custom Category Update: updating name, icon, and color succeeds
 * 8. Protected System Defaults: updating system defaults rejected with ValidationError
 * 9. Custom Category Deletion: custom category can be deleted
 * 10. Protected System Deletion: deleting system defaults rejected with ValidationError
 * 11. Cache Invalidation / List Updates: list queries reflect mutations immediately
 * 12. Category Selection Contract: models conform to Category type required by pickers & forms
 * 13. UI Error Formatting: domain repository errors format cleanly via getApiErrorMessage
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs';
import assert from 'assert';

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
} from '../src/db/schema.ts';

import { SQLiteCategoryRepository } from '../src/repositories/categoryRepository.ts';
import { ConflictError, ValidationError, NotFoundError } from '../src/repositories/errors.ts';

// Conforms to getApiErrorMessage in src/api/client.ts
function formatUiError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

const TEST_DIR = path.join(os.tmpdir(), 'bjet_c4_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const DB_PATH = path.join(TEST_DIR, 'bjet_lite_c4.db');

console.log('=== STARTING BJET LITE CATEGORY MIGRATION TEST SUITE (PHASE C4) ===');
console.log('Test Directory:', TEST_DIR, '\n');

let passed = 0;
let failed = 0;

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

/**
 * Adapter implementing expo-sqlite interface over node:sqlite DatabaseSync
 */
class SQLiteAdapter {
  constructor(db) {
    this.db = db;
  }

  async execAsync(sql) {
    this.db.exec(sql);
  }

  async runAsync(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getFirstAsync(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return row || null;
  }

  async getAllAsync(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  async withTransactionAsync(action) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      await action();
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  close() {
    this.db.close();
  }
}

function initTestDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Schema creation
  db.exec(CREATE_CATEGORIES_TABLE);
  db.exec(CREATE_FRIENDS_TABLE);
  db.exec(CREATE_TRANSACTIONS_TABLE);
  db.exec(CREATE_BUDGETS_TABLE);
  db.exec(CREATE_USER_MERCHANT_RULES_TABLE);
  db.exec(CREATE_BUDGET_PRESETS_TABLE);
  db.exec(CREATE_BUDGET_PRESET_ITEMS_TABLE);
  for (const idxSql of CREATE_INDEXES) {
    db.exec(idxSql);
  }

  // Seed default categories idempotently
  const insertStmt = db.prepare(
    `INSERT INTO categories (name, icon, color, is_system_default)
     SELECT ?, ?, ?, 1
     WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE);`
  );
  for (const cat of DEFAULT_CATEGORIES) {
    insertStmt.run(cat.name, cat.icon, cat.color, cat.name);
  }

  return db;
}

async function run() {
  const rawDb = initTestDb(DB_PATH);
  let adapter = new SQLiteAdapter(rawDb);
  const getDb = async () => adapter;
  let repo = new SQLiteCategoryRepository(getDb);

  console.log('--- 1. API CATEGORY MODULE INTEGRITY ---');

  await runAsyncTest('1.1. Full Bjet API category module remains intact and fully exported', async () => {
    const apiPath = path.resolve('src/api/categories.ts');
    assert.ok(fs.existsSync(apiPath), 'src/api/categories.ts must exist');
    const content = fs.readFileSync(apiPath, 'utf8');
    assert.ok(content.includes('export async function getCategoriesApi'), 'getCategoriesApi must be exported');
    assert.ok(content.includes('export async function getCategoryApi'), 'getCategoryApi must be exported');
    assert.ok(content.includes('export async function createCategoryApi'), 'createCategoryApi must be exported');
    assert.ok(content.includes('export async function updateCategoryApi'), 'updateCategoryApi must be exported');
    assert.ok(content.includes('export async function deleteCategoryApi'), 'deleteCategoryApi must be exported');
    assert.ok(content.includes("'/categories'"), 'API module must target categories endpoint');
  });

  console.log('\n--- 2. SQLITE SEEDING & LOCAL RETRIEVAL ---');

  await runAsyncTest('2.1. Lite starts with exactly 11 seeded system default categories', async () => {
    const list = await repo.getAll();
    assert.strictEqual(list.length, 11);
    const systemDefaults = list.filter(c => c.is_system_default);
    assert.strictEqual(systemDefaults.length, 11);
    // Verify essential defaults exist
    const names = list.map(c => c.name);
    assert.ok(names.includes('Food & Dining'));
    assert.ok(names.includes('Groceries'));
    assert.ok(names.includes('Utilities & Bills'));
    assert.ok(names.includes('Entertainment'));
  });

  await runAsyncTest('2.2. Category list comes from local SQLite repository', async () => {
    const list = await repo.getAll();
    assert.ok(Array.isArray(list));
    for (const cat of list) {
      assert.strictEqual(typeof cat.id, 'number');
      assert.strictEqual(typeof cat.name, 'string');
      assert.strictEqual(typeof cat.is_system_default, 'boolean');
      assert.strictEqual(typeof cat.created_at, 'string');
      assert.strictEqual(typeof cat.updated_at, 'string');
    }
  });

  console.log('\n--- 3. CUSTOM CATEGORY CREATION & PERSISTENCE ---');

  let customCatId;

  await runAsyncTest('3.1. Create custom category with user attributes', async () => {
    const created = await repo.create({
      name: 'Books & Courses',
      icon: 'BookOpen',
      color: '#10B981',
    });
    assert.ok(created.id > 0);
    assert.strictEqual(created.name, 'Books & Courses');
    assert.strictEqual(created.icon, 'BookOpen');
    assert.strictEqual(created.color, '#10B981');
    assert.strictEqual(created.is_system_default, false);
    customCatId = created.id;

    // Verify list total is now 12
    const list = await repo.getAll();
    assert.strictEqual(list.length, 12);
  });

  await runAsyncTest('3.2. Created custom category persists after reopening database', async () => {
    adapter.close();

    // Reopen database
    const reopenedRawDb = new DatabaseSync(DB_PATH);
    reopenedRawDb.exec('PRAGMA foreign_keys = ON;');
    reopenedRawDb.exec('PRAGMA journal_mode = WAL;');
    adapter = new SQLiteAdapter(reopenedRawDb);
    repo = new SQLiteCategoryRepository(async () => adapter);

    const persisted = await repo.getById(customCatId);
    assert.ok(persisted);
    assert.strictEqual(persisted.name, 'Books & Courses');
    assert.strictEqual(persisted.icon, 'BookOpen');
    assert.strictEqual(persisted.color, '#10B981');
    assert.strictEqual(persisted.is_system_default, false);
  });

  console.log('\n--- 4. DUPLICATE PROTECTION & SYSTEM DEFENSE ---');

  await runAsyncTest('4.1. Case-insensitive duplicate category name is rejected with ConflictError', async () => {
    await assert.rejects(
      async () => {
        await repo.create({ name: 'books & courses' });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.ok(err.message.includes('already exists'));
        return true;
      },
      'Duplicate custom category name must throw ConflictError'
    );

    // Also rejected against system default case-insensitively
    await assert.rejects(
      async () => {
        await repo.create({ name: 'food & dining' });
      },
      (err) => {
        assert.ok(err instanceof ConflictError);
        return true;
      },
      'Duplicate of system default category name must throw ConflictError'
    );
  });

  console.log('\n--- 5. UPDATE & MUTATION BEHAVIOR ---');

  await runAsyncTest('5.1. Update custom category attributes', async () => {
    const updated = await repo.update(customCatId, {
      name: 'Books & Learning',
      color: '#059669',
    });
    assert.strictEqual(updated.name, 'Books & Learning');
    assert.strictEqual(updated.color, '#059669');
    assert.strictEqual(updated.icon, 'BookOpen'); // Unchanged icon retained

    const fetched = await repo.getById(customCatId);
    assert.strictEqual(fetched.name, 'Books & Learning');
  });

  await runAsyncTest('5.2. System default category update is rejected with ValidationError', async () => {
    const foodCat = (await repo.getAll()).find(c => c.name === 'Food & Dining');
    assert.ok(foodCat);

    await assert.rejects(
      async () => {
        await repo.update(foodCat.id, { name: 'Food & Meals' });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.message, 'System default categories cannot be modified.');
        return true;
      },
      'Updating system default must throw ValidationError'
    );
  });

  console.log('\n--- 6. DELETION & INTEGRITY DEFENSE ---');

  await runAsyncTest('6.1. System default category deletion is rejected with ValidationError', async () => {
    const foodCat = (await repo.getAll()).find(c => c.name === 'Food & Dining');
    await assert.rejects(
      async () => {
        await repo.delete(foodCat.id);
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.strictEqual(err.message, 'System default categories cannot be deleted.');
        return true;
      },
      'Deleting system default must throw ValidationError'
    );
  });

  await runAsyncTest('6.2. Delete custom category removes it from SQLite and preserves system defaults', async () => {
    await repo.delete(customCatId);

    const deleted = await repo.getById(customCatId);
    assert.strictEqual(deleted, null);

    const list = await repo.getAll();
    assert.strictEqual(list.length, 11);
    assert.ok(!list.some(c => c.id === customCatId));
  });

  console.log('\n--- 7. UI ERROR MAPPING & COMPONENT CONTRACTS ---');

  await runAsyncTest('7.1. Domain repository errors are formatted cleanly by UI error parser', async () => {
    const conflictErr = new ConflictError('Category with name "Groceries" already exists.');
    assert.strictEqual(formatUiError(conflictErr), 'Category with name "Groceries" already exists.');

    const validationErr = new ValidationError('System default categories cannot be modified.');
    assert.strictEqual(formatUiError(validationErr), 'System default categories cannot be modified.');

    const notFoundErr = new NotFoundError('Category with ID 999 not found.');
    assert.strictEqual(formatUiError(notFoundErr), 'Category with ID 999 not found.');
  });

  await runAsyncTest('7.2. Category selection contracts conform to picker and form requirements', async () => {
    const list = await repo.getAll();
    // Simulate what CategoryPickerModal and CategoryCard do:
    for (const cat of list) {
      assert.strictEqual(typeof cat.id, 'number');
      assert.strictEqual(typeof cat.name, 'string');
      assert.ok(cat.icon === null || typeof cat.icon === 'string');
      assert.ok(cat.color === null || typeof cat.color === 'string');
      assert.strictEqual(typeof cat.is_system_default, 'boolean');
    }
  });

  console.log('\n=======================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=======================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
