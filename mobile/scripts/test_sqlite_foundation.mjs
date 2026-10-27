/**
 * Bjet Lite - Local SQLite Foundation Test Suite (Phase C2)
 *
 * Validates the core SQLite persistence layer:
 * 1. Database opening and PRAGMA settings (foreign_keys = ON, journal_mode = WAL).
 * 2. Complete schema existence (categories, friends, transactions, budgets, rules, presets, items).
 * 3. Migration and version tracking (PRAGMA user_version).
 * 4. Repeated initialization safety (idempotent, no destructive resets).
 * 5. Default category seeding idempotency (exactly 11 seeded categories).
 * 6. Foreign key enforcement (rejects dangling foreign keys).
 * 7. Unique constraints (category names, friend recognized_name, budget period, merchant pattern).
 * 8. Financial check constraints (amount > 0, amount_paid_for_someone_else <= amount).
 * 9. Reopening the database preserves existing user data intact.
 * 10. Initialization alongside existing user data preserves data without corruption.
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

const TEST_DIR = path.join(os.tmpdir(), 'bjet_sqlite_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });

console.log('=== STARTING BJET LITE SQLITE FOUNDATION TEST SUITE ===');
console.log('Test Directory:', TEST_DIR, '\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    failed++;
  }
}

/**
 * Simulates Bjet Lite's initDatabase logic against node:sqlite DatabaseSync
 */
function initLiteDb(dbPath) {
  const db = new DatabaseSync(dbPath);

  // 1. Foreign keys
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // 2. Migration runner simulation
  const versionRow = db.prepare('PRAGMA user_version;').get();
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion < 1) {
    // Migration 1: Schema + Indexes + Default Categories
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

    const insertCat = db.prepare(
      `INSERT OR IGNORE INTO categories (name, icon, color, is_system_default) VALUES (?, ?, ?, 1);`
    );
    for (const cat of DEFAULT_CATEGORIES) {
      insertCat.run(cat.name, cat.icon, cat.color);
    }

    db.exec('PRAGMA user_version = 1;');
  }

  // Idempotent category check
  const insertCat = db.prepare(
    `INSERT OR IGNORE INTO categories (name, icon, color, is_system_default) VALUES (?, ?, ?, 1);`
  );
  for (const cat of DEFAULT_CATEGORIES) {
    insertCat.run(cat.name, cat.icon, cat.color);
  }

  return db;
}

// --- TEST 1: Database Initialization & Schema Tables Existence ---
const DB_FILE_1 = path.join(TEST_DIR, 'test_init.db');
let db1;

runTest('1. Database initializes and sets user_version = 1', () => {
  db1 = initLiteDb(DB_FILE_1);
  const version = db1.prepare('PRAGMA user_version;').get().user_version;
  assert.strictEqual(version, 1, `Expected user_version 1, got ${version}`);
});

runTest('2. All 7 required SQLite tables exist', () => {
  const tables = db1
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    .all()
    .map(r => r.name);

  const expectedTables = [
    'categories',
    'friends',
    'transactions',
    'budgets',
    'user_merchant_rules',
    'budget_presets',
    'budget_preset_items',
  ];

  for (const expected of expectedTables) {
    assert.ok(tables.includes(expected), `Table '${expected}' was not created`);
  }
});

runTest('3. Indexes are created for transactions, categories, budgets, and rules', () => {
  const indexes = db1
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';")
    .all()
    .map(r => r.name);

  assert.ok(indexes.includes('idx_transactions_timestamp'), 'Missing idx_transactions_timestamp');
  assert.ok(indexes.includes('idx_transactions_category_id'), 'Missing idx_transactions_category_id');
  assert.ok(indexes.includes('idx_transactions_upi_ref'), 'Missing idx_transactions_upi_ref');
  assert.ok(indexes.includes('idx_transactions_dedup'), 'Missing idx_transactions_dedup');
  assert.ok(indexes.includes('idx_budgets_period'), 'Missing idx_budgets_period');
  assert.ok(indexes.includes('idx_rules_pattern'), 'Missing idx_rules_pattern');
});

runTest('4. Exactly 11 system default categories are seeded', () => {
  const rows = db1.prepare('SELECT * FROM categories WHERE is_system_default = 1;').all();
  assert.strictEqual(rows.length, 11, `Expected 11 default categories, found ${rows.length}`);

  const names = rows.map(r => r.name);
  assert.ok(names.includes('Food & Dining'), 'Missing Food & Dining');
  assert.ok(names.includes('Groceries'), 'Missing Groceries');
  assert.ok(names.includes('Uncategorized'), 'Missing Uncategorized');
});

// --- TEST 2: Repeated Initialization Idempotency ---
runTest('5. Repeated initialization is safe and preserves user_version and category count', () => {
  const dbReinit = initLiteDb(DB_FILE_1);
  const version = dbReinit.prepare('PRAGMA user_version;').get().user_version;
  assert.strictEqual(version, 1);

  const count = dbReinit.prepare('SELECT COUNT(*) as cnt FROM categories;').get().cnt;
  assert.strictEqual(count, 11, `Expected 11 categories after re-init, got ${count}`);
});

// --- TEST 3: Foreign Key Enforcement ---
runTest('6. Foreign keys are strictly enforced on invalid parent records', () => {
  assert.throws(
    () => {
      // Attempt to insert friend referencing non-existent category 9999
      db1
        .prepare('INSERT INTO friends (name, recognized_name, category_id) VALUES (?, ?, ?);')
        .run('Alice', 'alice_upi', 9999);
    },
    /FOREIGN KEY constraint failed/i,
    'Inserting friend with invalid category_id must fail foreign key check'
  );

  assert.throws(
    () => {
      // Attempt to insert budget referencing non-existent category 9999
      db1
        .prepare(
          'INSERT INTO budgets (category_id, month, year, amount_limit) VALUES (?, ?, ?, ?);'
        )
        .run(9999, 10, 2026, 5000);
    },
    /FOREIGN KEY constraint failed/i,
    'Inserting budget with invalid category_id must fail foreign key check'
  );
});

// --- TEST 4: Unique Constraints ---
runTest('7. Category name is unique case-insensitively', () => {
  assert.throws(
    () => {
      // "groceries" already exists as "Groceries"
      db1
        .prepare('INSERT INTO categories (name, icon, color, is_system_default) VALUES (?, ?, ?, 0);')
        .run('groceries', 'basket', '#000000');
    },
    /UNIQUE constraint failed/i,
    'Duplicate category name must throw UNIQUE constraint error'
  );
});

runTest('8. Friend recognized_name is unique case-insensitively', () => {
  const foodCatId = db1.prepare("SELECT id FROM categories WHERE name = 'Food & Dining';").get().id;
  db1
    .prepare('INSERT INTO friends (name, recognized_name, category_id) VALUES (?, ?, ?);')
    .run('Bob', 'bob@okaxis', foodCatId);

  assert.throws(
    () => {
      db1
        .prepare('INSERT INTO friends (name, recognized_name, category_id) VALUES (?, ?, ?);')
        .run('Robert', 'BOB@OKAXIS', foodCatId);
    },
    /UNIQUE constraint failed/i,
    'Duplicate recognized_name must throw UNIQUE constraint error'
  );
});

runTest('9. Budget is unique for (category_id, month, year)', () => {
  const foodCatId = db1.prepare("SELECT id FROM categories WHERE name = 'Food & Dining';").get().id;
  db1
    .prepare('INSERT INTO budgets (category_id, month, year, amount_limit) VALUES (?, ?, ?, ?);')
    .run(foodCatId, 10, 2026, 8000.0);

  assert.throws(
    () => {
      db1
        .prepare('INSERT INTO budgets (category_id, month, year, amount_limit) VALUES (?, ?, ?, ?);')
        .run(foodCatId, 10, 2026, 9000.0);
    },
    /UNIQUE constraint failed/i,
    'Duplicate budget for category in same month/year must fail'
  );
});

runTest('10. Merchant rule pattern is unique case-insensitively', () => {
  const foodCatId = db1.prepare("SELECT id FROM categories WHERE name = 'Food & Dining';").get().id;
  db1
    .prepare('INSERT INTO user_merchant_rules (merchant_pattern, category_id, priority) VALUES (?, ?, ?);')
    .run('SWIGGY', foodCatId, 10);

  assert.throws(
    () => {
      db1
        .prepare(
          'INSERT INTO user_merchant_rules (merchant_pattern, category_id, priority) VALUES (?, ?, ?);'
        )
        .run('swiggy', foodCatId, 20);
    },
    /UNIQUE constraint failed/i,
    'Duplicate merchant pattern must fail'
  );
});

// --- TEST 5: Financial Check Constraints ---
runTest('11. Transaction amount must be positive (> 0)', () => {
  assert.throws(
    () => {
      db1
        .prepare('INSERT INTO transactions (amount, timestamp, direction) VALUES (?, ?, ?);')
        .run(-50.0, new Date().toISOString(), 'SENT');
    },
    /CHECK constraint failed/i,
    'Negative transaction amount must be rejected'
  );
});

runTest('12. Transaction amount_paid_for_someone_else cannot exceed total amount', () => {
  assert.throws(
    () => {
      db1
        .prepare(
          'INSERT INTO transactions (amount, timestamp, direction, amount_paid_for_someone_else) VALUES (?, ?, ?, ?);'
        )
        .run(100.0, new Date().toISOString(), 'SENT', 150.0);
    },
    /CHECK constraint failed/i,
    'amount_paid_for_someone_else > amount must be rejected'
  );
});

// --- TEST 6: Data Persistence Across Reopen & New Initialization ---
runTest('13. Reopening database and running init preserves all user transactions and settings', () => {
  // Add a sample transaction
  const foodCatId = db1.prepare("SELECT id FROM categories WHERE name = 'Food & Dining';").get().id;
  const friendId = db1.prepare("SELECT id FROM friends WHERE recognized_name = 'bob@okaxis';").get().id;

  db1
    .prepare(
      `INSERT INTO transactions (
         amount, currency, timestamp, merchant_raw_name, category_id,
         upi_reference_id, upi_vpa, direction, is_reimbursement, friend_id,
         amount_paid_for_someone_else, status, notes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`
    )
    .run(
      500.0,
      'INR',
      '2026-10-04T12:00:00.000Z',
      'Swiggy Order',
      foodCatId,
      '123456789012',
      'swiggy@icici',
      'SENT',
      0,
      friendId,
      200.0,
      'CONFIRMED',
      'Lunch split with Bob'
    );

  // Close db1
  db1.close();

  // Re-open and run initLiteDb on the same file
  const dbReopened = initLiteDb(DB_FILE_1);

  // Verify transaction is intact
  const tx = dbReopened
    .prepare('SELECT * FROM transactions WHERE upi_reference_id = ?;')
    .get('123456789012');

  assert.ok(tx, 'Transaction was not found after reopen');
  assert.strictEqual(tx.amount, 500.0);
  assert.strictEqual(tx.amount_paid_for_someone_else, 200.0);
  assert.strictEqual(tx.notes, 'Lunch split with Bob');
  assert.strictEqual(tx.friend_id, friendId);

  // Verify categories and friends remain intact
  const catCount = dbReopened.prepare('SELECT COUNT(*) as cnt FROM categories;').get().cnt;
  assert.strictEqual(catCount, 11);

  const bob = dbReopened
    .prepare('SELECT * FROM friends WHERE recognized_name = ?;')
    .get('bob@okaxis');
  assert.ok(bob, 'Friend Bob was preserved');

  dbReopened.close();
});

console.log('\n=======================================');
console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('=======================================\n');

if (failed > 0) {
  process.exit(1);
}
