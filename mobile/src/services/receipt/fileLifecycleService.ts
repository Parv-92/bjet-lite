/**
 * Bjet Mobile - File Lifecycle & Storage Cleanup Service
 *
 * Centralized coordinator for managing the lifecycle of temporary import files:
 * - Registers and tracks the active source file URI (DocumentPicker PDF).
 * - Safely deletes temporary PDFs upon completion, cancellation, replacement, or failure.
 * - Enforces zero permanent file retention (transactions in DB are canonical).
 * - Sanitizes orphaned temporary files at startup with a safe age threshold.
 * - Defensive: idempotent, never throws unhandled errors, never corrupts transactions.
 */

// @ts-ignore
import { cleanupPdfPageImage, sanitizeTemporaryFiles } from 'expo-pdf-page-renderer';

export interface CleanupResult {
  success: boolean;
  fileUri?: string;
  error?: string;
}

export class FileLifecycleService {
  private activeSourceUri: string | null = null;
  private isProcessing: boolean = false;

  /**
   * Register a new temporary source file URI for the active import session.
   * If a different source file was previously registered, the old one is safely cleaned up.
   */
  public async registerSourceFile(uri: string): Promise<void> {
    if (!uri || typeof uri !== 'string') return;

    if (this.activeSourceUri && this.activeSourceUri !== uri) {
      // Auto-cleanup previous replaced file
      await this.deleteFileSafely(this.activeSourceUri);
    }
    this.activeSourceUri = uri;
  }

  /**
   * Get the currently registered source file URI.
   */
  public getActiveSourceFile(): string | null {
    return this.activeSourceUri;
  }

  /**
   * Mark whether an active extraction / parsing operation is in progress.
   * Prevents premature deletion during processing.
   */
  public setProcessing(processing: boolean): void {
    this.isProcessing = processing;
  }

  public getIsProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Safely deletes a file by URI or local filesystem path.
   * Defensive: Handles file:// prefix, nonexistent files, null/empty URIs, and native errors.
   */
  public async deleteFileSafely(uri?: string | null): Promise<CleanupResult> {
    if (!uri || typeof uri !== 'string') {
      return { success: true };
    }

    try {
      const cleanUri = uri.trim();
      if (!cleanUri) return { success: true };

      // In Node.js testing environment (fallback if nativeModule not loaded):
      if (
        typeof process !== 'undefined' &&
        process.versions?.node &&
        !process.env.TEST_NATIVE &&
        typeof cleanupPdfPageImage !== 'function'
      ) {
        try {
          const fs = require('fs');
          const path = cleanUri.replace(/^file:\/\//, '');
          if (fs.existsSync(path)) {
            fs.unlinkSync(path);
          }
          return { success: true, fileUri: cleanUri };
        } catch {
          // Fall through
        }
      }

      // In React Native: call nativeModule cleanupFile
      const success = await cleanupPdfPageImage(cleanUri);
      return { success, fileUri: cleanUri };
    } catch (err: any) {
      console.warn(`[FileLifecycle] Failed to delete file ${uri}:`, err?.message || err);
      return { success: false, fileUri: uri, error: err?.message || 'Unknown deletion error' };
    }
  }

  /**
   * Cleans up the active source file for the current session.
   */
  public async cleanupActiveSourceFile(): Promise<CleanupResult> {
    if (this.isProcessing) {
      console.warn('[FileLifecycle] Attempted to delete active file while processing is in progress; deferred.');
      return { success: false, error: 'Processing in progress' };
    }

    const uriToDelete = this.activeSourceUri;
    this.activeSourceUri = null;

    if (!uriToDelete) {
      return { success: true };
    }

    return await this.deleteFileSafely(uriToDelete);
  }

  /**
   * Complete session cleanup (called on confirmation done, abandonment, or reset).
   */
  public async cleanupSession(sourceUriOverride?: string): Promise<{
    sourceDeleted: boolean;
    orphansCleaned: number;
  }> {
    const targetUri = sourceUriOverride || this.activeSourceUri;
    this.activeSourceUri = null;
    this.isProcessing = false;

    let sourceDeleted = true;
    if (targetUri) {
      const res = await this.deleteFileSafely(targetUri);
      sourceDeleted = res.success;
    }

    return {
      sourceDeleted,
      orphansCleaned: 0,
    };
  }

  /**
   * Startup sanitation sweep: deletes stale DocumentPicker PDFs and pdf_page PNGs
   * older than the specified age (default: 30 minutes).
   */
  public async sanitizeOrphans(olderThanMs: number = 30 * 60 * 1000): Promise<number> {
    try {
      if (typeof sanitizeTemporaryFiles === 'function') {
        const cleaned = await sanitizeTemporaryFiles(olderThanMs);
        if (cleaned > 0) {
          console.log(`[FileLifecycle] Startup sanitation removed ${cleaned} stale temporary import files.`);
        }
        return cleaned;
      }
      return 0;
    } catch (err: any) {
      console.warn('[FileLifecycle] Startup sanitation warning:', err?.message || err);
      return 0;
    }
  }
}

export const fileLifecycleService = new FileLifecycleService();
