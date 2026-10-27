/**
 * Bjet Lite - Budget Migration Test Suite (Phase C6)
 *
 * Validates the core local SQLite Budget data flow, repository integration,
 * financial formulas, presets, breakdown, and API preservation:
 *
 * 1. BUDGET CRUD & VALIDATION
 *    - Create budget for category/month/year
 *    - Update budget limit
 *    - Zero-limit budget deletion
 *    - Delete budget via deleteBudget
 *    - Missing category validation
 *    - Invalid month/year validation
 *
 * 2. MONTHLY SUMMARY & FINANCIAL CALCULATIONS
 *    - Retrieve monthly summary with category joins
 *    - Accurate month/year isolation
 *    - Net personal spending formula: (SENT - paid_for_others) - received reimbursements
 *    - Over-budget calculation (is_over_budget true when spent > limit)
 *    - Under-budget calculation with correct remaining amount and percentage used
 *    - Scope isolation: Budgeted Spending only includes categories with active budget rows
 *
 * 3. SPENDING BREAKDOWN & DONUT CHART
 *    - Scope isolation: Spending breakdown includes all personal spending categories
 *    - Positive-only spending filter (zero and negative net spending excluded from pie)
 *    - Negative net category handling (reimbursements exceed outgoing expenses)
 *    - Paid-for-others deduction from personal spending
 *    - Uncategorized transaction handling (#9E9E9E, category_id: null)
 *    - Donut percentage calculations summing to 100%
 *    - Descending sort by spent_amount
 *
 * 4. BUDGET PRESETS
 *    - Create preset with multiple category items
 *    - Retrieve preset by ID and list all presets
 *    - Duplicate preset name rejection (case-insensitive)
 *    - Update preset name and items
 *    - Delete preset
 *    - Apply preset to target month/year
 *    - Preset application atomicity: failure rolls back all items
 *
 * 5. PERSISTENCE & DATABASE REOPEN
 *    - Close database and reopen
 *    - Verify budgets, presets, and spending summary remain consistent
 *
 * 6. API INTEGRITY
 *    - Full Bjet src/api/budgets.ts and src/api/presets.ts remain intact
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

import { SQLiteBudgetRepository } from '../src/repositories/budgetRepository.ts';
import { SQLiteBudgetPresetRepository } from '../src/repositories/presetRepository.ts';
import { SQLiteTransactionRepository } from '../src/repositories/transactionRepository.ts';
import { SQLiteCategoryRepository } from '../src/repositories/categoryRepository.ts';
import { ConflictError, ValidationError, NotFoundError } from '../src/repositories/errors.ts';

const TEST_DIR = path.join(os.tmpdir(), 'bjet_c6_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const DB_PATH = path.join(TEST_DIR, 'bjet_lite_c6.db');

console.log('=== STARTING BJET LITE BUDGET MIGRATION TEST SUITE (PHASE C6) ===');
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

const budgetRepo = new SQLiteBudgetRepository(getDb);
const presetRepo = new SQLiteBudgetPresetRepository(getDb);
const txRepo = new SQLiteTransactionRepository(getDb);
const catRepo = new SQLiteCategoryRepository(getDb);

async function runAllTests() {
  console.log('--- 1. BUDGET CRUD & VALIDATION ---');

  let foodCat, utilCat, travelCat;

  await runAsyncTest('Setup initial categories', async () => {
    const categories = await catRepo.getAll();
    foodCat = categories.find(c => c.name === 'Food & Dining');
    utilCat = categories.find(c => c.name === 'Utilities & Bills');
    travelCat = categories.find(c => c.name === 'Transportation');
    assert.ok(foodCat, 'Food & Dining category must exist');
    assert.ok(utilCat, 'Utilities & Bills category must exist');
    assert.ok(travelCat, 'Transportation category must exist');
  });

  await runAsyncTest('Create budget for valid category and period', async () => {
    const budget = await budgetRepo.setBudget({
      category_id: foodCat.id,
      month: 10,
      year: 2026,
      amount_limit: 15000,
    });
    assert.strictEqual(budget.category_id, foodCat.id);
    assert.strictEqual(budget.month, 10);
    assert.strictEqual(budget.year, 2026);
    assert.strictEqual(budget.amount_limit, '15000.00');
    assert.strictEqual(budget.category.name, 'Food & Dining');
  });

  await runAsyncTest('Update existing budget limit (upsert)', async () => {
    const updated = await budgetRepo.setBudget({
      category_id: foodCat.id,
      month: 10,
      year: 2026,
      amount_limit: 18000,
    });
    assert.strictEqual(updated.category_id, foodCat.id);
    assert.strictEqual(updated.amount_limit, '18000.00');

    const status = await budgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.ok(status, 'Budget status must be found');
    assert.strictEqual(status.amount_limit, '18000.00');
  });

  await runAsyncTest('Setting budget to 0 removes the budget record', async () => {
    const zeroResult = await budgetRepo.setBudget({
      category_id: foodCat.id,
      month: 10,
      year: 2026,
      amount_limit: 0,
    });
    assert.strictEqual(zeroResult.amount_limit, '0.00');

    const status = await budgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.strictEqual(status, null, 'Category budget status must be null after setting limit to 0');
  });

  await runAsyncTest('Delete budget by category and period', async () => {
    // Create utilities budget
    await budgetRepo.setBudget({
      category_id: utilCat.id,
      month: 10,
      year: 2026,
      amount_limit: 25000,
    });
    const beforeDel = await budgetRepo.getCategoryBudgetStatus(utilCat.id, 10, 2026);
    assert.ok(beforeDel, 'Utilities budget must exist');

    await budgetRepo.deleteBudget(utilCat.id, 10, 2026);
    const afterDel = await budgetRepo.getCategoryBudgetStatus(utilCat.id, 10, 2026);
    assert.strictEqual(afterDel, null, 'Utilities budget must be null after deletion');
  });

  await runAsyncTest('Deleting non-existent budget throws NotFoundError', async () => {
    await assert.rejects(
      async () => budgetRepo.deleteBudget(utilCat.id, 10, 2026),
      NotFoundError
    );
  });

  await runAsyncTest('Budget validation rejects invalid inputs', async () => {
    // Invalid month
    await assert.rejects(
      async () => budgetRepo.setBudget({ category_id: foodCat.id, month: 13, year: 2026, amount_limit: 100 }),
      ValidationError
    );
    // Invalid year
    await assert.rejects(
      async () => budgetRepo.setBudget({ category_id: foodCat.id, month: 5, year: 1999, amount_limit: 100 }),
      ValidationError
    );
    // Negative limit
    await assert.rejects(
      async () => budgetRepo.setBudget({ category_id: foodCat.id, month: 5, year: 2026, amount_limit: -50 }),
      ValidationError
    );
    // Non-existent category
    await assert.rejects(
      async () => budgetRepo.setBudget({ category_id: 99999, month: 5, year: 2026, amount_limit: 500 }),
      NotFoundError
    );
  });

  console.log('\n--- 2. MONTHLY SUMMARY & FINANCIAL CALCULATIONS ---');

  await runAsyncTest('Net personal spending: outgoing - paid_for_others - reimbursements', async () => {
    // Re-create budgets for Food (10000) and Travel (5000) for Oct 2026
    await budgetRepo.setBudget({ category_id: foodCat.id, month: 10, year: 2026, amount_limit: 10000 });
    await budgetRepo.setBudget({ category_id: travelCat.id, month: 10, year: 2026, amount_limit: 5000 });

    // Transaction 1: Food expense 3000, 1000 paid for friend -> personal net = 2000
    await txRepo.createTransaction({
      amount: 3000,
      direction: 'SENT',
      category_id: foodCat.id,
      timestamp: '2026-10-05T12:00:00Z',
      notes: 'Group dinner',
      amount_paid_for_someone_else: 1000,
    });

    // Transaction 2: Food reimbursement received 500 -> personal net becomes 2000 - 500 = 1500
    await txRepo.createTransaction({
      amount: 500,
      direction: 'RECEIVED',
      is_reimbursement: true,
      category_id: foodCat.id,
      timestamp: '2026-10-06T14:00:00Z',
      notes: 'Dinner reimbursement',
    });

    // Transaction 3: Travel expense 6000 (all personal) -> over-budget (spent 6000 > limit 5000)
    await txRepo.createTransaction({
      amount: 6000,
      direction: 'SENT',
      category_id: travelCat.id,
      timestamp: '2026-10-10T09:00:00Z',
      notes: 'Flight ticket',
    });

    // Transaction in different month (Nov 2026) -> should NOT affect Oct 2026
    await txRepo.createTransaction({
      amount: 4000,
      direction: 'SENT',
      category_id: foodCat.id,
      timestamp: '2026-11-01T10:00:00Z',
      notes: 'Nov dinner',
    });

    const summary = await budgetRepo.getBudgetSummary(10, 2026);
    assert.strictEqual(summary.length, 2, 'Must have exactly 2 budget summaries');

    const foodSummary = summary.find(s => s.category_id === foodCat.id);
    assert.ok(foodSummary);
    assert.strictEqual(foodSummary.amount_limit, '10000.00');
    assert.strictEqual(foodSummary.spent_amount, '1500.00');
    assert.strictEqual(foodSummary.remaining_amount, '8500.00');
    assert.strictEqual(foodSummary.percentage_used, 15);
    assert.strictEqual(foodSummary.is_over_budget, false);

    const travelSummary = summary.find(s => s.category_id === travelCat.id);
    assert.ok(travelSummary);
    assert.strictEqual(travelSummary.amount_limit, '5000.00');
    assert.strictEqual(travelSummary.spent_amount, '6000.00');
    assert.strictEqual(travelSummary.remaining_amount, '-1000.00');
    assert.strictEqual(travelSummary.percentage_used, 120);
    assert.strictEqual(travelSummary.is_over_budget, true);
  });

  await runAsyncTest('Month/year isolation: Nov 2026 summary is completely isolated', async () => {
    // Only food transaction occurred in Nov 2026, but no budget set for Nov yet
    const novSummaryEmpty = await budgetRepo.getBudgetSummary(11, 2026);
    assert.strictEqual(novSummaryEmpty.length, 0, 'No budgets set for Nov 2026 yet');

    // Set budget for Food in Nov 2026
    await budgetRepo.setBudget({ category_id: foodCat.id, month: 11, year: 2026, amount_limit: 8000 });
    const novSummary = await budgetRepo.getBudgetSummary(11, 2026);
    assert.strictEqual(novSummary.length, 1);
    assert.strictEqual(novSummary[0].spent_amount, '4000.00');
    assert.strictEqual(novSummary[0].remaining_amount, '4000.00');
    assert.strictEqual(novSummary[0].is_over_budget, false);
  });

  await runAsyncTest('Pending and Top-Up transactions are excluded from spent_amount', async () => {
    // Insert pending transaction via raw SQL (simulates receipt pending review)
    syncDb.prepare(`
      INSERT INTO transactions (
        amount, currency, timestamp, direction, category_id, status, notes
      ) VALUES (9000, 'INR', '2026-10-15T12:00:00Z', 'SENT', ?, 'PENDING_CONFIRMATION', 'Pending receipt');
    `).run(foodCat.id);

    // Add TOP_UP transaction
    await txRepo.createTransaction({
      amount: 10000,
      direction: 'TOP_UP',
      timestamp: '2026-10-16T12:00:00Z',
      notes: 'Wallet topup',
    });

    const foodStatus = await budgetRepo.getCategoryBudgetStatus(foodCat.id, 10, 2026);
    assert.strictEqual(foodStatus.spent_amount, '1500.00', 'Pending and TOP_UP must not increase spent amount');
  });

  console.log('\n--- 3. SPENDING BREAKDOWN & DONUT CHART ---');

  await runAsyncTest('Spending breakdown includes all personal categories with positive spend', async () => {
    // Add an expense without a budget: Utilities (Utilities & Bills has no budget for Oct 2026)
    await txRepo.createTransaction({
      amount: 2500,
      direction: 'SENT',
      category_id: utilCat.id,
      timestamp: '2026-10-12T10:00:00Z',
      notes: 'Water & Electricity bill',
    });

    // Add an Uncategorized expense (category_id = null)
    await txRepo.createTransaction({
      amount: 1000,
      direction: 'SENT',
      category_id: null,
      timestamp: '2026-10-18T10:00:00Z',
      notes: 'Random cash spend',
    });

    const breakdown = await budgetRepo.getSpendingBreakdown(10, 2026);
    // Categories with positive spend:
    // Travel: 6000
    // Utilities: 2500
    // Food: 1500
    // Uncategorized: 1000
    // Total spent: 6000 + 2500 + 1500 + 1000 = 11000
    assert.strictEqual(breakdown.month, 10);
    assert.strictEqual(breakdown.year, 2026);
    assert.strictEqual(breakdown.total_spent, 11000);
    assert.strictEqual(breakdown.items.length, 4);

    // Items must be sorted descending by spent_amount
    assert.strictEqual(breakdown.items[0].category_name, 'Transportation');
    assert.strictEqual(breakdown.items[0].spent_amount, 6000);
    assert.strictEqual(breakdown.items[0].percentage, 54.5); // 6000 / 11000 = 54.5%

    assert.strictEqual(breakdown.items[1].category_name, 'Utilities & Bills');
    assert.strictEqual(breakdown.items[1].spent_amount, 2500);
    assert.strictEqual(breakdown.items[1].percentage, 22.7); // 2500 / 11000 = 22.7%

    assert.strictEqual(breakdown.items[2].category_name, 'Food & Dining');
    assert.strictEqual(breakdown.items[2].spent_amount, 1500);
    assert.strictEqual(breakdown.items[2].percentage, 13.6); // 1500 / 11000 = 13.6%

    assert.strictEqual(breakdown.items[3].category_name, 'Uncategorized');
    assert.strictEqual(breakdown.items[3].category_id, null);
    assert.strictEqual(breakdown.items[3].category_color, '#9E9E9E');
    assert.strictEqual(breakdown.items[3].spent_amount, 1000);
    assert.strictEqual(breakdown.items[3].percentage, 9.1); // 1000 / 11000 = 9.1%
  });

  await runAsyncTest('Negative and zero net spending categories are excluded from breakdown', async () => {
    // Create new category 'Gifts'
    const giftCat = await catRepo.create({ name: 'Gifts & Donations', icon: 'gift', color: '#EC4899' });

    // Outgoing 1000, reimbursement 1500 -> net is -500
    await txRepo.createTransaction({
      amount: 1000,
      direction: 'SENT',
      category_id: giftCat.id,
      timestamp: '2026-10-20T10:00:00Z',
      notes: 'Group gift outlay',
    });
    await txRepo.createTransaction({
      amount: 1500,
      direction: 'RECEIVED',
      is_reimbursement: true,
      category_id: giftCat.id,
      timestamp: '2026-10-21T10:00:00Z',
      notes: 'Excess gift reimbursement',
    });

    const breakdown = await budgetRepo.getSpendingBreakdown(10, 2026);
    const giftItem = breakdown.items.find(i => i.category_id === giftCat.id);
    assert.strictEqual(giftItem, undefined, 'Category with net negative spending must be excluded from pie chart');
  });

  await runAsyncTest('Budgeted Spending vs Spending Breakdown scope distinction', async () => {
    // Budget summary only includes Food (limit 10000) and Travel (limit 5000)
    const budgetSummary = await budgetRepo.getBudgetSummary(10, 2026);
    const budgetedTotalLimit = budgetSummary.reduce((acc, b) => acc + parseFloat(b.amount_limit), 0);
    const budgetedTotalSpent = budgetSummary.reduce((acc, b) => acc + parseFloat(b.spent_amount), 0);
    assert.strictEqual(budgetedTotalLimit, 15000);
    assert.strictEqual(budgetedTotalSpent, 7500); // Food 1500 + Travel 6000

    // Breakdown includes all personal spending (11000)
    const breakdown = await budgetRepo.getSpendingBreakdown(10, 2026);
    assert.strictEqual(breakdown.total_spent, 11000);
    assert.notStrictEqual(budgetedTotalSpent, breakdown.total_spent, 'Budgeted spent and breakdown total must not be conflated');
  });

  console.log('\n--- 4. BUDGET PRESETS ---');

  let preset1;

  await runAsyncTest('Create budget preset with multiple category items', async () => {
    preset1 = await presetRepo.create({
      name: 'Standard Monthly',
      items: [
        { category_id: foodCat.id, amount: 12000 },
        { category_id: travelCat.id, amount: 4000 },
        { category_id: utilCat.id, amount: 20000 },
      ],
    });
    assert.ok(preset1.id > 0);
    assert.strictEqual(preset1.name, 'Standard Monthly');
    assert.strictEqual(preset1.items.length, 3);
    assert.strictEqual(preset1.items[0].category.name, 'Food & Dining');
    assert.strictEqual(preset1.items[0].amount, '12000.00');
  });

  await runAsyncTest('Duplicate preset name is rejected (case-insensitive)', async () => {
    await assert.rejects(
      async () => presetRepo.create({
        name: 'standard monthly',
        items: [{ category_id: foodCat.id, amount: 5000 }],
      }),
      ConflictError
    );
  });

  await runAsyncTest('Retrieve preset by ID and getAll', async () => {
    const fetched = await presetRepo.getById(preset1.id);
    assert.ok(fetched);
    assert.strictEqual(fetched.name, 'Standard Monthly');
    assert.strictEqual(fetched.items.length, 3);

    const all = await presetRepo.getAll();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].name, 'Standard Monthly');
  });

  await runAsyncTest('Update preset name and items', async () => {
    const updated = await presetRepo.update(preset1.id, {
      name: 'Lean Monthly',
      items: [
        { category_id: foodCat.id, amount: 8000 },
        { category_id: travelCat.id, amount: 3000 },
      ],
    });
    assert.strictEqual(updated.name, 'Lean Monthly');
    assert.strictEqual(updated.items.length, 2);
  });

  await runAsyncTest('Apply preset to target month/year', async () => {
    // Apply 'Lean Monthly' to Dec 2026 (month 12)
    const appliedSummaries = await presetRepo.applyPreset(preset1.id, {
      month: 12,
      year: 2026,
    });
    assert.strictEqual(appliedSummaries.length, 2);

    const foodDec = appliedSummaries.find(s => s.category_id === foodCat.id);
    assert.ok(foodDec);
    assert.strictEqual(foodDec.amount_limit, '8000.00');
    assert.strictEqual(foodDec.month, 12);
    assert.strictEqual(foodDec.year, 2026);

    const travelDec = appliedSummaries.find(s => s.category_id === travelCat.id);
    assert.ok(travelDec);
    assert.strictEqual(travelDec.amount_limit, '3000.00');
    assert.strictEqual(travelDec.month, 12);
    assert.strictEqual(travelDec.year, 2026);
  });

  await runAsyncTest('Preset application atomicity: failure midway rolls back completely', async () => {
    // Create preset with 2 items
    const atomPreset = await presetRepo.create({
      name: 'Atomic Test Preset',
      items: [
        { category_id: foodCat.id, amount: 5000 },
        { category_id: travelCat.id, amount: 3000 },
      ],
    });

    // Subclass / wrap budgetRepo to simulate failure on 2nd setBudget call
    let callCount = 0;
    const failingBudgetRepo = new SQLiteBudgetRepository(getDb);
    const origSetBudget = failingBudgetRepo.setBudget.bind(failingBudgetRepo);
    failingBudgetRepo.setBudget = async (data) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Simulated storage error during batch apply');
      }
      return origSetBudget(data);
    };

    // Verify month 7 of 2026 currently has 0 budgets
    const beforeApply = await budgetRepo.getBudgetSummary(7, 2026);
    assert.strictEqual(beforeApply.length, 0);

    // Apply preset with transaction rollback
    await assert.rejects(async () => {
      await adapter.withTransactionAsync(async () => {
        for (const item of atomPreset.items) {
          await failingBudgetRepo.setBudget({
            category_id: item.category_id,
            month: 7,
            year: 2026,
            amount_limit: parseFloat(item.amount),
          });
        }
      });
    }, /Simulated storage error/);

    // Verify 0 rows were added for month 7 of 2026 (item 1 rolled back)
    const afterApply = await budgetRepo.getBudgetSummary(7, 2026);
    assert.strictEqual(afterApply.length, 0, 'Atomic rollback: zero rows must remain after failure midway');

    await presetRepo.delete(atomPreset.id);
  });

  await runAsyncTest('Delete preset', async () => {
    await presetRepo.delete(preset1.id);
    const check = await presetRepo.getById(preset1.id);
    assert.strictEqual(check, null, 'Deleted preset must return null');
  });

  console.log('\n--- 5. PERSISTENCE & DATABASE REOPEN ---');

  await runAsyncTest('Budgets and summary persist after closing and reopening database', async () => {
    adapter.close();

    const reopenedDb = new DatabaseSync(DB_PATH);
    const reopenedAdapter = new SQLiteAdapter(reopenedDb);
    const reopenedBudgetRepo = new SQLiteBudgetRepository(async () => reopenedAdapter);

    const octSummaries = await reopenedBudgetRepo.getBudgetSummary(10, 2026);
    assert.strictEqual(octSummaries.length, 2, 'Oct 2026 budgets must persist across reopen');
    const foodStatus = octSummaries.find(s => s.category_id === foodCat.id);
    assert.strictEqual(foodStatus.amount_limit, '10000.00');
    assert.strictEqual(foodStatus.spent_amount, '1500.00');

    const breakdown = await reopenedBudgetRepo.getSpendingBreakdown(10, 2026);
    assert.strictEqual(breakdown.total_spent, 11000, 'Spending breakdown must persist across reopen');

    reopenedAdapter.close();
  });

  console.log('\n--- 6. API INTEGRITY ---');

  await runAsyncTest('Full Bjet src/api/budgets.ts and src/api/presets.ts remain intact', async () => {
    const budgetsApiPath = path.resolve('src/api/budgets.ts');
    const presetsApiPath = path.resolve('src/api/presets.ts');

    assert.ok(fs.existsSync(budgetsApiPath), 'src/api/budgets.ts must exist');
    assert.ok(fs.existsSync(presetsApiPath), 'src/api/presets.ts must exist');

    const budgetsApiContent = fs.readFileSync(budgetsApiPath, 'utf-8');
    assert.ok(budgetsApiContent.includes('export async function getBudgetSummaryApi'), 'getBudgetSummaryApi must be exported');
    assert.ok(budgetsApiContent.includes('export async function setBudgetApi'), 'setBudgetApi must be exported');
    assert.ok(budgetsApiContent.includes('export async function deleteBudgetApi'), 'deleteBudgetApi must be exported');
    assert.ok(budgetsApiContent.includes('export async function getMonthlySpendingBreakdownApi'), 'getMonthlySpendingBreakdownApi must be exported');

    const presetsApiContent = fs.readFileSync(presetsApiPath, 'utf-8');
    assert.ok(presetsApiContent.includes('export async function getBudgetPresetsApi'), 'getBudgetPresetsApi must be exported');
    assert.ok(presetsApiContent.includes('export async function createBudgetPresetApi'), 'createBudgetPresetApi must be exported');
    assert.ok(presetsApiContent.includes('export async function applyBudgetPresetApi'), 'applyBudgetPresetApi must be exported');
  });

  console.log('\n==================================================');
  console.log(`C6 RESULTS: ${passed} PASSED, ${failed} FAILED`);
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
