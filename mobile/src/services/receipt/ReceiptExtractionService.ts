/**
 * Bjet Mobile - Receipt Extraction Service (Phase 6 Coordinator)
 *
 * Orchestrates document classification, direct PDF extraction, quality heuristic
 * evaluation, and OCR fallback. Keeps extraction and parsing logic cleanly outside the UI.
 *
 * Requirements:
 * - Direct text extraction first for PDFs (no OCR for normal text PDFs).
 * - Multi-signal quality heuristic evaluation before deciding on OCR fallback.
 * - Image files routed to ImageOCRExtractor.
 * - Supports progress reporting and user cancellation.
 * - Zero transaction creation (POST /transactions forbidden in Phase 6).
 */

import { ReceiptFile } from '../../types/receipt';
import {
  CancellationToken,
  ExtractionProgress,
  ReceiptExtractionResult,
} from './types';
import { PdfTextExtractor } from './extractors/PdfTextExtractor';

export class ReceiptExtractionService {
  private pdfTextExtractor: PdfTextExtractor;

  constructor(pdfTextExtractor?: PdfTextExtractor) {
    this.pdfTextExtractor = pdfTextExtractor || new PdfTextExtractor();
  }

  /**
   * Main entry point to extract text and classification metadata from a UPI statement PDF.
   */
  public async extract(
    file: ReceiptFile,
    onProgress?: (progress: ExtractionProgress) => void,
    cancellationToken?: CancellationToken
  ): Promise<ReceiptExtractionResult> {
    if (!file || !file.uri) {
      throw new Error('Invalid file: Missing file reference or URI.');
    }

    if (cancellationToken?.aborted) {
      throw new Error('Extraction cancelled by user.');
    }

    const isPdf =
      file.mimeType === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      throw new Error(
        'Unsupported file format. Please select a text-based monthly UPI statement in PDF format (Google Pay, Paytm, or PhonePe).'
      );
    }

    return this.pdfTextExtractor.extract(file, onProgress, cancellationToken);
  }
}
