/**
 * Bjet Lite - Friend Migration Test Suite (Phase C7)
 *
 * Validates the core local SQLite Friend data flow, repository integration,
 * recognized name matching, reimbursement workflows, and API preservation:
 *
 * 1. FRIEND CRUD & VALIDATION
 *    - Create friend with target reimbursement category
 *    - Retrieve friend by ID with joined category
 *    - List all friends ordered by name
 *    - Duplicate recognized name rejected (case-insensitive)
 *    - Update friend name, recognized name, and target category
 *    - Delete friend
 *    - Missing category throws NotFoundError
 *    - Blank name or recognized name throws ValidationError
 *
 * 2. MATCHING & REIMBURSEMENT WORKFLOWS
 *    - Case-insensitive substring matching against incoming sender text
 *    - Incoming RECEIVED transaction automatically matches friend recognized name
 *    - Transaction is marked as reimbursement (is_reimbursement = 1)
 *    - Transaction is automatically assigned friend's default category
 *    - Explicit non-reimbursement override is respected
 *    - User-specified category override is respected
 *
 * 3. DELETION & FINANCIAL INTEGRITY
 *    - Deleting friend sets transaction friend_id to NULL (ON DELETE SET NULL)
 *    - Existing transaction record, amount, and timestamp remain intact
 *    - is_reimbursement = 1 and category_id remain intact
 *    - Monthly budget personal net spending calculation remains 100% correct
 *
 * 4. PERSISTENCE & DATABASE REOPEN
 *    - Close database and reopen
 *    - Verify friends and linked transactions persist
 *
 * 5. API INTEGRITY
 *    - Full Bjet src/api/friends.ts remains intact and fully exported
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

import { SQLiteFriendRepository } from '../src/repositories/friendRepository.ts';
import { SQLiteCategoryRepository } from '../src/repositories/categoryRepository.ts';
import { SQLiteTransactionRepository } from '../src/repositories/transactionRepository.ts';
import { SQLiteBudgetRepository } from '../src/repositories/budgetRepository.ts';
import { ConflictError, ValidationError, NotFoundError } from '../src/repositories/errors.ts';

const TEST_DIR = path.join(os.tmpdir(), 'bjet_c7_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const DB_PATH = path.join(TEST_DIR, 'bjet_lite_c7.db');

console.log('=== STARTING BJET LITE FRIEND MIGRATION TEST SUITE (PHASE C7) ===');
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
  for (const indexSql of CREATE_INDEXES) {
    db.exec(indexSql);
  }

  // Seed default categories
  const stmt = db.prepare(`
    INSERT INTO categories (name, icon, color, is_system_default)
    VALUES (?, ?, ?, 1);
  `);
  for (const cat of DEFAULT_CATEGORIES) {
    stmt.run(cat.name, cat.icon, cat.color);
  }

  return db;
}

let syncDb = initTestDb(DB_PATH);
let adapter = new SQLiteAdapter(syncDb);
const getDb = async () => adapter;

const friendRepo = new SQLiteFriendRepository(getDb);
const catRepo = new SQLiteCategoryRepository(getDb);
const txRepo = new SQLiteTransactionRepository(getDb);
const budgetRepo = new SQLiteBudgetRepository(getDb);

async function runAllTests() {
  console.log('--- 1. FRIEND CRUD & VALIDATION ---');

  let foodCat, utilCat;
  let friend1;

  await runAsyncTest('Setup initial categories', async () => {
    const categories = await catRepo.getAll();
    foodCat = categories.find(c => c.name === 'Food & Dining');
    utilCat = categories.find(c => c.name === 'Utilities & Bills');
    assert.ok(foodCat, 'Food & Dining category must exist');
    assert.ok(utilCat, 'Utilities & Bills category must exist');
  });

  await runAsyncTest('Create friend with target category', async () => {
    friend1 = await friendRepo.create({
      name: 'Rohan Sharma',
      recognized_name: 'rohan',
      category_id: foodCat.id,
    });
    assert.ok(friend1.id > 0);
    assert.strictEqual(friend1.name, 'Rohan Sharma');
    assert.strictEqual(friend1.recognized_name, 'rohan');
    assert.strictEqual(friend1.category_id, foodCat.id);
    assert.strictEqual(friend1.category.name, 'Food & Dining');
  });

  await runAsyncTest('Get friend by ID and list all friends', async () => {
    const fetched = await friendRepo.getById(friend1.id);
    assert.ok(fetched);
    assert.strictEqual(fetched.name, 'Rohan Sharma');
    assert.strictEqual(fetched.category.name, 'Food & Dining');

    const all = await friendRepo.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].name, 'Rohan Sharma');
  });

  await runAsyncTest('Duplicate recognized name is rejected (case-insensitive)', async () => {
    await assert.rejects(
      async () => friendRepo.create({
        name: 'Rohan Brother',
        recognized_name: 'ROHAN',
        category_id: foodCat.id,
      }),
      ConflictError
    );
  });

  await runAsyncTest('Update friend details and target category', async () => {
    const updated = await friendRepo.update(friend1.id, {
      name: 'Rohan S.',
      recognized_name: 'rohan sharma',
      category_id: utilCat.id,
    });
    assert.strictEqual(updated.name, 'Rohan S.');
    assert.strictEqual(updated.recognized_name, 'rohan sharma');
    assert.strictEqual(updated.category_id, utilCat.id);
    assert.strictEqual(updated.category.name, 'Utilities & Bills');

    // Switch back to 'rohan' and foodCat for matching tests
    await friendRepo.update(friend1.id, {
      name: 'Rohan Sharma',
      recognized_name: 'rohan',
      category_id: foodCat.id,
    });
  });

  await runAsyncTest('Validation error on blank name or invalid category', async () => {
    // Blank name
    await assert.rejects(
      async () => friendRepo.create({ name: '   ', recognized_name: 'test', category_id: foodCat.id }),
      ValidationError
    );
    // Blank recognized name
    await assert.rejects(
      async () => friendRepo.create({ name: 'Test', recognized_name: '', category_id: foodCat.id }),
      ValidationError
    );
    // Non-existent category
    await assert.rejects(
      async () => friendRepo.create({ name: 'Test', recognized_name: 'test', category_id: 99999 }),
      NotFoundError
    );
  });

  console.log('\n--- 2. MATCHING & REIMBURSEMENT WORKFLOWS ---');

  await runAsyncTest('findMatchingFriend matches case-insensitively', async () => {
    const match1 = await friendRepo.findMatchingFriend('Payment from ROHAN via UPI');
    assert.ok(match1);
    assert.strictEqual(match1.id, friend1.id);

    const match2 = await friendRepo.findMatchingFriend('rohan sent money');
    assert.ok(match2);
    assert.strictEqual(match2.id, friend1.id);

    const matchNone = await friendRepo.findMatchingFriend('Payment from Priya');
    assert.strictEqual(matchNone, null);
  });

  let reimbTx;

  await runAsyncTest('Incoming RECEIVED transaction automatically matches friend', async () => {
    reimbTx = await txRepo.createTransaction({
      amount: 1200,
      direction: 'RECEIVED',
      merchant_raw_name: 'UPI / Rohan Sharma / Dinner Share',
      timestamp: '2026-10-08T15:00:00Z',
    });

    assert.strictEqual(reimbTx.direction, 'RECEIVED');
    assert.strictEqual(reimbTx.is_reimbursement, true);
    assert.strictEqual(reimbTx.friend_id, friend1.id);
    assert.strictEqual(reimbTx.category_id, foodCat.id, 'Must inherit friend target reimbursement category');
    assert.ok(reimbTx.friend);
    assert.strictEqual(reimbTx.friend.name, 'Rohan Sharma');
  });

  await runAsyncTest('Explicit non-reimbursement override is respected', async () => {
    const nonReimbTx = await txRepo.createTransaction({
      amount: 5000,
      direction: 'RECEIVED',
      merchant_raw_name: 'UPI / Rohan Sharma / Salary advance',
      is_reimbursement: false,
      timestamp: '2026-10-09T10:00:00Z',
    });

    assert.strictEqual(nonReimbTx.direction, 'RECEIVED');
    assert.strictEqual(nonReimbTx.is_reimbursement, false);
  });

  await runAsyncTest('Explicit category override is respected when friend is matched', async () => {
    const customCatTx = await txRepo.createTransaction({
      amount: 800,
      direction: 'RECEIVED',
      merchant_raw_name: 'Rohan share for electricity',
      category_id: utilCat.id,
      timestamp: '2026-10-10T10:00:00Z',
    });

    assert.strictEqual(customCatTx.is_reimbursement, true);
    assert.strictEqual(customCatTx.friend_id, friend1.id);
    assert.strictEqual(customCatTx.category_id, utilCat.id, 'Explicit category must override friend default');
  });

  console.log('\n--- 3. DELETION & FINANCIAL INTEGRITY ---');

  await runAsyncTest('Deleting friend sets transaction friend_id to NULL without altering spending', async () => {
    // Check initial transaction before friend deletion
    const beforeTx = await txRepo.getTransactionById(reimbTx.id);
    assert.strictEqual(beforeTx.friend_id, friend1.id);

    // Delete friend
    await friendRepo.delete(friend1.id);

    // Friend must no longer exist
    const checkFriend = await friendRepo.getById(friend1.id);
    assert.strictEqual(checkFriend, null);

    // Transaction must still exist, with friend_id set to NULL
    const afterTx = await txRepo.getTransactionById(reimbTx.id);
    assert.ok(afterTx, 'Transaction record must be preserved');
    assert.strictEqual(afterTx.friend_id, null, 'friend_id must be nullified (ON DELETE SET NULL)');
    assert.strictEqual(afterTx.is_reimbursement, true, 'is_reimbursement must remain true');
    assert.strictEqual(afterTx.category_id, foodCat.id, 'category_id must remain intact');
    assert.strictEqual(afterTx.amount, '1200.00', 'amount must remain intact');
  });

  await runAsyncTest('Reimbursement calculations remain correct after friend deletion', async () => {
    // Setup expense for Food (3000)
    await txRepo.createTransaction({
      amount: 3000,
      direction: 'SENT',
      category_id: foodCat.id,
      timestamp: '2026-10-07T12:00:00Z',
      notes: 'Group dinner outlay',
    });

    // We already have reimbTx in Food for 1200 (reimbursed by Rohan who was deleted)
    // Net food spending must be: 3000 - 1200 = 1800
    await budgetRepo.setBudget({ category_id: foodCat.id, month: 10, year: 2026, amount_limit: 5000 });
    const foodStatus = await budgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.ok(foodStatus);
    assert.strictEqual(foodStatus.spent_amount, '1800.00', 'Net personal spending must remain exact after friend deletion');
  });

  console.log('\n--- 4. PERSISTENCE & DATABASE REOPEN ---');

  await runAsyncTest('Friends and linkages persist across database close and reopen', async () => {
    // Create new friend 'Priya'
    const priya = await friendRepo.create({
      name: 'Priya Patel',
      recognized_name: 'priya',
      category_id: utilCat.id,
    });

    // Close and reopen
    adapter.close();
    const reopenedDb = new DatabaseSync(DB_PATH);
    const reopenedAdapter = new SQLiteAdapter(reopenedDb);
    const reopenedFriendRepo = new SQLiteFriendRepository(async () => reopenedAdapter);

    const fetchedPriya = await reopenedFriendRepo.getById(priya.id);
    assert.ok(fetchedPriya, 'Priya must persist after reopen');
    assert.strictEqual(fetchedPriya.name, 'Priya Patel');
    assert.strictEqual(fetchedPriya.recognized_name, 'priya');
    assert.strictEqual(fetchedPriya.category.name, 'Utilities & Bills');

    reopenedAdapter.close();
  });

  console.log('\n--- 5. API INTEGRITY ---');

  await runAsyncTest('Full Bjet src/api/friends.ts remains intact', async () => {
    const friendsApiPath = path.resolve('src/api/friends.ts');
    assert.ok(fs.existsSync(friendsApiPath), 'src/api/friends.ts must exist');

    const content = fs.readFileSync(friendsApiPath, 'utf-8');
    assert.ok(content.includes('export async function getFriendsApi'), 'getFriendsApi must be exported');
    assert.ok(content.includes('export async function createFriendApi'), 'createFriendApi must be exported');
    assert.ok(content.includes('export async function updateFriendApi'), 'updateFriendApi must be exported');
    assert.ok(content.includes('export async function deleteFriendApi'), 'deleteFriendApi must be exported');
  });

  console.log('\n==================================================');
  console.log(`C7 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================\n');

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup error
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
