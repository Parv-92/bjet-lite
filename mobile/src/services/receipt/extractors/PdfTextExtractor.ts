/**
 * Bjet Mobile - PDF Text Extractor (Phase 6)
 * Extracts embedded text from text-selectable PDFs using Mozilla PDF.js (legacy build).
 *
 * Requirements:
 * - 100% pure JavaScript, compatible with Hermes / React Native / Android.
 * - Extracts text directly without invoking OCR.
 * - Preserves document and page order.
 * - Inserts stable page boundary markers (`--- PAGE X ---`).
 * - Preserves meaningful line breaks, currency symbols, UPI IDs, dates, and amounts.
 * - Controlled memory usage and progress reporting.
 */

import './domMatrixPolyfill';
// @ts-ignore - registers in-thread fake worker on globalThis.pdfjsWorker for Hermes / React Native
import 'pdfjs-dist/legacy/build/pdf.worker.mjs';
// @ts-ignore - legacy bundle exports getDocument and GlobalWorkerOptions
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ReceiptFile } from '../../../types/receipt';
import {
  CancellationToken,
  ExtractionProgress,
  ReceiptExtractionResult,
  ReceiptTextExtractor,
} from '../types';
import { DocumentClassifier } from '../classification/DocumentClassifier';
import { computeTextMetrics, normalizeRawText } from '../normalization';

/**
 * Loads binary bytes from local URI in both React Native (fetch/blob) and Node environments.
 */
export async function loadPdfBinary(uri: string): Promise<Uint8Array> {
  // In React Native and modern JS runtimes, fetch handles file:// and content:// URIs
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export class PdfTextExtractor implements ReceiptTextExtractor {
  public async extract(
    file: ReceiptFile,
    onProgress?: (progress: ExtractionProgress) => void,
    cancellationToken?: CancellationToken
  ): Promise<ReceiptExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    if (cancellationToken?.aborted) {
      throw new Error('Extraction cancelled by user.');
    }

    onProgress?.({
      step: 'preparing',
      message: 'Loading PDF document...',
    });

    let uint8Array: Uint8Array;
    try {
      uint8Array = await loadPdfBinary(file.uri);
    } catch (err: any) {
      throw new Error(`Failed to load PDF file: ${err?.message || 'Unknown I/O error'}`);
    }

    if (cancellationToken?.aborted) {
      throw new Error('Extraction cancelled by user.');
    }

    // In Hermes / React Native, prevent PDF.js from attempting dynamic import() in its fake worker loader.
    // See ./HERMES_PDFJS_COMPATIBILITY.md for detailed failure mechanics and rationale.
    if ((pdfjsLib as any).PDFWorker && (globalThis as any).pdfjsWorker?.WorkerMessageHandler) {
      Object.defineProperty((pdfjsLib as any).PDFWorker, '_setupFakeWorkerGlobal', {
        value: Promise.resolve((globalThis as any).pdfjsWorker.WorkerMessageHandler),
        configurable: true,
        writable: true,
      });
    }

    // Configure PDF.js loading task with worker disabled for pure JS environment
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
      useWorkerFetch: false,
      isImageDecoderSupported: false,
    });

    let pdfDoc: any;
    try {
      pdfDoc = await loadingTask.promise;
    } catch (err: any) {
      const errorMsg = err?.message || '';
      if (/password/i.test(errorMsg)) {
        throw new Error('Password-protected PDF files are not supported.');
      }
      throw new Error(`Failed to parse PDF structure: ${errorMsg || 'Corrupt or unsupported PDF'}`);
    }

    const pageCount = pdfDoc.numPages || 0;
    if (pageCount === 0) {
      warnings.push('PDF document contains 0 pages.');
    }

    try {
      let fullRawText = '';
      const pageFailures: number[] = [];

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        if (cancellationToken?.aborted) {
          throw new Error('Extraction cancelled by user.');
        }

        onProgress?.({
          step: 'extracting',
          currentPage: pageNum,
          totalPages: pageCount,
          message: `Extracting page ${pageNum} of ${pageCount}...`,
        });

        try {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();

          let pageLines = '';
          for (const item of textContent.items) {
            if (typeof item === 'object' && item !== null && 'str' in item) {
              pageLines += item.str + (item.hasEOL ? '\n' : ' ');
            }
          }

          const trimmedPage = pageLines.trim();
          fullRawText += `--- PAGE ${pageNum} ---\n${trimmedPage}\n\n`;
        } catch (pageErr: any) {
          pageFailures.push(pageNum);
          warnings.push(`Page ${pageNum} text extraction failed: ${pageErr?.message || 'Unknown error'}`);
          fullRawText += `--- PAGE ${pageNum} ---\n[Text extraction failed for page ${pageNum}]\n\n`;
        }
      }

      if (cancellationToken?.aborted) {
        throw new Error('Extraction cancelled by user.');
      }

      onProgress?.({
        step: 'classifying',
        message: 'Classifying document structure...',
      });

      const normalizedText = normalizeRawText(fullRawText);
      const metrics = computeTextMetrics(normalizedText);

      const documentType = DocumentClassifier.classify(normalizedText, {
        pageCount,
        fileName: file.name,
        mimeType: file.mimeType,
      });

      onProgress?.({
        step: 'completed',
        message: 'Extraction completed successfully.',
      });

      return {
        rawText: normalizedText,
        extractionMethod: 'PDF_TEXT',
        documentType,
        pageCount,
        warnings,
        characterCount: metrics.characterCount,
        nonWhitespaceCharacterCount: metrics.nonWhitespaceCharacterCount,
        nonEmptyLineCount: metrics.nonEmptyLineCount,
        extractionDurationMs: Date.now() - startTime,
        ...(pageFailures.length > 0 ? { pageFailures } : {}),
      };
    } finally {
      try {
        if (pdfDoc && typeof pdfDoc.destroy === 'function') {
          await pdfDoc.destroy();
        }
      } catch {}
      try {
        if (loadingTask && typeof loadingTask.destroy === 'function') {
          await loadingTask.destroy();
        }
      } catch {}
    }
  }
}
