/**
 * Bjet Lite - Local SQLite Schema Definition (Phase C2)
 *
 * Defines the minimum local SQLite schema, constraints, indexes, and
 * TypeScript row entity interfaces for Bjet Lite offline operation.
 *
 * Financial Semantics Preserved:
 * - SENT outgoing transactions (personal net spending)
 * - RECEIVED reimbursement transactions
 * - amount_paid_for_someone_else (friends splitting)
 * - friend_id relationships
 * - monthly category budget limits
 * - merchant categorization rules
 * - UPI reference ID and duplicate statement detection
 */

export interface CategoryRow {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_system_default: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface FriendRow {
  id: number;
  name: string;
  recognized_name: string;
  category_id: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: number;
  amount: number;
  currency: string;
  timestamp: string;
  merchant_raw_name: string | null;
  category_id: number | null;
  upi_reference_id: string | null;
  upi_vpa: string | null;
  payment_app: string | null;
  direction: 'SENT' | 'RECEIVED' | 'TOP_UP';
  is_reimbursement: number; // 0 or 1
  friend_id: number | null;
  amount_paid_for_someone_else: number | null;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'MANUAL';
  notes: string | null;
  raw_extracted_text: string | null;
  receipt_image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetRow {
  id: number;
  category_id: number;
  month: number;
  year: number;
  amount_limit: number;
  created_at: string;
  updated_at: string;
}

export interface UserMerchantRuleRow {
  id: number;
  merchant_pattern: string;
  category_id: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetPresetRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetPresetItemRow {
  id: number;
  preset_id: number;
  category_id: number;
  amount: number;
  created_at: string;
  updated_at: string;
}

/**
 * System default categories aligned exactly with backend category_repo.py
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', icon: 'utensils', color: '#FF5722' },
  { name: 'Groceries', icon: 'shopping-basket', color: '#4CAF50' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#E91E63' },
  { name: 'Transportation', icon: 'car', color: '#2196F3' },
  { name: 'Utilities & Bills', icon: 'bolt', color: '#FF9800' },
  { name: 'Entertainment', icon: 'film', color: '#9C27B0' },
  { name: 'Health & Medical', icon: 'heart', color: '#F44336' },
  { name: 'Education', icon: 'graduation-cap', color: '#3F51B5' },
  { name: 'Personal Care', icon: 'sparkles', color: '#00BCD4' },
  { name: 'Other / Miscellaneous', icon: 'ellipsis-h', color: '#607D8B' },
  { name: 'Uncategorized', icon: 'question-circle', color: '#9E9E9E' },
] as const;

/**
 * Table Creation DDL
 */
export const CREATE_CATEGORIES_TABLE = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE,
  icon TEXT,
  color TEXT,
  is_system_default INTEGER NOT NULL DEFAULT 0 CHECK(is_system_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name COLLATE NOCASE)
);
`;

export const CREATE_FRIENDS_TABLE = `
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  recognized_name TEXT NOT NULL COLLATE NOCASE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(recognized_name COLLATE NOCASE)
);
`;

export const CREATE_TRANSACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS transactions (
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
  is_reimbursement INTEGER NOT NULL DEFAULT 0 CHECK(is_reimbursement IN (0, 1)),
  friend_id INTEGER REFERENCES friends(id) ON DELETE SET NULL,
  amount_paid_for_someone_else REAL DEFAULT 0.00 CHECK(amount_paid_for_someone_else >= 0),
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'MANUAL')),
  notes TEXT,
  raw_extracted_text TEXT,
  receipt_image_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(amount_paid_for_someone_else <= amount)
);
`;

export const CREATE_BUDGETS_TABLE = `
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK(year BETWEEN 2000 AND 2100),
  amount_limit REAL NOT NULL CHECK(amount_limit >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(category_id, month, year)
);
`;

export const CREATE_USER_MERCHANT_RULES_TABLE = `
CREATE TABLE IF NOT EXISTS user_merchant_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_pattern TEXT NOT NULL COLLATE NOCASE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(merchant_pattern COLLATE NOCASE)
);
`;

export const CREATE_BUDGET_PRESETS_TABLE = `
CREATE TABLE IF NOT EXISTS budget_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const CREATE_BUDGET_PRESET_ITEMS_TABLE = `
CREATE TABLE IF NOT EXISTS budget_preset_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_id INTEGER NOT NULL REFERENCES budget_presets(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK(amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(preset_id, category_id)
);
`;

/**
 * Indexes for Query Performance and Deduplication
 */
export const CREATE_INDEXES = [
  // Categories
  `CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name COLLATE NOCASE);`,
  `CREATE INDEX IF NOT EXISTS idx_categories_is_default ON categories(is_system_default);`,

  // Friends
  `CREATE INDEX IF NOT EXISTS idx_friends_recognized_name ON friends(recognized_name COLLATE NOCASE);`,
  `CREATE INDEX IF NOT EXISTS idx_friends_category_id ON friends(category_id);`,

  // Transactions
  `CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(direction);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_is_reimbursement ON transactions(is_reimbursement);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_friend_id ON transactions(friend_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_upi_ref ON transactions(upi_reference_id);`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_dedup ON transactions(upi_reference_id, amount, timestamp);`,

  // Budgets
  `CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(year, month);`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);`,

  // Merchant Rules
  `CREATE INDEX IF NOT EXISTS idx_rules_pattern ON user_merchant_rules(merchant_pattern COLLATE NOCASE);`,
  `CREATE INDEX IF NOT EXISTS idx_rules_category_id ON user_merchant_rules(category_id);`,

  // Presets
  `CREATE INDEX IF NOT EXISTS idx_preset_items_preset_id ON budget_preset_items(preset_id);`,
  `CREATE INDEX IF NOT EXISTS idx_preset_items_category_id ON budget_preset_items(category_id);`,
];
