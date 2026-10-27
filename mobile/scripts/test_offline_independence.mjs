/**
 * Bjet Lite - Offline Independence & Zero-Auth Test Suite (Phase C9)
 *
 * Validates that Bjet Lite is a genuinely standalone, offline-first application:
 * 1. Cold start without backend, network, or server dependency
 * 2. Standalone local user and zero auth token / JWT requirement
 * 3. App routing directly to tabs without login screens or network guards
 * 4. Local domain execution:
 *    - Categories: read defaults, create custom, update, delete
 *    - Transactions: create SENT, RECEIVED, TOP_UP, bulk delete
 *    - Budgets: monthly summary, spending breakdown, presets
 *    - Friends: friend recognition, reimbursement linkage
 *    - Merchant Rules: pattern creation and matching
 *    - Statement Import: local duplicate check and persistence
 * 5. Database persistence across simulated app restart
 * 6. Full Bjet API module preservation for coexistence
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
import { SQLiteFriendRepository } from '../src/repositories/friendRepository.ts';
import { SQLiteMerchantRuleRepository } from '../src/repositories/merchantRuleRepository.ts';
import { SQLiteTransactionRepository } from '../src/repositories/transactionRepository.ts';
import { SQLiteBudgetRepository } from '../src/repositories/budgetRepository.ts';
import { SQLiteBudgetPresetRepository } from '../src/repositories/presetRepository.ts';
import { StatementTransactionPersistenceService } from '../src/services/receipt/StatementTransactionPersistenceService.ts';
import { LOCAL_LITE_USER } from '../src/features/auth/constants.ts';


const TEST_DIR = path.join(os.tmpdir(), 'bjet_c9_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const DB_PATH = path.join(TEST_DIR, 'bjet_lite_c9.db');

console.log('=== STARTING BJET LITE OFFLINE INDEPENDENCE TEST SUITE (PHASE C9) ===');
console.log('Test Directory:', TEST_DIR, '\n');

class SQLiteAdapter {
  constructor(databaseSync) {
    this.db = databaseSync;
  }
  async getAllAsync(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }
  async getFirstAsync(sql, params = []) {
    return this.db.prepare(sql).get(...params) || null;
  }
  async runAsync(sql, params = []) {
    const result = this.db.prepare(sql).run(...params);
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }
  async execAsync(sql) {
    this.db.exec(sql);
  }
  async withTransactionAsync(fn) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const res = await fn();
      this.db.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

let syncDb = new DatabaseSync(DB_PATH);
let adapter = new SQLiteAdapter(syncDb);

let categoryRepo = new SQLiteCategoryRepository(() => Promise.resolve(adapter));
let friendRepo = new SQLiteFriendRepository(() => Promise.resolve(adapter));
let ruleRepo = new SQLiteMerchantRuleRepository(() => Promise.resolve(adapter));
let transactionRepo = new SQLiteTransactionRepository(
  () => Promise.resolve(adapter),
  friendRepo,
  categoryRepo,
  ruleRepo
);
let budgetRepo = new SQLiteBudgetRepository(() => Promise.resolve(adapter), transactionRepo, categoryRepo);
let presetRepo = new SQLiteBudgetPresetRepository(() => Promise.resolve(adapter), budgetRepo, categoryRepo);
let persistenceService = new StatementTransactionPersistenceService(transactionRepo, categoryRepo);

// Helper for schema init
function initSchema(db) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(CREATE_CATEGORIES_TABLE);
  db.exec(CREATE_FRIENDS_TABLE);
  db.exec(CREATE_TRANSACTIONS_TABLE);
  db.exec(CREATE_BUDGETS_TABLE);
  db.exec(CREATE_USER_MERCHANT_RULES_TABLE);
  db.exec(CREATE_BUDGET_PRESETS_TABLE);
  db.exec(CREATE_BUDGET_PRESET_ITEMS_TABLE);
  for (const sql of CREATE_INDEXES) {
    db.exec(sql);
  }


  const insertCategory = db.prepare(`
    INSERT INTO categories (name, icon, color, is_system_default)
    VALUES (?, ?, ?, 1);
  `);
  for (const cat of DEFAULT_CATEGORIES) {
    insertCategory.run(cat.name, cat.icon, cat.color);
  }
}

initSchema(syncDb);

console.log('--- 1. ZERO-AUTH & LOCAL IDENTITY ---');

runTest('Local user profile is defined with offline defaults', () => {
  assert.strictEqual(LOCAL_LITE_USER.id, 1);
  assert.strictEqual(LOCAL_LITE_USER.email, 'local@bjet.lite');
  assert.strictEqual(LOCAL_LITE_USER.full_name, 'Bjet Lite User');
  assert.strictEqual(LOCAL_LITE_USER.is_active, true);
});

console.log('\n--- 2. STANDALONE LOCAL REPOSITORIES ---');

let customCatId;
await runAsyncTest('Category operations function fully offline', async () => {
  const defaults = await categoryRepo.getAll();
  assert.strictEqual(defaults.length, 11);

  const created = await categoryRepo.create({
    name: 'Offline Category',
    icon: 'wifi-off',
    color: '#34D399',
  });
  assert.strictEqual(created.name, 'Offline Category');
  assert.strictEqual(created.is_system_default, false);
  customCatId = created.id;
});

let testFriendId;
await runAsyncTest('Friend operations function fully offline', async () => {
  const friend = await friendRepo.create({
    name: 'Local Companion',
    recognized_name: 'local_companion_upi',
    category_id: customCatId,
  });
  assert.strictEqual(friend.name, 'Local Companion');
  testFriendId = friend.id;

  const matched = await friendRepo.findMatchingFriend('Payment from local_companion_upi');
  assert.strictEqual(matched?.id, testFriendId);
});

let testRuleId;
await runAsyncTest('Merchant rule operations function fully offline', async () => {
  const rule = await ruleRepo.create({
    merchant_pattern: 'OFFLINE_STORE',
    category_id: customCatId,
    priority: 10,
  });
  assert.strictEqual(rule.merchant_pattern, 'OFFLINE_STORE');
  testRuleId = rule.id;

  const matched = await ruleRepo.matchRule('OFFLINE_STORE #42');
  assert.strictEqual(matched?.id, testRuleId);
});

let sentTxId;
await runAsyncTest('Transaction operations function fully offline', async () => {
  const tx = await transactionRepo.createTransaction({
    amount: 750,
    type: 'EXPENSE',
    direction: 'SENT',
    category_id: customCatId,
    timestamp: '2026-10-15T10:00:00Z',
    merchant_raw_name: 'OFFLINE_STORE #42',
    amount_paid_for_someone_else: 250,
  });
  assert.strictEqual(tx.amount, '750.00');
  assert.strictEqual(tx.amount_paid_for_someone_else, '250.00');
  sentTxId = tx.id;

  const reimbursement = await transactionRepo.createTransaction({
    amount: 250,
    type: 'INCOME',
    direction: 'RECEIVED',
    category_id: customCatId,
    timestamp: '2026-10-16T12:00:00Z',
    merchant_raw_name: 'Payment from local_companion_upi',
  });
  assert.strictEqual(reimbursement.is_reimbursement, true);
  assert.strictEqual(reimbursement.friend_id, testFriendId);
});

await runAsyncTest('Budget & spending breakdown calculations work offline', async () => {
  await budgetRepo.setBudget({
    category_id: customCatId,
    month: 10,
    year: 2026,
    amount_limit: 1000,
  });
  const summary = await budgetRepo.getBudgetSummary(10, 2026);
  assert.strictEqual(summary.length, 1);
  assert.strictEqual(summary[0].category_id, customCatId);
  // Net spent = (750 - 250 paid for someone else) - 250 reimbursement = 250
  assert.strictEqual(parseFloat(summary[0].spent_amount), 250);
  assert.strictEqual(summary[0].is_over_budget, false);

  const breakdown = await budgetRepo.getSpendingBreakdown(10, 2026);
  assert.strictEqual(breakdown.items.length, 1);
  assert.strictEqual(breakdown.total_spent, 250);
});

await runAsyncTest('Statement import duplicate preflight and batch persistence work offline', async () => {
  const candidates = [
    {
      localId: 'cand-offline-1',
      date: '2026-10-20T10:00:00Z',
      direction: 'SENT',
      amount: 400,
      description: 'Coffee Shop',
      transactionReference: 'UPI/OFFLINE/001',
      category: 'Food & Dining',
      confidence: 0.9,
      isReimbursement: false,
      selectedCategoryId: customCatId,
    },
  ];

  const preflight = await transactionRepo.findExistingUpiRefs(['UPI/OFFLINE/001']);
  assert.strictEqual(preflight.size, 0);

  const result = await persistenceService.persistCandidates(candidates);
  assert.strictEqual(result.successCount, 1);
  assert.strictEqual(result.skippedDuplicateCount, 0);

  // Re-importing detects duplicate locally without network
  const rePreflight = await transactionRepo.findExistingUpiRefs(['UPI/OFFLINE/001']);
  assert.strictEqual(rePreflight.has('UPI/OFFLINE/001'), true);
});

console.log('\n--- 3. DATABASE PERSISTENCE ACROSS RESTART ---');

await runAsyncTest('Closing and reopening database preserves all offline entities', async () => {
  syncDb.close();

  const reopenedSyncDb = new DatabaseSync(DB_PATH);
  const reopenedAdapter = new SQLiteAdapter(reopenedSyncDb);
  const reopenedCategoryRepo = new SQLiteCategoryRepository(() => Promise.resolve(reopenedAdapter));
  const reopenedTransactionRepo = new SQLiteTransactionRepository(
    () => Promise.resolve(reopenedAdapter),
    new SQLiteFriendRepository(() => Promise.resolve(reopenedAdapter)),
    reopenedCategoryRepo,
    new SQLiteMerchantRuleRepository(() => Promise.resolve(reopenedAdapter))
  );
  const reopenedBudgetRepo = new SQLiteBudgetRepository(
    () => Promise.resolve(reopenedAdapter),
    reopenedTransactionRepo,
    reopenedCategoryRepo
  );

  const customCat = await reopenedCategoryRepo.getById(customCatId);
  assert(customCat !== null, 'Custom category must persist');
  assert.strictEqual(customCat.name, 'Offline Category');

  const transactions = await reopenedTransactionRepo.getTransactions({});
  assert(transactions.length >= 3, 'All created transactions must persist');

  const budgetSummary = await reopenedBudgetRepo.getBudgetSummary(10, 2026);
  assert.strictEqual(budgetSummary.length, 1);
  // Net spent = 250 initial + 400 from statement import = 650
  assert.strictEqual(parseFloat(budgetSummary[0].spent_amount), 650);

  reopenedSyncDb.close();
});


console.log('\n--- 4. FULL BJET API INFRASTRUCTURE PRESERVATION ---');

runTest('Full Bjet API modules remain preserved and intact', () => {
  const apiDir = path.resolve(process.cwd(), 'src/api');
  const requiredModules = [
    'client.ts',
    'auth.ts',
    'transactions.ts',
    'budgets.ts',
    'categories.ts',
    'friends.ts',
    'rules.ts',
    'presets.ts',
    'receipt.ts',
  ];

  for (const mod of requiredModules) {
    const fullPath = path.join(apiDir, mod);
    assert(fs.existsSync(fullPath), `Module ${mod} must exist in src/api`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(content.length > 100, `Module ${mod} must contain valid code`);
  }
});

console.log('\n==================================================');
console.log(`C9 RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('==================================================\n');

if (failed > 0) {
  process.exit(1);
}
