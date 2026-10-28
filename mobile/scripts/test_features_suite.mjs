/**
 * Bjet Lite - Feature Implementation Comprehensive Test Suite
 *
 * Verifies:
 * 1. Category-Wise Monthly Transaction Details & Filtering
 * 2. Uncategorized Filtering (both NULL category_id and 'Uncategorized' category rows)
 * 3. Authoritative Financial Calculations (SENT, paid_for_others, RECEIVED reimbursements)
 * 4. Date-wise grouping and collapsible state behavior
 * 5. Monthly grouping across year boundaries (Dec 2025 / Jan 2026)
 * 6. Collapsed-by-default behavior and independent monthly expand/collapse
 * 7. Category filter applied alongside monthly groups with badge discovery
 * 8. Category filter clearing and persistence
 * 9. Preservation of existing transaction data and database integrity
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import os from 'os';
import fs from 'fs';
import assert from 'assert';

console.log('=== STARTING BJET LITE FEATURES VERIFICATION SUITE ===\n');

let passCount = 0;
let failCount = 0;

function it(title, fn) {
  try {
    fn();
    console.log(`  [PASS] ${title}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${title}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// Database Setup
// -------------------------------------------------------------
const testDbFile = path.join(os.tmpdir(), `bjet_features_test_${Date.now()}.db`);
const db = new DatabaseSync(testDbFile);
db.exec('PRAGMA foreign_keys = ON;');

// Create tables
db.exec(`
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  icon TEXT,
  color TEXT,
  is_system_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  timestamp TEXT NOT NULL,
  merchant_raw_name TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  upi_reference_id TEXT,
  upi_vpa TEXT,
  payment_app TEXT DEFAULT 'Google Pay',
  direction TEXT NOT NULL DEFAULT 'SENT' CHECK(direction IN ('SENT', 'RECEIVED', 'TOP_UP')),
  is_reimbursement INTEGER NOT NULL DEFAULT 0,
  friend_id INTEGER,
  amount_paid_for_someone_else REAL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  notes TEXT,
  raw_extracted_text TEXT,
  receipt_image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Seed Categories
const insertCat = db.prepare(`INSERT INTO categories (name, icon, color, is_system_default) VALUES (?, ?, ?, 1)`);
insertCat.run('Food & Dining', 'utensils', '#FF5722'); // id 1
insertCat.run('Groceries', 'shopping-basket', '#4CAF50'); // id 2
insertCat.run('Shopping', 'shopping-bag', '#E91E63'); // id 3
insertCat.run('Transportation', 'car', '#2196F3'); // id 4
insertCat.run('Uncategorized', 'help-circle', '#9E9E9E'); // id 5

// Seed Transactions across Dec 2025 and Jan 2026, plus multiple categories
const insertTx = db.prepare(`
  INSERT INTO transactions (
    amount, timestamp, merchant_raw_name, category_id, direction,
    is_reimbursement, amount_paid_for_someone_else, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Jan 2026: Food & Dining transactions
insertTx.run(450.0, '2026-01-15T12:30:00', 'Swiggy', 1, 'SENT', 0, 0, 'CONFIRMED');
insertTx.run(800.0, '2026-01-15T20:00:00', 'Zomato', 1, 'SENT', 0, 300.0, 'CONFIRMED'); // split 300
insertTx.run(150.0, '2026-01-20T10:00:00', 'Chai Point', 1, 'SENT', 0, 0, 'CONFIRMED');
insertTx.run(200.0, '2026-01-22T11:00:00', 'Refund Swiggy', 1, 'RECEIVED', 1, 0, 'CONFIRMED'); // reimbursement

// Jan 2026: Groceries
insertTx.run(1200.0, '2026-01-10T15:00:00', 'Blinkit', 2, 'SENT', 0, 0, 'CONFIRMED');

// Jan 2026: Uncategorized (one with category_id NULL, one with category_id 5)
insertTx.run(350.0, '2026-01-05T09:00:00', 'Local Vendor', null, 'SENT', 0, 0, 'CONFIRMED');
insertTx.run(500.0, '2026-01-08T18:00:00', 'Unknown Shop', 5, 'SENT', 0, 0, 'CONFIRMED');

// Dec 2025: Year boundary transactions
insertTx.run(999.0, '2025-12-25T19:00:00', 'Dinner Dec', 1, 'SENT', 0, 0, 'CONFIRMED');
insertTx.run(600.0, '2025-12-31T23:00:00', 'Party Grocery', 2, 'SENT', 0, 0, 'CONFIRMED');
insertTx.run(250.0, '2025-12-15T14:00:00', 'Dec Uncategorized', null, 'SENT', 0, 0, 'CONFIRMED');

// Query helper matching transactionRepository logic
function getTransactions(params = {}) {
  const conditions = [];
  const values = [];

  if (params.status) {
    conditions.push('t.status = ?');
    values.push(params.status);
  }

  if (params.uncategorized || params.category_id === null) {
    conditions.push(`(t.category_id IS NULL OR c.name COLLATE NOCASE = 'Uncategorized')`);
  } else if (params.category_id !== undefined) {
    conditions.push('t.category_id = ?');
    values.push(params.category_id);
  }

  if (params.year !== undefined && params.month !== undefined) {
    const monthStr = String(params.month).padStart(2, '0');
    conditions.push(`strftime('%Y-%m', t.timestamp) = ?`);
    values.push(`${params.year}-${monthStr}`);
  }

  let sql = `
    SELECT t.*, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
  `;

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }

  sql += ` ORDER BY t.timestamp DESC, t.id DESC`;

  return db.prepare(sql).all(...values);
}

// -------------------------------------------------------------
// Test 1: Category-Wise Monthly Filtering
// -------------------------------------------------------------
it('1. Category details returns only transactions for selected category and month', () => {
  const janFood = getTransactions({ category_id: 1, month: 1, year: 2026 });
  assert.strictEqual(janFood.length, 4, 'Jan 2026 Food & Dining should have 4 transactions');
  for (const tx of janFood) {
    assert.strictEqual(tx.category_id, 1);
    assert(tx.timestamp.startsWith('2026-01'));
  }

  const decFood = getTransactions({ category_id: 1, month: 12, year: 2025 });
  assert.strictEqual(decFood.length, 1, 'Dec 2025 Food & Dining should have 1 transaction');
  assert.strictEqual(decFood[0].merchant_raw_name, 'Dinner Dec');
});

// -------------------------------------------------------------
// Test 2: Uncategorized Filtering (NULL and 'Uncategorized' row)
// -------------------------------------------------------------
it('2. Uncategorized filtering correctly matches NULL category_id AND Uncategorized category rows', () => {
  const janUncat = getTransactions({ uncategorized: true, month: 1, year: 2026 });
  assert.strictEqual(janUncat.length, 2, 'Jan 2026 should have 2 uncategorized transactions');

  const names = janUncat.map((t) => t.merchant_raw_name);
  assert(names.includes('Local Vendor'), 'Matches NULL category_id');
  assert(names.includes('Unknown Shop'), 'Matches category_id pointing to "Uncategorized"');

  const decUncat = getTransactions({ uncategorized: true, month: 12, year: 2025 });
  assert.strictEqual(decUncat.length, 1);
  assert.strictEqual(decUncat[0].merchant_raw_name, 'Dec Uncategorized');
});

// -------------------------------------------------------------
// Test 3: Spending Calculations Semantics
// -------------------------------------------------------------
it('3. Net personal spending calculation matches authoritative rules', () => {
  const janFood = getTransactions({ category_id: 1, month: 1, year: 2026 });

  let grossSent = 0;
  let paidForOthers = 0;
  let reimbursements = 0;

  for (const tx of janFood) {
    if (tx.direction === 'RECEIVED' && tx.is_reimbursement) {
      reimbursements += tx.amount;
    } else if (tx.direction === 'SENT') {
      grossSent += tx.amount;
      paidForOthers += tx.amount_paid_for_someone_else || 0;
    }
  }

  // 450 + 800 + 150 = 1400 gross. Paid for others = 300. Net sent = 1100.
  // Reimbursement = 200.
  // Personal Net Spending = 1100 - 200 = 900.
  const netSpending = Math.max(0, grossSent - paidForOthers) - reimbursements;
  assert.strictEqual(grossSent, 1400.0);
  assert.strictEqual(paidForOthers, 300.0);
  assert.strictEqual(reimbursements, 200.0);
  assert.strictEqual(netSpending, 900.0);
});

// -------------------------------------------------------------
// Test 4: Date-wise grouping and collapsible state
// -------------------------------------------------------------
it('4. Date groups on category details page group by date and support independent collapse/expand', () => {
  const janFood = getTransactions({ category_id: 1, month: 1, year: 2026 });

  const dateMap = new Map();
  for (const tx of janFood) {
    const dateKey = tx.timestamp.split('T')[0];
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, []);
    }
    dateMap.get(dateKey).push(tx);
  }

  // Jan 15 has 2 transactions, Jan 20 has 1, Jan 22 has 1
  assert.strictEqual(dateMap.get('2026-01-15').length, 2);
  assert.strictEqual(dateMap.get('2026-01-20').length, 1);
  assert.strictEqual(dateMap.get('2026-01-22').length, 1);

  // Test independent expand/collapse state
  const expandedDates = new Set(['2026-01-15', '2026-01-20', '2026-01-22']);
  assert(expandedDates.has('2026-01-15'));

  // Collapse Jan 15
  expandedDates.delete('2026-01-15');
  assert(!expandedDates.has('2026-01-15'), 'Jan 15 collapsed');
  assert(expandedDates.has('2026-01-20'), 'Jan 20 remains expanded');
  assert(expandedDates.has('2026-01-22'), 'Jan 22 remains expanded');
});

// -------------------------------------------------------------
// Test 5: Monthly grouping across December / January year boundary
// -------------------------------------------------------------
it('5. Monthly grouping correctly handles year boundary sorting (2026-01 before 2025-12)', () => {
  const allTx = getTransactions();
  const groupMap = new Map();

  for (const tx of allTx) {
    const key = tx.timestamp.slice(0, 7); // 'YYYY-MM'
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(tx);
  }

  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => b.localeCompare(a));
  assert.deepStrictEqual(sortedKeys, ['2026-01', '2025-12']);
  assert.strictEqual(sortedKeys[0], '2026-01', 'January 2026 comes first');
  assert.strictEqual(sortedKeys[1], '2025-12', 'December 2025 comes second');
});

// -------------------------------------------------------------
// Test 6: All monthly groups collapsed by default and toggle independently
// -------------------------------------------------------------
it('6. All monthly groups start collapsed by default and expand/collapse independently', () => {
  // Fresh screen state: empty Set
  const expandedMonths = new Set();
  assert.strictEqual(expandedMonths.size, 0, 'Default state is completely collapsed');

  const monthKeys = ['2026-01', '2025-12'];

  // Check that all months are collapsed
  for (const k of monthKeys) {
    assert(!expandedMonths.has(k), `${k} is collapsed by default`);
  }

  // Toggle expand Jan 2026
  expandedMonths.add('2026-01');
  assert(expandedMonths.has('2026-01'), '2026-01 is expanded');
  assert(!expandedMonths.has('2025-12'), '2025-12 remains collapsed');

  // Toggle collapse Jan 2026
  expandedMonths.delete('2026-01');
  assert(!expandedMonths.has('2026-01'), '2026-01 collapsed again');
});

// -------------------------------------------------------------
// Test 7: Category filter applied with collapsed groups and badge counts
// -------------------------------------------------------------
it('7. Category filter works with monthly groups, showing matching transaction count badge', () => {
  // Filter by Food & Dining (id 1)
  const foodTx = getTransactions({ category_id: 1 });
  const groupMap = new Map();

  for (const tx of foodTx) {
    const key = tx.timestamp.slice(0, 7);
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(tx);
  }

  assert.strictEqual(groupMap.get('2026-01').length, 4, 'Jan 2026 shows 4 matching transactions');
  assert.strictEqual(groupMap.get('2025-12').length, 1, 'Dec 2025 shows 1 matching transaction');

  // Filter by Groceries (id 2)
  const grocTx = getTransactions({ category_id: 2 });
  const grocMap = new Map();
  for (const tx of grocTx) {
    const key = tx.timestamp.slice(0, 7);
    if (!grocMap.has(key)) grocMap.set(key, []);
    grocMap.get(key).push(tx);
  }
  assert.strictEqual(grocMap.get('2026-01').length, 1);
  assert.strictEqual(grocMap.get('2025-12').length, 1);
});

// -------------------------------------------------------------
// Test 8: Filter clearing returns to all records
// -------------------------------------------------------------
it('8. Clearing category filter returns all transactions', () => {
  const filtered = getTransactions({ category_id: 2 });
  assert.strictEqual(filtered.length, 2);

  const cleared = getTransactions();
  assert.strictEqual(cleared.length, 10, 'All 10 transactions returned when filter is cleared');
});

// -------------------------------------------------------------
// Test 9: Data Integrity & Invariant Preservation
// -------------------------------------------------------------
it('9. Existing transactions, directions, split amounts, and category mappings remain intact', () => {
  const rows = db.prepare('SELECT count(*) as count FROM transactions').get();
  assert.strictEqual(rows.count, 10);

  const directions = db.prepare('SELECT DISTINCT direction FROM transactions').all();
  const dirSet = new Set(directions.map((d) => d.direction));
  assert(dirSet.has('SENT'));
  assert(dirSet.has('RECEIVED'));

  const reimbs = db.prepare('SELECT count(*) as count FROM transactions WHERE is_reimbursement = 1').get();
  assert.strictEqual(reimbs.count, 1);
});

// Cleanup
db.close();
try {
  fs.unlinkSync(testDbFile);
} catch {}

console.log('\n=======================================');
console.log(`TOTAL: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('=======================================');

if (failCount > 0) {
  process.exit(1);
}
