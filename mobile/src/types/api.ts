/**
 * Bjet Mobile - API Types (API Contract v0.3.0)
 * Strictly typed definitions mirroring backend schemas.
 * NO 'any' types are used.
 */

// --- Authentication & User ---

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
}

// --- Categories ---

export interface Category {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  is_system_default: boolean;
  user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryRequest {
  name: string;
  icon?: string;
  color?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  icon?: string;
  color?: string;
}

// --- Merchants ---

export interface Merchant {
  id: number;
  name: string;
  clean_name: string;
  upi_vpa: string | null;
  default_category_id: number | null;
}

// --- Transactions ---

export type TransactionStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'MANUAL';
export type TransactionDirection = 'SENT' | 'RECEIVED' | 'TOP_UP';

export interface Friend {
  id: number;
  user_id: number;
  name: string;
  recognized_name: string;
  category_id: number;
  created_at: string;
  updated_at: string;
  category: Category | null;
}

export interface CreateFriendRequest {
  name: string;
  recognized_name: string;
  category_id: number;
}

export interface UpdateFriendRequest {
  name?: string;
  recognized_name?: string;
  category_id?: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  amount: string;
  currency: string;
  timestamp: string;
  merchant_id: number | null;
  merchant_raw_name: string | null;
  category_id: number | null;
  upi_reference_id: string | null;
  upi_vpa: string | null;
  payment_app: string | null;
  direction: TransactionDirection;
  is_reimbursement: boolean;
  friend_id: number | null;
  amount_paid_for_someone_else: string | null;
  status: TransactionStatus;
  notes: string | null;
  has_receipt: boolean;
  created_at: string;
  updated_at: string;
  category: Category | null;
  merchant: Merchant | null;
  friend: Friend | null;
}

export type TransactionListItemResponse = Transaction;

export interface TransactionDetailResponse extends Transaction {
  raw_extracted_text?: string | null;
}

export interface CreateManualTransactionRequest {
  amount: number;
  currency?: string;
  timestamp?: string;
  merchant_id?: number | null;
  merchant_raw_name?: string | null;
  category_id?: number | null;
  upi_reference_id?: string | null;
  upi_vpa?: string | null;
  payment_app?: string | null;
  notes?: string | null;
  set_as_merchant_default?: boolean;
  direction?: TransactionDirection;
  is_reimbursement?: boolean | null;
  friend_id?: number | null;
  amount_paid_for_someone_else?: number | null;
}

export interface UpdateTransactionRequest {
  amount?: number;
  currency?: string;
  timestamp?: string;
  merchant_id?: number | null;
  merchant_raw_name?: string | null;
  category_id?: number | null;
  notes?: string | null;
  set_as_merchant_default?: boolean;
  direction?: TransactionDirection;
  is_reimbursement?: boolean | null;
  friend_id?: number | null;
  amount_paid_for_someone_else?: number | null;
}

export interface TransactionBulkDeleteRequest {
  transaction_ids: number[];
}

export interface TransactionBulkDeleteResponse {
  deleted_count: number;
  transaction_ids: number[];
}

// --- Receipt Scanning & Confirmation ---

export interface ReceiptExtractionInfo {
  raw_text: string | null;
  detected_app: string | null;
  confidence_score: number | null;
  warnings: string[];
}

export interface ReceiptDuplicateInfo {
  is_duplicate: boolean;
  existing_transaction_id: number | null;
  reason: string | null;
}

export interface ReceiptScanResponse {
  transaction: TransactionDetailResponse;
  extraction: ReceiptExtractionInfo;
  duplicate: ReceiptDuplicateInfo;
}

export interface ReceiptConfirmRequest {
  amount: number;
  category_id: number;
  timestamp: string;
  merchant_name?: string;
  notes?: string;
  is_reimbursement?: boolean;
}

// --- Budgets ---

export interface Budget {
  id: number;
  user_id: number;
  category_id: number;
  month: number;
  year: number;
  amount_limit: string;
  created_at: string;
  updated_at: string;
  category: Category | null;
}

export interface BudgetSummary {
  id: number;
  user_id: number;
  category_id: number;
  month: number;
  year: number;
  amount_limit: string;
  created_at: string;
  updated_at: string;
  category: Category | null;
  spent_amount: string;
  remaining_amount: string;
  percentage_used: number;
  is_over_budget: boolean;
}

export interface SetBudgetRequest {
  category_id: number;
  month: number;
  year: number;
  amount_limit: number;
}

export interface CategorySpendingItem {
  category_id: number | null;
  category_name: string;
  category_color: string;
  category_icon?: string | null;
  spent_amount: string | number;
  percentage: number;
}

export interface MonthlySpendingBreakdown {
  month: number;
  year: number;
  total_spent: string | number;
  items: CategorySpendingItem[];
}

// --- Budget Presets ---

export interface BudgetPresetItem {
  id: number;
  preset_id: number;
  category_id: number;
  amount: string;
  category?: Category | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetPreset {
  id: number;
  user_id: number;
  name: string;
  items: BudgetPresetItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetPresetItemRequest {
  category_id: number;
  amount: number;
}

export interface CreateBudgetPresetRequest {
  name: string;
  items: CreateBudgetPresetItemRequest[];
}

export interface UpdateBudgetPresetRequest {
  name?: string;
  items?: CreateBudgetPresetItemRequest[];
}

export interface ApplyBudgetPresetRequest {
  month: number;
  year: number;
}

// --- Merchant Rules ---

export interface UserMerchantRule {
  id: number;
  user_id: number;
  merchant_pattern: string;
  category_id: number;
  priority: number;
  created_at: string;
  updated_at: string;
  category: Category | null;
}

export interface CreateMerchantRuleRequest {
  merchant_pattern: string;
  category_id: number;
  priority?: number;
}

// --- Errors ---

export interface APIValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface APIError {
  detail: string | APIValidationErrorItem[];
}
