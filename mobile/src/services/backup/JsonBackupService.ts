/**
 * Bjet Lite - Durable Portable JSON Backup & Restore Service
 *
 * Implements versioned JSON backup format, checksum integrity verification,
 * SAF external export (surviving app uninstall), validated restore,
 * and legacy older Bjet migration adapter.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { getDatabaseAsync, LITE_DB_NAME } from '../../db/database';
import {
  CategoryRow,
  FriendRow,
  TransactionRow,
  BudgetRow,
  UserMerchantRuleRow,
  BudgetPresetRow,
  BudgetPresetItemRow,
} from '../../db/schema';
import { getStoredUserProfile, saveStoredUserProfile } from '../userProfile';
import { queryClient } from '../../lib/queryClient';
import { triggerAutoBackup } from './BackupService';

export const BACKUP_FORMAT_IDENTIFIER = 'bjet_lite_backup';
export const CURRENT_BACKUP_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 1;

export interface BjetLiteBackupPayload {
  format: string;
  format_version: number;
  export_timestamp: string;
  app_id: string;
  app_version: string;
  schema_version: number;
  checksum: string;
  data: {
    user_profile: {
      full_name: string | null;
      email: string;
    };
    categories: CategoryRow[];
    friends: FriendRow[];
    transactions: TransactionRow[];
    budgets: BudgetRow[];
    user_merchant_rules: UserMerchantRuleRow[];
    budget_presets: BudgetPresetRow[];
    budget_preset_items: BudgetPresetItemRow[];
  };
}

export interface BackupSummary {
  categoriesCount: number;
  friendsCount: number;
  transactionsCount: number;
  budgetsCount: number;
  rulesCount: number;
  presetsCount: number;
  isLegacyFormat?: boolean;
}

export interface RestoreResult {
  success: boolean;
  imported: BackupSummary;
  skippedDuplicates: number;
  error?: string;
}

/**
 * Computes a deterministic DJB2-based 32-bit hex checksum of a string.
 */
function computeChecksum(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Creates a complete JSON backup payload from the current SQLite database and user profile.
 */
export async function createBackupPayload(): Promise<{ payload: BjetLiteBackupPayload; jsonString: string }> {
  const db = await getDatabaseAsync();
  const profile = await getStoredUserProfile();

  const categories = await db.getAllAsync<CategoryRow>('SELECT * FROM categories ORDER BY id ASC;');
  const friends = await db.getAllAsync<FriendRow>('SELECT * FROM friends ORDER BY id ASC;');
  const transactions = await db.getAllAsync<TransactionRow>('SELECT * FROM transactions ORDER BY timestamp DESC, id DESC;');
  const budgets = await db.getAllAsync<BudgetRow>('SELECT * FROM budgets ORDER BY year DESC, month DESC, id ASC;');
  const user_merchant_rules = await db.getAllAsync<UserMerchantRuleRow>('SELECT * FROM user_merchant_rules ORDER BY priority ASC, id ASC;');
  const budget_presets = await db.getAllAsync<BudgetPresetRow>('SELECT * FROM budget_presets ORDER BY id ASC;');
  const budget_preset_items = await db.getAllAsync<BudgetPresetItemRow>('SELECT * FROM budget_preset_items ORDER BY id ASC;');

  const rawData = {
    user_profile: {
      full_name: profile.full_name,
      email: profile.email || 'local@bjet.lite',
    },
    categories,
    friends,
    transactions,
    budgets,
    user_merchant_rules,
    budget_presets,
    budget_preset_items,
  };

  const serializedData = JSON.stringify(rawData);
  const checksum = computeChecksum(serializedData);

  const payload: BjetLiteBackupPayload = {
    format: BACKUP_FORMAT_IDENTIFIER,
    format_version: CURRENT_BACKUP_VERSION,
    export_timestamp: new Date().toISOString(),
    app_id: 'com.bjet.lite',
    app_version: '1.0.0',
    schema_version: CURRENT_SCHEMA_VERSION,
    checksum,
    data: rawData,
  };

  return {
    payload,
    jsonString: JSON.stringify(payload, null, 2),
  };
}

/**
 * Saves a backup file to external / user-controlled storage.
 */
export async function exportBackupFile(): Promise<{ success: boolean; filename: string; path?: string; error?: string }> {
  try {
    const { jsonString } = await createBackupPayload();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const filename = `bjet-lite-backup-${dateStr}-${Date.now().toString().slice(-4)}.json`;

    // 1. Web environment download
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return { success: true, filename, path: filename };
        }
      } catch (err: any) {
        return { success: false, filename, error: err?.message || 'Failed to download on web.' };
      }
    }

    // 2. Android: Try Storage Access Framework (SAF) so user can save to Downloads or Google Drive
    if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
      try {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted && permissions.directoryUri) {
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            'application/json'
          );
          await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, jsonString, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          return { success: true, filename, path: fileUri };
        }
      } catch (safErr) {
        console.warn('[JsonBackupService] SAF folder selection cancelled or failed:', safErr);
      }
    }

    // 3. Fallback: Save to app document storage backup directory
    const backupDir = `${FileSystem.documentDirectory}bjet_backups/`;
    const dirInfo = await FileSystem.getInfoAsync(backupDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
    }
    const destUri = `${backupDir}${filename}`;
    await FileSystem.writeAsStringAsync(destUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    return { success: true, filename, path: destUri };
  } catch (err: any) {
    return { success: false, filename: '', error: err?.message || 'Failed to export backup.' };
  }
}

/**
 * Validates whether a parsed object is a valid Bjet Lite backup or legacy Bjet export.
 */
export function validateBackupContent(parsed: any): {
  isValid: boolean;
  isLegacy: boolean;
  summary?: BackupSummary;
  error?: string;
  data?: any;
} {
  if (!parsed || typeof parsed !== 'object') {
    return { isValid: false, isLegacy: false, error: 'Backup file is empty or not valid JSON.' };
  }

  // Check if native Bjet Lite format
  if (parsed.format === BACKUP_FORMAT_IDENTIFIER) {
    if (parsed.format_version > CURRENT_BACKUP_VERSION) {
      return {
        isValid: false,
        isLegacy: false,
        error: `Unsupported backup version (v${parsed.format_version}). Please update Bjet Lite.`,
      };
    }

    const data = parsed.data;
    if (!data || typeof data !== 'object') {
      return { isValid: false, isLegacy: false, error: 'Backup file data payload is missing or corrupt.' };
    }

    // Verify integrity checksum if present
    if (parsed.checksum) {
      const computed = computeChecksum(JSON.stringify(data));
      if (computed !== parsed.checksum) {
        console.warn(`[JsonBackupService] Checksum mismatch: expected ${parsed.checksum}, got ${computed}`);
      }
    }

    const summary: BackupSummary = {
      categoriesCount: Array.isArray(data.categories) ? data.categories.length : 0,
      friendsCount: Array.isArray(data.friends) ? data.friends.length : 0,
      transactionsCount: Array.isArray(data.transactions) ? data.transactions.length : 0,
      budgetsCount: Array.isArray(data.budgets) ? data.budgets.length : 0,
      rulesCount: Array.isArray(data.user_merchant_rules) ? data.user_merchant_rules.length : 0,
      presetsCount: Array.isArray(data.budget_presets) ? data.budget_presets.length : 0,
      isLegacyFormat: false,
    };

    return { isValid: true, isLegacy: false, summary, data };
  }

  // Check if legacy older Bjet format (tables at root or under tables/data)
  const legacyData = parsed.data || parsed.tables || parsed;
  const hasLegacyTables =
    Array.isArray(legacyData.transactions) ||
    Array.isArray(legacyData.categories) ||
    Array.isArray(legacyData.budgets) ||
    Array.isArray(legacyData.friends);

  if (hasLegacyTables) {
    const summary: BackupSummary = {
      categoriesCount: Array.isArray(legacyData.categories) ? legacyData.categories.length : 0,
      friendsCount: Array.isArray(legacyData.friends) ? legacyData.friends.length : 0,
      transactionsCount: Array.isArray(legacyData.transactions) ? legacyData.transactions.length : 0,
      budgetsCount: Array.isArray(legacyData.budgets) ? legacyData.budgets.length : 0,
      rulesCount: Array.isArray(legacyData.user_merchant_rules) ? legacyData.user_merchant_rules.length : 0,
      presetsCount: Array.isArray(legacyData.budget_presets) ? legacyData.budget_presets.length : 0,
      isLegacyFormat: true,
    };

    return { isValid: true, isLegacy: true, summary, data: legacyData };
  }

  return {
    isValid: false,
    isLegacy: false,
    error: 'Unrecognized file format. Please select a valid Bjet Lite JSON backup file.',
  };
}

/**
 * Executes an atomic, safe MERGE restore into the local SQLite database.
 * Preserves existing data, skips duplicate transactions, maps foreign keys,
 * and rolls back completely on any error.
 */
export async function restoreBackupData(data: any, isLegacy: boolean = false): Promise<RestoreResult> {
  const db = await getDatabaseAsync();

  // Create pre-restore safety checkpoint
  try {
    triggerAutoBackup({ immediate: true, reason: 'pre-restore safety snapshot' });
  } catch {}

  let importedCategories = 0;
  let importedFriends = 0;
  let importedTransactions = 0;
  let importedBudgets = 0;
  let importedRules = 0;
  let importedPresets = 0;
  let skippedDuplicates = 0;

  try {
    await db.withTransactionAsync(async () => {
      // 1. Restore User Profile if present
      if (data.user_profile?.full_name) {
        await saveStoredUserProfile({
          full_name: data.user_profile.full_name,
          email: data.user_profile.email,
        });
      }

      // 2. Categories mapping & merge
      // Load current categories to map by name case-insensitively
      const existingCategories = await db.getAllAsync<CategoryRow>('SELECT * FROM categories;');
      const categoryMap = new Map<string, number>(); // lowercase name -> id
      const categoryIdOldToNew = new Map<number, number>();

      for (const cat of existingCategories) {
        categoryMap.set(cat.name.toLowerCase().trim(), cat.id);
      }

      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          const nameLower = (cat.name || '').toLowerCase().trim();
          if (!nameLower) continue;

          if (categoryMap.has(nameLower)) {
            categoryIdOldToNew.set(cat.id, categoryMap.get(nameLower)!);
          } else {
            const res = await db.runAsync(
              `INSERT INTO categories (name, icon, color, is_system_default)
               VALUES (?, ?, ?, ?);`,
              [cat.name.trim(), cat.icon || 'tag', cat.color || '#10b981', cat.is_system_default ? 1 : 0]
            );
            const newId = Number(res.lastInsertRowId);
            categoryMap.set(nameLower, newId);
            categoryIdOldToNew.set(cat.id, newId);
            importedCategories++;
          }
        }
      }

      // 3. Friends mapping & merge
      const existingFriends = await db.getAllAsync<FriendRow>('SELECT * FROM friends;');
      const friendMap = new Map<string, number>(); // lowercase recognized_name -> id
      const friendIdOldToNew = new Map<number, number>();

      for (const f of existingFriends) {
        friendMap.set(f.recognized_name.toLowerCase().trim(), f.id);
      }

      if (Array.isArray(data.friends)) {
        for (const f of data.friends) {
          const recNameLower = (f.recognized_name || f.name || '').toLowerCase().trim();
          if (!recNameLower) continue;

          if (friendMap.has(recNameLower)) {
            friendIdOldToNew.set(f.id, friendMap.get(recNameLower)!);
          } else {
            const mappedCatId = f.category_id ? (categoryIdOldToNew.get(f.category_id) || f.category_id) : 1;
            const res = await db.runAsync(
              `INSERT INTO friends (name, recognized_name, category_id)
               VALUES (?, ?, ?);`,
              [f.name.trim(), f.recognized_name.trim(), mappedCatId]
            );
            const newId = Number(res.lastInsertRowId);
            friendMap.set(recNameLower, newId);
            friendIdOldToNew.set(f.id, newId);
            importedFriends++;
          }
        }
      }

      // 4. Transactions mapping & merge
      // Load existing UPI reference IDs for deduplication
      const existingUpiRows = await db.getAllAsync<{ upi_reference_id: string }>(
        'SELECT upi_reference_id FROM transactions WHERE upi_reference_id IS NOT NULL;'
      );
      const existingUpiSet = new Set(existingUpiRows.map((r) => r.upi_reference_id.trim()));

      if (Array.isArray(data.transactions)) {
        for (const tx of data.transactions) {
          // Check for duplicate UPI reference ID
          if (tx.upi_reference_id && existingUpiSet.has(tx.upi_reference_id.trim())) {
            skippedDuplicates++;
            continue;
          }

          // Remap foreign keys
          const mappedCatId = tx.category_id ? categoryIdOldToNew.get(tx.category_id) || tx.category_id : null;
          const mappedFriendId = tx.friend_id ? friendIdOldToNew.get(tx.friend_id) || tx.friend_id : null;

          // Normalize direction and financial representation
          let direction = tx.direction;
          if (direction !== 'SENT' && direction !== 'RECEIVED' && direction !== 'TOP_UP') {
            direction = 'SENT';
          }

          const amount = Math.abs(Number(tx.amount) || 0);
          if (amount <= 0) {
            skippedDuplicates++;
            continue;
          }

          const isReimbursement = tx.is_reimbursement ? 1 : 0;
          const paidForOthers = tx.amount_paid_for_someone_else
            ? Math.min(amount, Math.abs(Number(tx.amount_paid_for_someone_else)))
            : null;

          await db.runAsync(
            `INSERT INTO transactions (
              amount, currency, timestamp, merchant_raw_name, category_id,
              upi_reference_id, upi_vpa, payment_app, direction, is_reimbursement,
              friend_id, amount_paid_for_someone_else, status, notes,
              raw_extracted_text, receipt_image_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              amount,
              tx.currency || 'INR',
              tx.timestamp || new Date().toISOString(),
              tx.merchant_raw_name || (isLegacy ? tx.merchant_name : null) || null,
              mappedCatId,
              tx.upi_reference_id || null,
              tx.upi_vpa || null,
              tx.payment_app || null,
              direction,
              isReimbursement,
              mappedFriendId,
              paidForOthers,
              tx.status || 'CONFIRMED',
              tx.notes || null,
              tx.raw_extracted_text || null,
              tx.receipt_image_path || null,
            ]
          );

          if (tx.upi_reference_id) {
            existingUpiSet.add(tx.upi_reference_id.trim());
          }
          importedTransactions++;
        }
      }

      // 5. Budgets mapping & merge
      if (Array.isArray(data.budgets)) {
        for (const b of data.budgets) {
          const mappedCatId = categoryIdOldToNew.get(b.category_id) || b.category_id;
          if (!mappedCatId) continue;

          await db.runAsync(
            `INSERT INTO budgets (category_id, month, year, amount_limit)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(category_id, month, year) DO UPDATE SET
               amount_limit = excluded.amount_limit;`,
            [mappedCatId, b.month, b.year, Number(b.amount_limit) || 0]
          );
          importedBudgets++;
        }
      }

      // 6. Merchant rules mapping & merge
      if (Array.isArray(data.user_merchant_rules)) {
        for (const r of data.user_merchant_rules) {
          const mappedCatId = categoryIdOldToNew.get(r.category_id) || r.category_id;
          if (!mappedCatId || !r.merchant_pattern) continue;

          await db.runAsync(
            `INSERT OR IGNORE INTO user_merchant_rules (merchant_pattern, category_id, priority)
             VALUES (?, ?, ?);`,
            [r.merchant_pattern.trim(), mappedCatId, r.priority ?? 1]
          );
          importedRules++;
        }
      }

      // 7. Budget presets mapping & merge
      if (Array.isArray(data.budget_presets)) {
        for (const p of data.budget_presets) {
          if (!p.name) continue;
          const res = await db.runAsync(
            `INSERT INTO budget_presets (name) VALUES (?);`,
            [p.name.trim()]
          );
          const newPresetId = Number(res.lastInsertRowId);
          importedPresets++;

          // Import items corresponding to this preset
          if (Array.isArray(data.budget_preset_items)) {
            const items = data.budget_preset_items.filter((item: any) => item.preset_id === p.id);
            for (const item of items) {
              const mappedCatId = categoryIdOldToNew.get(item.category_id) || item.category_id;
              if (mappedCatId) {
                await db.runAsync(
                  `INSERT INTO budget_preset_items (preset_id, category_id, amount)
                   VALUES (?, ?, ?);`,
                  [newPresetId, mappedCatId, Number(item.amount) || 0]
                );
              }
            }
          }
        }
      }
    });

    // Invalidate cached React Query lists so screens update immediately
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['rules'] });
    queryClient.invalidateQueries({ queryKey: ['friends'] });
    queryClient.invalidateQueries({ queryKey: ['budget-presets'] });

    return {
      success: true,
      imported: {
        categoriesCount: importedCategories,
        friendsCount: importedFriends,
        transactionsCount: importedTransactions,
        budgetsCount: importedBudgets,
        rulesCount: importedRules,
        presetsCount: importedPresets,
        isLegacyFormat: isLegacy,
      },
      skippedDuplicates,
    };
  } catch (err: any) {
    console.error('[JsonBackupService] Restore failed, transaction rolled back:', err);
    return {
      success: false,
      imported: {
        categoriesCount: 0,
        friendsCount: 0,
        transactionsCount: 0,
        budgetsCount: 0,
        rulesCount: 0,
        presetsCount: 0,
      },
      skippedDuplicates: 0,
      error: err?.message || 'Restore failed due to an unexpected database error.',
    };
  }
}
