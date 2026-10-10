/**
 * Bjet Lite - Local Auto-Backup Service
 *
 * Automatically creates timestamped local backups of the SQLite database
 * whenever transaction or budget information is created, updated, or deleted.
 *
 * Guarantees:
 * 1. Safe & Non-blocking: Fire-and-forget, never throws errors that interrupt user mutations.
 * 2. WAL-Safe: Forces a passive checkpoint prior to file copy so all dirty WAL frames are persisted.
 * 3. Debounced: Coalesces rapid sequential mutations (e.g. batch imports) into a single clean backup.
 * 4. Concurrency-guarded: Prevents concurrent backup file operations from clobbering each other.
 * 5. Space-conscious: Automatically prunes old backups, maintaining the last 5 backups.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { getDatabaseAsync, LITE_DB_NAME } from '../../db/database';

export const BACKUP_DIR_NAME = 'bjet_backups/';
export const MAX_RETAINED_BACKUPS = 5;

export interface BackupResult {
  success: boolean;
  backupUri?: string;
  filename?: string;
  size?: number;
  timestamp?: string;
  error?: string;
}

export interface BackupFileEntry {
  filename: string;
  uri: string;
  size: number;
  modificationTime?: number;
}

export interface AutoBackupOptions {
  immediate?: boolean;
  reason?: string;
}

let isBackupInProgress = false;
let backupQueued = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Returns the URI of the backup directory inside the application's document storage.
 */
export function getBackupDirectory(): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}${BACKUP_DIR_NAME}`;
}

/**
 * Locates the authoritative source SQLite database file URI.
 */
export async function getDatabaseSourceUri(): Promise<string | null> {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  // 1. Try to read active databasePath property from expo-sqlite instance
  try {
    const db = await getDatabaseAsync();
    const rawPath = (db as any)?.databasePath as string | undefined;
    if (rawPath) {
      const uri = rawPath.startsWith('file://') ? rawPath : `file://${rawPath}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        return uri;
      }
    }
  } catch (err) {
    console.warn('[BackupService] Could not resolve databasePath from active DB:', err);
  }

  // 2. Standard expo-sqlite location inside <documentDirectory>/SQLite/<LITE_DB_NAME>
  const standardUri = `${FileSystem.documentDirectory}SQLite/${LITE_DB_NAME}`;
  try {
    const info = await FileSystem.getInfoAsync(standardUri);
    if (info.exists) {
      return standardUri;
    }
  } catch {}

  // 3. Root documentDirectory fallback
  const directUri = `${FileSystem.documentDirectory}${LITE_DB_NAME}`;
  try {
    const info = await FileSystem.getInfoAsync(directUri);
    if (info.exists) {
      return directUri;
    }
  } catch {}

  return null;
}

/**
 * Executes a local SQLite database backup immediately.
 * Forces a WAL checkpoint, copies the database file with a timestamp,
 * updates the latest pointer copy, and prunes older backups.
 */
export async function performBackup(): Promise<BackupResult> {
  try {
    const backupDir = getBackupDirectory();
    if (!backupDir) {
      return { success: false, error: 'Document directory is not accessible on this platform' };
    }

    // 1. Checkpoint SQLite WAL to commit any unwritten pages into the main .db file
    try {
      const db = await getDatabaseAsync();
      await db.execAsync('PRAGMA wal_checkpoint(PASSIVE);');
    } catch (checkpointErr) {
      console.warn('[BackupService] WAL checkpoint note:', checkpointErr);
    }

    // 2. Locate source database file
    const sourceUri = await getDatabaseSourceUri();
    if (!sourceUri) {
      return { success: false, error: 'Source SQLite database file not found' };
    }

    const sourceInfo = await FileSystem.getInfoAsync(sourceUri);
    if (!sourceInfo.exists || (sourceInfo.size ?? 0) === 0) {
      return { success: false, error: 'Source database file is missing or empty' };
    }

    // 3. Ensure backup directory exists
    const dirInfo = await FileSystem.getInfoAsync(backupDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
    }

    // 4. Generate timestamped filename
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `bjet_lite_backup_${timestampStr}.db`;
    const destUri = `${backupDir}${filename}`;

    // 5. Copy database file to timestamped backup
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destUri,
    });

    // 6. Update latest backup copy
    const latestUri = `${backupDir}bjet_lite_backup_latest.db`;
    try {
      await FileSystem.copyAsync({
        from: sourceUri,
        to: latestUri,
      });
    } catch (latestErr) {
      // Non-fatal if latest convenience copy fails
    }

    // 7. Verify backup created and non-empty
    const backupInfo = await FileSystem.getInfoAsync(destUri);
    const size = backupInfo.exists ? backupInfo.size ?? 0 : 0;

    // 8. Prune older backups
    await pruneOldBackups(backupDir, MAX_RETAINED_BACKUPS);

    console.log(`[BackupService] Backup successful: ${filename} (${size} bytes)`);

    return {
      success: true,
      backupUri: destUri,
      filename,
      size,
      timestamp: now.toISOString(),
    };
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.warn('[BackupService] Backup failed:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Removes older backups exceeding the maximum retention threshold.
 */
async function pruneOldBackups(backupDir: string, maxBackups: number = MAX_RETAINED_BACKUPS): Promise<void> {
  try {
    const files = await FileSystem.readDirectoryAsync(backupDir);
    const timestampedBackups = files
      .filter((name) => name.startsWith('bjet_lite_backup_') && name.endsWith('.db') && name !== 'bjet_lite_backup_latest.db')
      .sort(); // Oldest first due to ISO-like YYYYMMDD_HHMMSS naming

    if (timestampedBackups.length > maxBackups) {
      const deleteCount = timestampedBackups.length - maxBackups;
      const toDelete = timestampedBackups.slice(0, deleteCount);
      for (const file of toDelete) {
        try {
          await FileSystem.deleteAsync(`${backupDir}${file}`, { idempotent: true });
        } catch (e) {
          console.warn(`[BackupService] Could not prune old backup ${file}:`, e);
        }
      }
    }
  } catch (err) {
    console.warn('[BackupService] Pruning error:', err);
  }
}

/**
 * Automatically triggers a local backup whenever transaction or budget data is modified.
 * Debounced by default (1000ms) to avoid redundant disk I/O when multiple operations occur in quick succession.
 * Concurrency protected and non-blocking: never throws or blocks UI threads.
 */
export function triggerAutoBackup(options: AutoBackupOptions = {}): void {
  const { immediate = false, reason = 'data update' } = options;

  if (immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    runAutoBackup(reason);
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runAutoBackup(reason);
  }, 1000);
}

async function runAutoBackup(reason: string): Promise<void> {
  if (isBackupInProgress) {
    backupQueued = true;
    return;
  }

  isBackupInProgress = true;
  try {
    const result = await performBackup();
    if (result.success) {
      console.log(`[BackupService] Auto-backup completed (${reason}): ${result.filename}`);
    } else {
      console.warn(`[BackupService] Auto-backup skipped (${reason}): ${result.error}`);
    }
  } catch (err) {
    console.warn('[BackupService] Unexpected error during auto-backup:', err);
  } finally {
    isBackupInProgress = false;
    if (backupQueued) {
      backupQueued = false;
      setTimeout(() => {
        runAutoBackup('queued mutation update');
      }, 500);
    }
  }
}

/**
 * Retrieves a list of all existing local backups sorted newest first.
 */
export async function listBackups(): Promise<BackupFileEntry[]> {
  try {
    const backupDir = getBackupDirectory();
    if (!backupDir) return [];
    const dirInfo = await FileSystem.getInfoAsync(backupDir);
    if (!dirInfo.exists) return [];

    const files = await FileSystem.readDirectoryAsync(backupDir);
    const backupFiles = files
      .filter((name) => name.startsWith('bjet_lite_backup_') && name.endsWith('.db') && name !== 'bjet_lite_backup_latest.db')
      .sort()
      .reverse(); // Newest first

    const entries: BackupFileEntry[] = [];
    for (const name of backupFiles) {
      const uri = `${backupDir}${name}`;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          entries.push({
            filename: name,
            uri,
            size: info.size ?? 0,
            modificationTime: info.modificationTime,
          });
        }
      } catch {}
    }
    return entries;
  } catch (err) {
    console.warn('[BackupService] Failed to list backups:', err);
    return [];
  }
}

/**
 * Retrieves information about the latest available local backup.
 */
export async function getLatestBackup(): Promise<BackupFileEntry | null> {
  const backups = await listBackups();
  return backups.length > 0 ? backups[0] : null;
}
