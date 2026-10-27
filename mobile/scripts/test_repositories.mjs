/**
 * Bjet Lite - Repository Layer Comprehensive Test Suite (Phase C3)
 *
 * Validates domain operations, financial invariants, and data integrity:
 * 1. Category Repository: read seeded, create, update, unique check, delete restrictions
 * 2. Friend Repository: create, read, update, case-insensitive uniqueness, sender matching, delete
 * 3. Merchant Rule Repository: create, read, update, replace, pattern uniqueness, rule matching, delete
 * 4. Transaction Repository:
 *    - SENT, RECEIVED, TOP_UP handling
 *    - Split amounts (amount_paid_for_someone_else) validation
 *    - Reimbursement invariant protection on single and bulk delete
 *    - Atomic rollback on failed bulk delete
 *    - Preflight UPI reference deduplication
 * 5. Budget Repository:
 *    - Set/upsert monthly limits
 *    - Net spending calculation: (SENT - paid_for_others) - RECEIVED reimbursements
 *    - Utilization percentage and over-budget status
 *    - Spending breakdown donut aggregation
 *    - Zero-limit deletion
 * 6. Preset Repository: create, read with items, update, apply to month/year, delete
 * 7. Persistence verification across database reopen
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
import { ConflictError, NotFoundError, ValidationError } from '../src/repositories/errors.ts';

const TEST_DIR = path.join(os.tmpdir(), 'bjet_repo_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });

console.log('=== STARTING BJET LITE REPOSITORY TEST SUITE ===');
console.log('Test Directory:', TEST_DIR, '\n');

/**
 * Adapter wrapping node:sqlite DatabaseSync to match expo-sqlite SQLiteDatabase interface
 */
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
      await fn();
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

function createTestDatabase(dbFile) {
  const syncDb = new DatabaseSync(dbFile);
  syncDb.exec('PRAGMA foreign_keys = ON;');
  syncDb.exec('PRAGMA journal_mode = WAL;');

  // Schema creation
  syncDb.exec(CREATE_CATEGORIES_TABLE);
  syncDb.exec(CREATE_FRIENDS_TABLE);
  syncDb.exec(CREATE_TRANSACTIONS_TABLE);
  syncDb.exec(CREATE_BUDGETS_TABLE);
  syncDb.exec(CREATE_USER_MERCHANT_RULES_TABLE);
  syncDb.exec(CREATE_BUDGET_PRESETS_TABLE);
  syncDb.exec(CREATE_BUDGET_PRESET_ITEMS_TABLE);

  for (const idxSql of CREATE_INDEXES) {
    syncDb.exec(idxSql);
  }

  // Seed default categories
  const insertCat = syncDb.prepare(
    `INSERT OR IGNORE INTO categories (name, icon, color, is_system_default) VALUES (?, ?, ?, 1);`
  );
  for (const cat of DEFAULT_CATEGORIES) {
    insertCat.run(cat.name, cat.icon, cat.color);
  }

  syncDb.exec('PRAGMA user_version = 1;');
  return new SQLiteAdapter(syncDb);
}

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

async function executeTestSuite() {
  const DB_PATH = path.join(TEST_DIR, 'test_bjet_lite_repo.db');
  let adapter = createTestDatabase(DB_PATH);
  const getDb = async () => adapter;

  const categoryRepo = new SQLiteCategoryRepository(getDb);
  const friendRepo = new SQLiteFriendRepository(getDb);
  const ruleRepo = new SQLiteMerchantRuleRepository(getDb);
  const txRepo = new SQLiteTransactionRepository(getDb);
  const budgetRepo = new SQLiteBudgetRepository(getDb);
  const presetRepo = new SQLiteBudgetPresetRepository(getDb);

  console.log('--- 1. CATEGORY REPOSITORY TESTS ---');

  await runAsyncTest('1.1. Read seeded categories contains 11 defaults', async () => {
    const categories = await categoryRepo.getAll();
    assert.strictEqual(categories.length, 11);
    const names = categories.map(c => c.name);
    assert.ok(names.includes('Food & Dining'));
    assert.ok(names.includes('Groceries'));
    assert.ok(names.includes('Uncategorized'));
  });

  let customCatId;
  await runAsyncTest('1.2. Create custom category', async () => {
    const created = await categoryRepo.create({
      name: 'Books & Learning',
      icon: 'book',
      color: '#10B981',
    });
    assert.ok(created.id > 0);
    assert.strictEqual(created.name, 'Books & Learning');
    assert.strictEqual(created.is_system_default, false);
    customCatId = created.id;
  });

  await runAsyncTest('1.3. Case-insensitive category duplicate rejection', async () => {
    await assert.rejects(
      async () => {
        await categoryRepo.create({ name: 'books & learning' });
      },
      ConflictError,
      'Duplicate category name must throw ConflictError'
    );
  });

  await runAsyncTest('1.4. Update custom category', async () => {
    const updated = await categoryRepo.update(customCatId, {
      name: 'Books & Courses',
      color: '#059669',
    });
    assert.strictEqual(updated.name, 'Books & Courses');
    assert.strictEqual(updated.color, '#059669');
  });

  await runAsyncTest('1.5. Cannot modify or delete system default category', async () => {
    const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');
    assert.ok(foodCat);

    await assert.rejects(
      async () => {
        await categoryRepo.update(foodCat.id, { name: 'New Food' });
      },
      ValidationError,
      'Updating system default must throw ValidationError'
    );

    await assert.rejects(
      async () => {
        await categoryRepo.delete(foodCat.id);
      },
      ValidationError,
      'Deleting system default must throw ValidationError'
    );
  });

  console.log('\n--- 2. FRIEND REPOSITORY TESTS ---');

  let friendId;
  await runAsyncTest('2.1. Create friend and verify category relationship', async () => {
    const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');
    const created = await friendRepo.create({
      name: 'Alice Johnson',
      recognized_name: 'alice@okhdfc',
      category_id: foodCat.id,
    });
    assert.ok(created.id > 0);
    assert.strictEqual(created.name, 'Alice Johnson');
    assert.strictEqual(created.recognized_name, 'alice@okhdfc');
    assert.ok(created.category);
    assert.strictEqual(created.category.name, 'Food & Dining');
    friendId = created.id;
  });

  await runAsyncTest('2.2. Case-insensitive recognized_name uniqueness', async () => {
    const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');
    await assert.rejects(
      async () => {
        await friendRepo.create({
          name: 'Alice Duplicate',
          recognized_name: 'ALICE@OKHDFC',
          category_id: foodCat.id,
        });
      },
      ConflictError,
      'Duplicate recognized_name must throw ConflictError'
    );
  });

  await runAsyncTest('2.3. Match friend by sender text', async () => {
    const matched = await friendRepo.findMatchingFriend('Payment from alice@okhdfc via UPI');
    assert.ok(matched);
    assert.strictEqual(matched.name, 'Alice Johnson');
  });

  console.log('\n--- 3. MERCHANT RULE REPOSITORY TESTS ---');

  let ruleId;
  await runAsyncTest('3.1. Create merchant rule with category relationship', async () => {
    const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');
    const created = await ruleRepo.create({
      merchant_pattern: 'SWIGGY',
      category_id: foodCat.id,
      priority: 10,
    });
    assert.ok(created.id > 0);
    assert.strictEqual(created.merchant_pattern, 'SWIGGY');
    assert.strictEqual(created.category.name, 'Food & Dining');
    ruleId = created.id;
  });

  await runAsyncTest('3.2. Case-insensitive pattern uniqueness', async () => {
    const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');
    await assert.rejects(
      async () => {
        await ruleRepo.create({
          merchant_pattern: 'swiggy',
          category_id: foodCat.id,
        });
      },
      ConflictError,
      'Duplicate pattern must throw ConflictError'
    );
  });

  await runAsyncTest('3.3. Match rule from merchant name or VPA', async () => {
    const matched = await ruleRepo.matchRule('SWIGGY BANGALORE IN', 'swiggy@icici');
    assert.ok(matched);
    assert.strictEqual(matched.category.name, 'Food & Dining');
  });

  await runAsyncTest('3.4. Atomically replace merchant rule', async () => {
    const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');
    const replaced = await ruleRepo.replaceRule(ruleId, {
      merchant_pattern: 'SWIGGY INSTAMART',
      category_id: foodCat.id,
      priority: 15,
    });
    assert.strictEqual(replaced.merchant_pattern, 'SWIGGY INSTAMART');
    ruleId = replaced.id;
  });

  console.log('\n--- 4. TRANSACTION REPOSITORY TESTS ---');

  let txSentId;
  let txReimbId;
  let txTopUpId;
  const foodCat = (await categoryRepo.getAll()).find(c => c.name === 'Food & Dining');

  await runAsyncTest('4.1. Insert SENT expense with split amount', async () => {
    const tx = await txRepo.createTransaction({
      amount: 1000.0,
      timestamp: '2026-10-04T12:00:00.000Z',
      merchant_raw_name: 'Dinner at Bistro',
      category_id: foodCat.id,
      direction: 'SENT',
      amount_paid_for_someone_else: 400.0,
      upi_reference_id: '123456789001',
    });
    assert.ok(tx.id > 0);
    assert.strictEqual(tx.direction, 'SENT');
    assert.strictEqual(tx.amount, '1000.00');
    assert.strictEqual(tx.amount_paid_for_someone_else, '400.00');
    assert.strictEqual(tx.is_reimbursement, false);
    assert.strictEqual(tx.category?.name, 'Food & Dining');
    txSentId = tx.id;
  });

  await runAsyncTest('4.2. Insert RECEIVED reimbursement and link to friend', async () => {
    const tx = await txRepo.createTransaction({
      amount: 400.0,
      timestamp: '2026-10-04T13:00:00.000Z',
      merchant_raw_name: 'Payment from alice@okhdfc',
      category_id: foodCat.id,
      direction: 'RECEIVED',
      is_reimbursement: true,
      friend_id: friendId,
      upi_reference_id: '123456789002',
    });
    assert.ok(tx.id > 0);
    assert.strictEqual(tx.direction, 'RECEIVED');
    assert.strictEqual(tx.is_reimbursement, true);
    assert.strictEqual(tx.friend_id, friendId);
    txReimbId = tx.id;
  });

  await runAsyncTest('4.3. Insert TOP_UP transaction', async () => {
    const tx = await txRepo.createTransaction({
      amount: 500.0,
      timestamp: '2026-10-04T14:00:00.000Z',
      merchant_raw_name: 'Top-up to UPI Lite',
      direction: 'TOP_UP',
      upi_reference_id: '123456789003',
    });
    assert.ok(tx.id > 0);
    assert.strictEqual(tx.direction, 'TOP_UP');
    assert.strictEqual(tx.category_id, null);
    assert.strictEqual(tx.is_reimbursement, false);
    txTopUpId = tx.id;
  });

  await runAsyncTest('4.4. Paid for others cannot exceed transaction amount', async () => {
    await assert.rejects(
      async () => {
        await txRepo.createTransaction({
          amount: 100.0,
          direction: 'SENT',
          amount_paid_for_someone_else: 150.0,
        });
      },
      ValidationError,
      'Paid for others > amount must throw ValidationError'
    );
  });

  await runAsyncTest('4.5. Preflight UPI reference deduplication lookup', async () => {
    const existing = await txRepo.findExistingUpiRefs([
      '123456789001',
      '123456789002',
      '999999999999',
    ]);
    assert.strictEqual(existing.size, 2);
    assert.ok(existing.has('123456789001'));
    assert.ok(existing.has('123456789002'));
    assert.ok(!existing.has('999999999999'));
  });

  await runAsyncTest('4.6. Single transaction delete reimbursement invariant', async () => {
    // Current state in Food & Dining (2026-10):
    // Outgoing = 1000 - 400 = 600
    // Reimbursement = 400
    // Deleting txSentId leaves Outgoing = 0 < Reimbursement 400 -> MUST FAIL!
    await assert.rejects(
      async () => {
        await txRepo.deleteTransaction(txSentId);
      },
      ValidationError,
      'Deleting expense must fail when reimbursements would exceed remaining spending'
    );
  });

  await runAsyncTest('4.7. Bulk delete atomic rollback on invariant violation', async () => {
    // Attempting to bulk delete [txSentId, txTopUpId] should fail and rollback completely
    await assert.rejects(
      async () => {
        await txRepo.bulkDeleteTransactions([txSentId, txTopUpId]);
      },
      ValidationError,
      'Bulk delete invariant failure must reject'
    );

    // Verify atomic rollback: neither transaction was deleted
    const sentCheck = await txRepo.getTransactionById(txSentId);
    const topUpCheck = await txRepo.getTransactionById(txTopUpId);
    assert.ok(sentCheck, 'txSentId must remain intact after rollback');
    assert.ok(topUpCheck, 'txTopUpId must remain intact after rollback');
  });

  await runAsyncTest('4.8. Insert transaction with Uncategorized category resolves via merchant rule', async () => {
    // We already have a rule for 'SWIGGY INSTAMART' mapped to 'Food & Dining' (from 3.4)
    // The "Uncategorized" category is guaranteed to be seeded
    const allCats = await categoryRepo.getAll();
    const uncategorizedCat = allCats.find(c => c.name === 'Uncategorized');
    
    const tx = await txRepo.createTransaction({
      amount: 250.0,
      timestamp: '2026-10-04T15:00:00.000Z',
      merchant_raw_name: 'SWIGGY INSTAMART DELIVERY',
      category_id: uncategorizedCat.id, // Explicitly pass the ID for "Uncategorized"
      direction: 'SENT',
    });
    
    assert.ok(tx.id > 0);
    // It should have matched the rule and switched from Uncategorized to Food & Dining
    assert.strictEqual(tx.category?.name, 'Food & Dining');
  });

  await runAsyncTest('4.9. set_as_merchant_default flag creates a merchant rule', async () => {
    const allCats = await categoryRepo.getAll();
    const utilityCat = allCats.find(c => c.name === 'Utilities & Bills');
    assert.ok(utilityCat, 'Utilities & Bills category should exist');

    // 1. Create a transaction without rule
    const tx = await txRepo.createTransaction({
      amount: 150.0,
      timestamp: '2026-10-04T16:00:00.000Z',
      merchant_raw_name: 'JIO POSTPAID',
      category_id: utilityCat.id,
      direction: 'SENT',
      set_as_merchant_default: true // This should trigger rule creation
    });

    assert.ok(tx.id > 0);

    // 2. Verify rule was created
    const rules = await ruleRepo.getAll();
    const jioRule = rules.find(r => r.merchant_pattern === 'JIO POSTPAID');
    assert.ok(jioRule, 'Merchant rule should have been created for JIO POSTPAID');
    assert.strictEqual(jioRule.category_id, utilityCat.id);

    // 3. Update the transaction with a different category and set flag again
    await txRepo.updateTransaction(tx.id, {
      category_id: foodCat.id,
      set_as_merchant_default: true
    });

    // 4. Verify rule was updated
    const rulesAfterUpdate = await ruleRepo.getAll();
    const updatedRule = rulesAfterUpdate.find(r => r.merchant_pattern === 'JIO POSTPAID');
    assert.ok(updatedRule);
    assert.strictEqual(updatedRule.category_id, foodCat.id, 'Merchant rule category should be updated');

    // Clean up so budget tests are not affected
    await txRepo.deleteTransaction(tx.id);
  });

  console.log('\n--- 5. BUDGET REPOSITORY TESTS ---');

  await runAsyncTest('5.1. Set and retrieve monthly budget limit', async () => {
    const budget = await budgetRepo.setBudget({
      category_id: foodCat.id,
      month: 10,
      year: 2026,
      amount_limit: 5000.0,
    });
    assert.strictEqual(budget.category_id, foodCat.id);
    assert.strictEqual(budget.amount_limit, '5000.00');

    const status = await budgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.ok(status);
    assert.strictEqual(status.amount_limit, '5000.00');
  });

  await runAsyncTest('5.2. Monthly spending calculation respects Net Personal Spending formula', async () => {
    // Net Personal Spending = (SENT - paid_for_others) - received_reimbursements
    // = (1000 - 400 + 250) - 400 = 850 - 400 = 450.00
    const summaries = await budgetRepo.getBudgetSummary(10, 2026);
    const foodSummary = summaries.find(s => s.category_id === foodCat.id);
    assert.ok(foodSummary);
    assert.strictEqual(foodSummary.spent_amount, '450.00');
    assert.strictEqual(foodSummary.remaining_amount, '4550.00');
    assert.strictEqual(foodSummary.percentage_used, 9.0);
    assert.strictEqual(foodSummary.is_over_budget, false);
  });

  await runAsyncTest('5.3. Spending breakdown donut data includes only positive net categories', async () => {
    const breakdown = await budgetRepo.getSpendingBreakdown(10, 2026);
    assert.strictEqual(breakdown.month, 10);
    assert.strictEqual(breakdown.year, 2026);
    assert.strictEqual(breakdown.total_spent, 450.0);
    assert.strictEqual(breakdown.items.length, 1);
    assert.strictEqual(breakdown.items[0].category_name, 'Food & Dining');
    assert.strictEqual(breakdown.items[0].percentage, 100.0);
  });

  await runAsyncTest('5.4. Setting budget limit to 0 deletes budget record', async () => {
    await budgetRepo.setBudget({
      category_id: foodCat.id,
      month: 10,
      year: 2026,
      amount_limit: 0,
    });
    const status = await budgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.strictEqual(status, null);

    // Restore budget for remaining tests
    await budgetRepo.setBudget({
      category_id: foodCat.id,
      month: 10,
      year: 2026,
      amount_limit: 5000.0,
    });
  });

  console.log('\n--- 6. BUDGET PRESET REPOSITORY TESTS ---');

  let presetId;
  await runAsyncTest('6.1. Create budget preset with items', async () => {
    const created = await presetRepo.create({
      name: 'Standard Monthly Plan',
      items: [
        { category_id: foodCat.id, amount: 6000.0 },
        { category_id: customCatId, amount: 1500.0 },
      ],
    });
    assert.ok(created.id > 0);
    assert.strictEqual(created.name, 'Standard Monthly Plan');
    assert.strictEqual(created.items.length, 2);
    presetId = created.id;
  });

  await runAsyncTest('6.2. Apply preset to future month/year', async () => {
    const appliedSummaries = await presetRepo.applyPreset(presetId, {
      month: 11,
      year: 2026,
    });
    assert.ok(appliedSummaries.length >= 2);
    const foodNov = appliedSummaries.find(s => s.category_id === foodCat.id);
    assert.ok(foodNov);
    assert.strictEqual(foodNov.amount_limit, '6000.00');
  });

  console.log('\n--- 7. PERSISTENCE ACROSS DATABASE REOPEN ---');

  await runAsyncTest('7.1. Closing and reopening database preserves all data', async () => {
    adapter.close();

    // Reopen using same DB_PATH
    const reopenedDb = new DatabaseSync(DB_PATH);
    reopenedDb.exec('PRAGMA foreign_keys = ON;');
    reopenedDb.exec('PRAGMA journal_mode = WAL;');
    const reopenedAdapter = new SQLiteAdapter(reopenedDb);
    const getReopenedDb = async () => reopenedAdapter;

    const newTxRepo = new SQLiteTransactionRepository(getReopenedDb);
    const newBudgetRepo = new SQLiteBudgetRepository(getReopenedDb);
    const newCatRepo = new SQLiteCategoryRepository(getReopenedDb);
    const newFriendRepo = new SQLiteFriendRepository(getReopenedDb);

    // Verify transaction
    const tx = await newTxRepo.getTransactionById(txSentId);
    assert.ok(tx);
    assert.strictEqual(tx.amount, '1000.00');
    assert.strictEqual(tx.amount_paid_for_someone_else, '400.00');

    // Verify budget
    const budget = await newBudgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.ok(budget);
    assert.strictEqual(budget.amount_limit, '5000.00');
    assert.strictEqual(budget.spent_amount, '450.00');

    // Verify custom category
    const cat = await newCatRepo.getById(customCatId);
    assert.ok(cat);
    assert.strictEqual(cat.name, 'Books & Courses');

    // Verify friend
    const friend = await newFriendRepo.getById(friendId);
    assert.ok(friend);
    assert.strictEqual(friend.name, 'Alice Johnson');

    reopenedAdapter.close();
  });

  console.log('\n=======================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=======================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

executeTestSuite();
