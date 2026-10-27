/**
 * Bjet Lite - Statement Import & Local Persistence Test Suite (Phase C8)
 *
 * Validates the core local SQLite Statement Import pipeline, parser compatibility,
 * candidate filtering, UPI deduplication, batch persistence, and financial integrity:
 *
 * 1. STATEMENT PARSING & CANDIDATE GENERATION
 *    - Multi-transaction statement text parses cleanly via GooglePayStatementParser
 *    - Statement aggregate totals (Sent/Received) are NOT imported as candidates
 *    - Exact UPI Reference IDs (UTRs) and timestamps extracted
 *    - Explicit directions: SENT, RECEIVED, TOP_UP
 *
 * 2. DIRECTION BOUNDARIES & INFLOW PERSISTENCE RULES
 *    - SENT candidates are eligible for persistence
 *    - RECEIVED reimbursement candidates (isReimbursement = true) are eligible
 *    - Ordinary inflows (isReimbursement = false) are blocked/excluded from persistence
 *    - TOP_UP wallet transfers are blocked/excluded from personal spending
 *
 * 3. LOCAL PREFLIGHT DUPLICATE DETECTION
 *    - Existing UPI references in SQLite are intercepted via transactionRepository.findExistingUpiRefs
 *    - In-batch duplicate UPI references are intercepted
 *    - Intercepted duplicates transition to SKIPPED_DUPLICATE without altering database
 *
 * 4. BATCH LOCAL PERSISTENCE VIA StatementTransactionPersistenceService
 *    - Valid candidates persisted into SQLite transactions table
 *    - Candidate state machine transitions to PERSISTED with valid SQLite transaction ID
 *    - Category fallback: selected -> suggested -> auto-categorized
 *    - Payment app and notes metadata preserved
 *
 * 5. IDEMPOTENCY & REPEATED IMPORT
 *    - Re-importing the same statement identifies 100% duplicates
 *    - Zero duplicate transactions inserted into SQLite
 *
 * 6. FINANCIAL REIMBURSEMENT & BUDGET IMPACT
 *    - Persisted SENT expenses and RECEIVED reimbursements correctly calculate
 *      personal net spending in budgetRepository
 *
 * 7. FILE LIFECYCLE & CLEANUP
 *    - Source file cleanup called upon successful batch persistence
 *    - Cancel / abandon review cleans source file and clears session
 *
 * 8. PERSISTENCE ACROSS REOPEN
 *    - Closing and reopening database preserves all statement-imported transactions
 *
 * 9. API INTEGRITY
 *    - Full Bjet src/api/transactions.ts remains intact
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

import { SQLiteTransactionRepository } from '../src/repositories/transactionRepository.ts';
import { SQLiteCategoryRepository } from '../src/repositories/categoryRepository.ts';
import { SQLiteBudgetRepository } from '../src/repositories/budgetRepository.ts';
import { SQLiteFriendRepository } from '../src/repositories/friendRepository.ts';

import { GooglePayStatementParser } from '../src/services/receipt/parsers/GooglePayStatementParser.ts';
import { StatementTransactionPersistenceService } from '../src/services/receipt/StatementTransactionPersistenceService.ts';
import { statementCandidateStore } from '../src/services/receipt/statementCandidateStore.ts';
import { fileLifecycleService } from '../src/services/receipt/fileLifecycleService.ts';

const TEST_DIR = path.join(os.tmpdir(), 'bjet_c8_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const DB_PATH = path.join(TEST_DIR, 'bjet_lite_c8.db');

console.log('=== STARTING BJET LITE STATEMENT IMPORT MIGRATION TEST SUITE (PHASE C8) ===');
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

const txRepo = new SQLiteTransactionRepository(getDb);
const catRepo = new SQLiteCategoryRepository(getDb);
const budgetRepo = new SQLiteBudgetRepository(getDb);
const friendRepo = new SQLiteFriendRepository(getDb);

const persistenceService = new StatementTransactionPersistenceService(txRepo);

// Realistic Google Pay Statement Text Fixture exactly formatted as GooglePayStatementParser expects
const SAMPLE_GPAY_STATEMENT_TEXT = `Google Pay
Transaction statement period
01 Oct 2026 - 31 Oct 2026

Summary
Sent 
₹15,450.00
Received 
₹2,500.00

Date & time   Transaction details   Amount
05 Oct, 2026
12:30 PM
Paid to Swiggy
UPI transaction ID: 627101112233
Paid by HDFC Bank
₹450.00

08 Oct, 2026
03:15 PM
Paid to BigBasket
UPI transaction ID: 627101112234
Paid by HDFC Bank
₹2,000.00

12 Oct, 2026
06:45 PM
Received from Rohan Sharma
UPI transaction ID: 627101112235
Credited to HDFC Bank
₹1,500.00

15 Oct, 2026
10:00 AM
Top-up to UPI Lite
UPI transaction ID: 627101112236
Paid by HDFC Bank
₹1,000.00

18 Oct, 2026
02:00 PM
Received from Salary / Client
UPI transaction ID: 627101112237
Credited to HDFC Bank
₹1,000.00
`;

async function runAllTests() {
  console.log('--- 1. STATEMENT PARSING & CANDIDATE GENERATION ---');

  let parsedDoc;
  let foodCat, groceryCat;

  await runAsyncTest('Setup categories and friends for recognition', async () => {
    const categories = await catRepo.getAll();
    foodCat = categories.find(c => c.name === 'Food & Dining');
    groceryCat = categories.find(c => c.name === 'Groceries');
    assert.ok(foodCat);
    assert.ok(groceryCat);

    // Setup friend Rohan for reimbursement recognition
    await friendRepo.create({
      name: 'Rohan Sharma',
      recognized_name: 'rohan',
      category_id: foodCat.id,
    });
  });

  await runAsyncTest('GooglePayStatementParser canParse and extracts candidates', async () => {
    const parser = new GooglePayStatementParser();
    assert.strictEqual(parser.canParse(SAMPLE_GPAY_STATEMENT_TEXT), true);

    parsedDoc = await parser.parse(SAMPLE_GPAY_STATEMENT_TEXT, { fileName: 'gpay_oct_2026.pdf' });
    assert.ok(parsedDoc.candidates);
    assert.ok(parsedDoc.candidates.length >= 4, `Expected at least 4 candidates, got ${parsedDoc.candidates.length}`);

    // Statement summary totals must NOT be imported as candidates
    const summaryCandidate = parsedDoc.candidates.find(c => c.amount === 15450 || c.amount === 2500);
    assert.strictEqual(summaryCandidate, undefined, 'Summary totals must not be extracted as transaction candidates');
  });

  await runAsyncTest('Candidate fields: UTR, direction, and amounts correctly parsed', async () => {
    const swiggy = parsedDoc.candidates.find(c => c.transactionReference === '627101112233');
    assert.ok(swiggy, 'Swiggy candidate must be found');
    assert.strictEqual(swiggy.amount, 450);
    assert.strictEqual(swiggy.direction, 'SENT');

    const bigbasket = parsedDoc.candidates.find(c => c.transactionReference === '627101112234');
    assert.ok(bigbasket, 'BigBasket candidate must be found');
    assert.strictEqual(bigbasket.amount, 2000);
    assert.strictEqual(bigbasket.direction, 'SENT');

    const rohan = parsedDoc.candidates.find(c => c.transactionReference === '627101112235');
    assert.ok(rohan, 'Rohan candidate must be found');
    assert.strictEqual(rohan.amount, 1500);
    assert.strictEqual(rohan.direction, 'RECEIVED');
  });

  console.log('\n--- 2. DIRECTION BOUNDARIES & INFLOW PERSISTENCE RULES ---');

  await runAsyncTest('Candidate filtering: only SENT or reimbursement inflows are persistable', async () => {
    // Populate candidate store via setSession
    statementCandidateStore.setSession(parsedDoc.candidates, undefined, [], 'file:///tmp/source.pdf');

    // Mark Rohan candidate as reimbursement
    const rohan = statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112235');
    assert.ok(rohan);
    statementCandidateStore.updateCandidate(rohan.localId, {
      ...rohan,
      isReimbursement: true,
      selectedCategoryId: foodCat.id,
    });

    const persistable = statementCandidateStore.getPersistableCandidates();

    // Swiggy (SENT 450) -> yes
    // BigBasket (SENT 2000) -> yes
    // Rohan (RECEIVED 1500, isReimbursement: true) -> yes
    // Salary (RECEIVED 1000, isReimbursement: false) -> NO
    // Top-up (TOP_UP 1000) -> NO

    assert.ok(persistable.some(c => c.transactionReference === '627101112233'), 'SENT candidate must be persistable');
    assert.ok(persistable.some(c => c.transactionReference === '627101112234'), 'SENT candidate must be persistable');
    assert.ok(persistable.some(c => c.transactionReference === '627101112235'), 'RECEIVED reimbursement must be persistable');

    // Non-reimbursement inflow and top-up must NOT be in persistable list
    const salary = persistable.find(c => c.transactionReference === '627101112237');
    assert.strictEqual(salary, undefined, 'Ordinary non-reimbursement inflow must NOT be persistable');

    const topup = persistable.find(c => c.transactionReference === '627101112236');
    assert.strictEqual(topup, undefined, 'TOP_UP candidate must NOT be persistable');
  });

  console.log('\n--- 3. LOCAL PREFLIGHT DUPLICATE DETECTION ---');

  await runAsyncTest('Preflight intercepts existing UPI references from SQLite', async () => {
    // Seed an existing transaction in SQLite with Swiggy's UTR (627101112233)
    await txRepo.createTransaction({
      amount: 450,
      direction: 'SENT',
      category_id: foodCat.id,
      upi_reference_id: '627101112233',
      timestamp: '2026-10-05T12:30:00Z',
      notes: 'Previously imported Swiggy order',
    });

    // Check preflight via transactionRepo
    const existing = await txRepo.findExistingUpiRefs(['627101112233', '627101112234', '999999999999']);
    assert.strictEqual(existing.size, 1);
    assert.strictEqual(existing.has('627101112233'), true);
  });

  console.log('\n--- 4. BATCH LOCAL PERSISTENCE ---');

  let persistenceResult;

  await runAsyncTest('Persist candidates: skips duplicate, persists valid SENT and reimbursement', async () => {
    // Set category for BigBasket to Groceries
    const bb = statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112234');
    statementCandidateStore.updateCandidate(bb.localId, {
      ...bb,
      selectedCategoryId: groceryCat.id,
    });

    const candidatesToPersist = statementCandidateStore.getPersistableCandidates();
    persistenceResult = await persistenceService.persistCandidates(candidatesToPersist);

    // Results:
    // Total requested: 3 (Swiggy, BigBasket, Rohan)
    // Swiggy has existing UTR in SQLite -> skipped duplicate (1)
    // BigBasket -> persisted (success 1)
    // Rohan (reimbursement) -> persisted (success 2)
    // Total success: 2, Skipped: 1, Failed: 0
    assert.strictEqual(persistenceResult.totalRequested, 3);
    assert.strictEqual(persistenceResult.skippedDuplicateCount, 1);
    assert.strictEqual(persistenceResult.successCount, 2);
    assert.strictEqual(persistenceResult.failureCount, 0);

    // Verify candidate store state
    const swiggyCandidate = statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112233');
    assert.strictEqual(swiggyCandidate.persistenceStatus, 'SKIPPED_DUPLICATE');

    const bbCandidate = statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112234');
    assert.strictEqual(bbCandidate.persistenceStatus, 'PERSISTED');
    assert.ok(bbCandidate.persistedTransactionId > 0);

    const rohanCandidate = statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112235');
    assert.strictEqual(rohanCandidate.persistenceStatus, 'PERSISTED');
    assert.ok(rohanCandidate.persistedTransactionId > 0);
  });

  await runAsyncTest('Persisted SQLite rows have correct direction, category, and metadata', async () => {
    const bbTx = await txRepo.getTransactionById(
      statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112234').persistedTransactionId
    );
    assert.ok(bbTx);
    assert.strictEqual(bbTx.amount, '2000.00');
    assert.strictEqual(bbTx.direction, 'SENT');
    assert.strictEqual(bbTx.category_id, groceryCat.id);
    assert.strictEqual(bbTx.upi_reference_id, '627101112234');
    assert.strictEqual(bbTx.payment_app, 'Google Pay');

    const rohanTx = await txRepo.getTransactionById(
      statementCandidateStore.getCandidates().find(c => c.transactionReference === '627101112235').persistedTransactionId
    );
    assert.ok(rohanTx);
    assert.strictEqual(rohanTx.amount, '1500.00');
    assert.strictEqual(rohanTx.direction, 'RECEIVED');
    assert.strictEqual(rohanTx.is_reimbursement, true);
    assert.strictEqual(rohanTx.category_id, foodCat.id);
    assert.strictEqual(rohanTx.upi_reference_id, '627101112235');
  });

  console.log('\n--- 5. IDEMPOTENCY & REPEATED IMPORT ---');

  await runAsyncTest('Repeated statement import results in 100% duplicate skips', async () => {
    // Reset status to simulate re-importing the same document
    const freshCandidates = parsedDoc.candidates.map(c => ({
      ...c,
      persistenceStatus: 'NOT_SUBMITTED',
      isExcluded: false,
      isReimbursement: c.transactionReference === '627101112235', // Rohan
    }));

    const secondResult = await persistenceService.persistCandidates(
      freshCandidates.filter(c => c.direction === 'SENT' || (c.direction === 'RECEIVED' && c.isReimbursement))
    );

    // All 3 (Swiggy, BigBasket, Rohan) are now in SQLite
    assert.strictEqual(secondResult.totalRequested, 3);
    assert.strictEqual(secondResult.skippedDuplicateCount, 3);
    assert.strictEqual(secondResult.successCount, 0);
    assert.strictEqual(secondResult.failureCount, 0);
  });

  console.log('\n--- 6. FINANCIAL REIMBURSEMENT & BUDGET IMPACT ---');

  await runAsyncTest('Statement transactions correctly impact monthly budget spending', async () => {
    // Groceries has:
    // - SENT BigBasket (2000)
    // Net groceries spending = 2000

    await budgetRepo.setBudget({ category_id: groceryCat.id, month: 10, year: 2026, amount_limit: 5000 });
    const groceryStatus = await budgetRepo.getCategoryBudgetStatus(groceryCat.id, 10, 2026);
    assert.ok(groceryStatus);
    assert.strictEqual(groceryStatus.spent_amount, '2000.00');
    assert.strictEqual(groceryStatus.remaining_amount, '3000.00');
    assert.strictEqual(groceryStatus.is_over_budget, false);
  });

  console.log('\n--- 7. FILE LIFECYCLE & CLEANUP ---');

  await runAsyncTest('File cleanup removes source PDF upon successful import', async () => {
    const tempPdf = path.join(TEST_DIR, 'test_statement.pdf');
    fs.writeFileSync(tempPdf, '%PDF-1.4 test dummy content');
    assert.ok(fs.existsSync(tempPdf));

    statementCandidateStore.setSession([], undefined, [], tempPdf);
    assert.strictEqual(statementCandidateStore.getSourceFileUri(), tempPdf);

    // Simulate cleanup upon completion
    await fileLifecycleService.cleanupSession(tempPdf);
    assert.strictEqual(fs.existsSync(tempPdf), false, 'Source PDF must be deleted after cleanupSession');

    statementCandidateStore.clearSession();
    assert.strictEqual(statementCandidateStore.getSourceFileUri(), undefined);
  });

  console.log('\n--- 8. PERSISTENCE ACROSS REOPEN ---');

  await runAsyncTest('Statement imported transactions persist across database reopen', async () => {
    adapter.close();

    const reopenedDb = new DatabaseSync(DB_PATH);
    const reopenedAdapter = new SQLiteAdapter(reopenedDb);
    const reopenedTxRepo = new SQLiteTransactionRepository(async () => reopenedAdapter);

    const txs = await reopenedTxRepo.getTransactions({ limit: 10 });
    assert.ok(txs.length >= 3);
    const bb = txs.find(t => t.upi_reference_id === '627101112234');
    assert.ok(bb, 'BigBasket transaction must persist across reopen');
    assert.strictEqual(bb.amount, '2000.00');
    assert.strictEqual(bb.direction, 'SENT');

    const rohan = txs.find(t => t.upi_reference_id === '627101112235');
    assert.ok(rohan, 'Rohan reimbursement must persist across reopen');
    assert.strictEqual(rohan.amount, '1500.00');
    assert.strictEqual(rohan.direction, 'RECEIVED');

    reopenedAdapter.close();
  });

  console.log('\n--- 9. API INTEGRITY ---');

  await runAsyncTest('Full Bjet src/api/transactions.ts remains intact', async () => {
    const txApiPath = path.resolve('src/api/transactions.ts');
    assert.ok(fs.existsSync(txApiPath), 'src/api/transactions.ts must exist');

    const content = fs.readFileSync(txApiPath, 'utf-8');
    assert.ok(content.includes('export async function getTransactionsApi'), 'getTransactionsApi must be exported');
    assert.ok(content.includes('export async function createTransactionApi'), 'createTransactionApi must be exported');
    assert.ok(content.includes('export async function getTransactionApi'), 'getTransactionApi must be exported');
    assert.ok(content.includes('export async function updateTransactionApi'), 'updateTransactionApi must be exported');
  });

  console.log('\n==================================================');
  console.log(`C8 RESULTS: ${passed} PASSED, ${failed} FAILED`);
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
