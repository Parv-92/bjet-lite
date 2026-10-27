/**
 * Bjet Mobile - Receipt & Statement Text Extraction Types (Phase 6)
 * Pure extraction domain models: Document classification, extraction method,
 * and structured extraction metadata.
 *
 * NOTE: This module represents extracted document content, NOT interpreted
 * transaction records. No transaction parsing or creation occurs here.
 */

import type { ReceiptFile } from '../../types/receipt';

export type ExtractionMethod = 'OCR' | 'PDF_TEXT' | 'PDF_OCR';

export type DocumentType =
  | 'INDIVIDUAL_RECEIPT'
  | 'TRANSACTION_STATEMENT'
  | 'UNKNOWN';

export interface ReceiptExtractionResult {
  rawText: string;
  extractionMethod: ExtractionMethod;
  documentType: DocumentType;
  pageCount?: number;
  warnings: string[];
  characterCount?: number;
  nonWhitespaceCharacterCount?: number;
  nonEmptyLineCount?: number;
  extractionDurationMs?: number;
  pageFailures?: number[];
}

export type ExtractionStep =
  | 'preparing'
  | 'extracting'
  | 'rendering'
  | 'ocr'
  | 'classifying'
  | 'completed';

export interface ExtractionProgress {
  step: ExtractionStep;
  currentPage?: number;
  totalPages?: number;
  message: string;
}

export interface CancellationToken {
  aborted: boolean;
}

export interface ReceiptTextExtractor {
  extract(
    file: ReceiptFile,
    onProgress?: (progress: ExtractionProgress) => void,
    cancellationToken?: CancellationToken
  ): Promise<ReceiptExtractionResult>;
}
