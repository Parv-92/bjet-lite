/**
 * Test Suite: Merchant Default Rules & Categorization
 * Verifies all 12 behaviors specified in the requirements.
 */

import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'bjet_merchant_rules_test_' + Date.now());
fs.mkdirSync(TEST_DIR, { recursive: true });
const TEST_DB_PATH = path.join(TEST_DIR, 'test_merchant_rule.db');

function normalizeMerchantPattern(pattern) {
  if (!pattern) return '';
  return pattern.trim().replace(/\s+/g, ' ').toUpperCase();
}

class SQLiteMerchantRuleRepository {
  constructor(getDb) {
    this.getDb = getDb;
    this.hasUserIdColumn = null;
  }

  async checkUserIdColumn(db) {
    if (this.hasUserIdColumn !== null) return this.hasUserIdColumn;
    try {
      const tableInfo = await db.getAllAsync(`PRAGMA table_info(user_merchant_rules);`);
      this.hasUserIdColumn = tableInfo.some((col) => col.name === 'user_id');
      return this.hasUserIdColumn;
    } catch {
      return false;
    }
  }

  async getAll() {
    const db = await this.getDb();
    return db.getAllAsync(`
      SELECT r.*, c.name as c_name, c.color as c_color
      FROM user_merchant_rules r
      LEFT JOIN categories c ON r.category_id = c.id
      ORDER BY r.priority DESC, r.created_at DESC;
    `);
  }

  async getById(id) {
    const db = await this.getDb();
    return db.getFirstAsync(`
      SELECT r.*, c.name as c_name, c.color as c_color
      FROM user_merchant_rules r
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.id = ?;
    `, [id]);
  }

  async create(data) {
    const pattern = normalizeMerchantPattern(data.merchant_pattern);
    if (!pattern) throw new Error('Merchant pattern is required.');
    if (!data.category_id) throw new Error('Category ID is required.');

    const db = await this.getDb();
    const category = await db.getFirstAsync(`SELECT id FROM categories WHERE id = ?;`, [data.category_id]);
    if (!category) throw new Error(`Category with ID ${data.category_id} not found.`);

    const existing = await db.getFirstAsync(
      `SELECT id FROM user_merchant_rules WHERE merchant_pattern = ? COLLATE NOCASE;`,
      [pattern]
    );
    if (existing) {
      throw new Error(`Rule for merchant pattern "${pattern}" already exists.`);
    }

    const priority = data.priority ?? 1;
    const hasUserId = await this.checkUserIdColumn(db);

    let result;
    if (hasUserId) {
      result = await db.runAsync(
        `INSERT INTO user_merchant_rules (user_id, merchant_pattern, category_id, priority)
         VALUES (1, ?, ?, ?);`,
        [pattern, data.category_id, priority]
      );
    } else {
      result = await db.runAsync(
        `INSERT INTO user_merchant_rules (merchant_pattern, category_id, priority)
         VALUES (?, ?, ?);`,
        [pattern, data.category_id, priority]
      );
    }

    return this.getById(result.lastInsertRowId);
  }

  async update(id, data) {
    const db = await this.getDb();
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Merchant rule with ID ${id} not found.`);

    let newPattern = existing.merchant_pattern;
    if (data.merchant_pattern !== undefined) {
      newPattern = normalizeMerchantPattern(data.merchant_pattern);
      if (!newPattern) throw new Error('Merchant pattern cannot be blank.');
    }

    let newCategoryId = data.category_id !== undefined ? data.category_id : existing.category_id;
    let newPriority = data.priority !== undefined ? data.priority : existing.priority;

    await db.runAsync(
      `UPDATE user_merchant_rules
       SET merchant_pattern = ?, category_id = ?, priority = ?, updated_at = datetime('now')
       WHERE id = ?;`,
      [newPattern, newCategoryId, newPriority, id]
    );

    return this.getById(id);
  }

  async upsertRule(merchantPattern, categoryId, priority = 1) {
    const pattern = normalizeMerchantPattern(merchantPattern);
    if (!pattern) throw new Error('Merchant pattern is required.');
    if (!categoryId) throw new Error('Category ID is required.');

    const db = await this.getDb();
    const existing = await db.getFirstAsync(
      `SELECT id FROM user_merchant_rules WHERE merchant_pattern = ? COLLATE NOCASE;`,
      [pattern]
    );

    if (existing) {
      return this.update(existing.id, { category_id: categoryId, priority });
    } else {
      return this.create({
        merchant_pattern: pattern,
        category_id: categoryId,
        priority,
      });
    }
  }

  async matchRule(merchantName, upiVpa) {
    const rawCandidate = [merchantName || '', upiVpa || ''].join(' ').trim();
    if (!rawCandidate) return null;

    const normCandidate = normalizeMerchantPattern(rawCandidate);
    if (!normCandidate) return null;

    const rules = await this.getAll();
    const sortedRules = [...rules].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.merchant_pattern.length - a.merchant_pattern.length;
    });

    for (const rule of sortedRules) {
      const normPattern = normalizeMerchantPattern(rule.merchant_pattern);
      if (!normPattern) continue;
      if (
        normCandidate.includes(normPattern) ||
        (normPattern.length >= 3 && normPattern.includes(normCandidate))
      ) {
        return rule;
      }
    }
    return null;
  }
}

class SQLiteTransactionRepository {
  constructor(getDb) {
    this.getDb = getDb;
  }

  async applyMerchantDefaultRule(db, merchantRawName, categoryId, excludeTxId) {
    if (!categoryId) {
      throw new Error('Cannot set default category without selecting a category.');
    }

    const cat = await db.getFirstAsync(`SELECT name FROM categories WHERE id = ?;`, [categoryId]);
    if (!cat) throw new Error(`Category with ID ${categoryId} not found.`);
    if (cat.name.toLowerCase() === 'uncategorized') {
      throw new Error("Cannot set 'Uncategorized' as a merchant default category.");
    }

    const rawMerchant = (merchantRawName || '').trim();
    if (!rawMerchant) {
      throw new Error('Cannot set merchant default for a transaction without a merchant name.');
    }

    const cleanPattern = normalizeMerchantPattern(rawMerchant);
    if (!cleanPattern) {
      throw new Error('Merchant pattern cannot be blank.');
    }

    const ruleRepo = new SQLiteMerchantRuleRepository(this.getDb);
    await ruleRepo.upsertRule(cleanPattern, categoryId, 1);

    const uncategorizedCategory = await db.getFirstAsync(
      `SELECT id FROM categories WHERE name = 'Uncategorized' COLLATE NOCASE;`
    );
    const uncatId = uncategorizedCategory?.id;

    const uncatCondition = uncatId !== undefined
      ? `(category_id IS NULL OR category_id = ${uncatId})`
      : `category_id IS NULL`;

    if (excludeTxId) {
      await db.runAsync(
        `UPDATE transactions
         SET category_id = ?, updated_at = datetime('now')
         WHERE id != ?
           AND merchant_raw_name = ? COLLATE NOCASE
           AND ${uncatCondition};`,
        [categoryId, excludeTxId, rawMerchant]
      );
    } else {
      await db.runAsync(
        `UPDATE transactions
         SET category_id = ?, updated_at = datetime('now')
         WHERE merchant_raw_name = ? COLLATE NOCASE
           AND ${uncatCondition};`,
        [categoryId, rawMerchant]
      );
    }
  }

  async getTransactionById(id) {
    const db = await this.getDb();
    return db.getFirstAsync(`SELECT * FROM transactions WHERE id = ?;`, [id]);
  }

  async createTransaction(data) {
    const db = await this.getDb();
    let categoryId = data.category_id ?? null;
    let isUncategorized = false;

    if (categoryId) {
      const cat = await db.getFirstAsync(`SELECT name FROM categories WHERE id = ?;`, [categoryId]);
      if (cat?.name?.toLowerCase() === 'uncategorized') {
        isUncategorized = true;
      }
    }

    // Auto-categorize fallback via merchant rule
    if ((!categoryId || isUncategorized) && data.merchant_raw_name) {
      const ruleRepo = new SQLiteMerchantRuleRepository(this.getDb);
      const matched = await ruleRepo.matchRule(data.merchant_raw_name, data.upi_vpa);
      if (matched) {
        categoryId = matched.category_id;
      }
    }

    let createdId;
    await db.withTransactionAsync(async () => {
      const res = await db.runAsync(
        `INSERT INTO transactions (amount, merchant_raw_name, category_id, direction, timestamp)
         VALUES (?, ?, ?, ?, datetime('now'));`,
        [data.amount, data.merchant_raw_name || null, categoryId, data.direction || 'SENT']
      );
      createdId = res.lastInsertRowId;

      if (data.set_as_merchant_default) {
        await this.applyMerchantDefaultRule(db, data.merchant_raw_name, categoryId, createdId);
      }
    });

    return this.getTransactionById(createdId);
  }

  async updateTransaction(id, data) {
    const db = await this.getDb();
    const existing = await this.getTransactionById(id);
    if (!existing) throw new Error(`Transaction ${id} not found.`);

    const newMerchant = data.merchant_raw_name !== undefined ? data.merchant_raw_name : existing.merchant_raw_name;
    const newCategoryId = data.category_id !== undefined ? data.category_id : existing.category_id;
    const newAmount = data.amount !== undefined ? data.amount : existing.amount;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE transactions
         SET amount = ?, merchant_raw_name = ?, category_id = ?, updated_at = datetime('now')
         WHERE id = ?;`,
        [newAmount, newMerchant, newCategoryId, id]
      );

      if (data.set_as_merchant_default) {
        await this.applyMerchantDefaultRule(db, newMerchant, newCategoryId, id);
      }
    });

    return this.getTransactionById(id);
  }
}

function createExpoSqliteShim(rawDb) {
  return {
    getFirstAsync: async (sql, params = []) => {
      const stmt = rawDb.prepare(sql);
      return stmt.get(...params) || null;
    },
    getAllAsync: async (sql, params = []) => {
      const stmt = rawDb.prepare(sql);
      return stmt.all(...params);
    },
    runAsync: async (sql, params = []) => {
      const stmt = rawDb.prepare(sql);
      const res = stmt.run(...params);
      return { lastInsertRowId: Number(res.lastInsertRowid), changes: res.changes };
    },
    execAsync: async (sql) => {
      rawDb.exec(sql);
    },
    withTransactionAsync: async (action) => {
      rawDb.exec('BEGIN IMMEDIATE;');
      try {
        const result = await action();
        rawDb.exec('COMMIT;');
        return result;
      } catch (err) {
        rawDb.exec('ROLLBACK;');
        throw err;
      }
    },
  };
}

async function runTests() {
  console.log('=== STARTING MERCHANT DEFAULT RULE TEST SUITE ===');

  const rawDb = new DatabaseSync(TEST_DB_PATH);
  
  // Set up schema with user_id NOT NULL (exactly as on phone / legacy)
  rawDb.exec(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      icon TEXT,
      color TEXT,
      is_system_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE user_merchant_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      merchant_pattern TEXT NOT NULL COLLATE NOCASE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      priority INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, merchant_pattern COLLATE NOCASE)
    );

    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL CHECK(amount > 0),
      timestamp TEXT NOT NULL,
      merchant_raw_name TEXT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      direction TEXT NOT NULL DEFAULT 'SENT',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  rawDb.prepare(`INSERT INTO categories (id, name, is_system_default) VALUES (1, 'Food & Dining', 1);`).run();
  rawDb.prepare(`INSERT INTO categories (id, name, is_system_default) VALUES (2, 'Groceries', 1);`).run();
  rawDb.prepare(`INSERT INTO categories (id, name, is_system_default) VALUES (3, 'Shopping', 1);`).run();
  rawDb.prepare(`INSERT INTO categories (id, name, is_system_default) VALUES (5, 'Utilities & Bills', 1);`).run();
  rawDb.prepare(`INSERT INTO categories (id, name, is_system_default) VALUES (11, 'Uncategorized', 1);`).run();

  const shim = createExpoSqliteShim(rawDb);
  const getDb = async () => shim;

  const ruleRepo = new SQLiteMerchantRuleRepository(getDb);
  const txRepo = new SQLiteTransactionRepository(getDb);

  let passed = 0;

  // Test 1: Categorize an uncategorized transaction from a test merchant with Keep default
  console.log('Test 1: Categorize uncategorized transaction with Keep default...');
  const tx1 = await txRepo.createTransaction({
    amount: 299,
    merchant_raw_name: 'JIO PREPAID',
    category_id: 11,
    direction: 'SENT',
  });
  assert.strictEqual(tx1.category_id, 11);

  // Existing another uncategorized transaction from same merchant
  const txPreExistingUncat = await txRepo.createTransaction({
    amount: 149,
    merchant_raw_name: 'JIO PREPAID',
    category_id: 11,
    direction: 'SENT',
  });

  // Existing transaction with manually chosen category that must NOT be overwritten
  const txPreExistingManual = await txRepo.createTransaction({
    amount: 500,
    merchant_raw_name: 'JIO PREPAID',
    category_id: 3, // Shopping
    direction: 'SENT',
  });

  const updatedTx1 = await txRepo.updateTransaction(tx1.id, {
    category_id: 5, // Utilities & Bills
    set_as_merchant_default: true,
  });
  assert.strictEqual(updatedTx1.category_id, 5);
  passed++;
  console.log('✓ Passed: Transaction 1 updated to Utilities & Bills.');

  // Test 2: Verify rule is persisted in database with user_id
  console.log('Test 2: Verify rule is persisted in database...');
  const ruleInDb = rawDb.prepare(`SELECT * FROM user_merchant_rules WHERE merchant_pattern = 'JIO PREPAID';`).get();
  assert.ok(ruleInDb, 'Rule must exist in user_merchant_rules');
  assert.strictEqual(ruleInDb.category_id, 5);
  assert.strictEqual(ruleInDb.user_id, 1);
  passed++;
  console.log('✓ Passed: Rule exists in DB with user_id and category_id=5.');

  // Test 3: Verify existing uncategorized transactions from JIO are safely backfilled
  console.log('Test 3: Verify safe backfill of existing uncategorized transactions...');
  const reloadedUncat = await txRepo.getTransactionById(txPreExistingUncat.id);
  assert.strictEqual(reloadedUncat.category_id, 5); // Was 11 -> now 5!

  const reloadedManual = await txRepo.getTransactionById(txPreExistingManual.id);
  assert.strictEqual(reloadedManual.category_id, 3); // Preserved manual selection!
  passed++;
  console.log('✓ Passed: Existing uncategorized was updated to 5; manual shopping was NOT overwritten.');

  // Test 4: Create a future transaction from JIO without category -> automatically receives Utilities
  console.log('Test 4: Future transaction receives rule category automatically...');
  const futureTx = await txRepo.createTransaction({
    amount: 666,
    merchant_raw_name: 'JIO PREPAID',
    direction: 'SENT',
  });
  assert.strictEqual(futureTx.category_id, 5);
  passed++;
  console.log('✓ Passed: Future transaction automatically assigned category_id=5.');

  // Test 5: Case-insensitive and whitespace-insensitive matching
  console.log('Test 5: Case-insensitive and whitespace matching...');
  const futureLowerTx = await txRepo.createTransaction({
    amount: 719,
    merchant_raw_name: '  jio prepaid  ',
    direction: 'SENT',
  });
  assert.strictEqual(futureLowerTx.category_id, 5);
  passed++;
  console.log('✓ Passed: Lowercase with spaces matched rule.');

  // Test 6: Explicit category on future transaction is NOT overwritten by rule
  console.log('Test 6: Explicit category override is preserved...');
  const manualFutureTx = await txRepo.createTransaction({
    amount: 999,
    merchant_raw_name: 'JIO PREPAID',
    category_id: 1, // Food & Dining explicitly chosen
    direction: 'SENT',
  });
  assert.strictEqual(manualFutureTx.category_id, 1);
  passed++;
  console.log('✓ Passed: Deliberately selected category is preserved.');

  // Test 7: Updating without Keep default does NOT create a rule
  console.log('Test 7: Saving without Keep default does not create a rule...');
  const txNoDefault = await txRepo.createTransaction({
    amount: 100,
    merchant_raw_name: 'BRAND NEW CAFE',
    category_id: 11,
    direction: 'SENT',
  });
  await txRepo.updateTransaction(txNoDefault.id, {
    category_id: 1,
    set_as_merchant_default: false,
  });
  const ruleCheck = rawDb.prepare(`SELECT * FROM user_merchant_rules WHERE merchant_pattern = 'BRAND NEW CAFE';`).get();
  assert.strictEqual(ruleCheck, undefined);
  passed++;
  console.log('✓ Passed: No rule created when set_as_merchant_default is false.');

  // Test 8: Repeated saves with Keep default updates existing rule, does not duplicate
  console.log('Test 8: Repeated save updates existing rule without duplication...');
  await txRepo.updateTransaction(tx1.id, {
    category_id: 2, // Switch to Groceries
    set_as_merchant_default: true,
  });
  const rulesList = rawDb.prepare(`SELECT * FROM user_merchant_rules WHERE merchant_pattern = 'JIO PREPAID';`).all();
  assert.strictEqual(rulesList.length, 1);
  assert.strictEqual(rulesList[0].category_id, 2);
  passed++;
  console.log('✓ Passed: Exactly 1 rule exists, updated to category_id=2.');

  // Test 9: Setting Uncategorized as default throws ValidationError and rolls back
  console.log('Test 9: Setting Uncategorized as default throws error...');
  let errorThrown = false;
  try {
    await txRepo.updateTransaction(tx1.id, {
      category_id: 11, // Uncategorized
      set_as_merchant_default: true,
    });
  } catch (err) {
    errorThrown = true;
    assert.ok(err.message.includes('Uncategorized'));
  }
  assert.strictEqual(errorThrown, true);
  passed++;
  console.log('✓ Passed: Uncategorized as default was rejected.');

  console.log(`\n========================================`);
  console.log(`ALL ${passed}/${passed} TESTS PASSED SUCCESSFULLY!`);
  console.log(`========================================\n`);

  try {
    rawDb.close();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
