/**
 * Bjet Mobile - PDF OCR Extractor (Phase 6)
 *
 * Fallback extractor for scanned or image-based PDFs when direct text extraction
 * is unavailable or fails the quality heuristic.
 *
 * Requirements:
 * - Processes pages in strict sequential document order.
 * - Preserves page boundaries (`--- PAGE X ---`).
 * - Controlled memory usage: cleans temporary page buffers immediately.
 * - Records per-page failures with descriptive warnings without discarding successful pages.
 * - Cleans temporary files on success, failure, or cancellation.
 */

// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ReceiptFile } from '../../../types/receipt';
import {
  CancellationToken,
  ExtractionProgress,
  ReceiptExtractionResult,
  ReceiptTextExtractor,
} from '../types';
import { IOcrProvider, MobileOcrProvider } from '../ocr/OcrProvider';
import { IPdfPageRenderer, AndroidPdfPageRenderer, RenderedPage } from '../renderer/PdfPageRenderer';
import { DocumentClassifier } from '../classification/DocumentClassifier';
import { computeTextMetrics, normalizeRawText } from '../normalization';
import { loadPdfBinary } from './PdfTextExtractor';

export class PdfOCRExtractor implements ReceiptTextExtractor {
  private ocrProvider: IOcrProvider;
  private pageRenderer: IPdfPageRenderer;

  constructor(ocrProvider?: IOcrProvider, pageRenderer?: IPdfPageRenderer) {
    this.ocrProvider = ocrProvider || new MobileOcrProvider();
    this.pageRenderer = pageRenderer || new AndroidPdfPageRenderer();
  }

  public async extract(
    file: ReceiptFile,
    onProgress?: (progress: ExtractionProgress) => void,
    cancellationToken?: CancellationToken
  ): Promise<ReceiptExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const pageFailures: number[] = [];

    if (cancellationToken?.aborted) {
      throw new Error('Extraction cancelled by user.');
    }

    onProgress?.({
      step: 'preparing',
      message: 'Preparing PDF for multi-page OCR fallback...',
    });

    // 1. Determine total page count (native renderer or pdfjs fallback)
    let pageCount = 0;
    try {
      if (this.pageRenderer.getPageCount) {
        pageCount = await this.pageRenderer.getPageCount(file.uri);
      }
    } catch {
      // Fallback to pdfjsLib page counting
    }

    if (pageCount === 0) {
      let uint8Array: Uint8Array;
      try {
        uint8Array = await loadPdfBinary(file.uri);
      } catch (err: any) {
        throw new Error(`Failed to load PDF file: ${err?.message || 'Unknown I/O error'}`);
      }

      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false,
        useWorkerFetch: false,
      });

      let pdfDoc: any;
      try {
        pdfDoc = await loadingTask.promise;
        pageCount = pdfDoc.numPages || 0;
      } catch (err: any) {
        throw new Error(`Failed to parse PDF for OCR: ${err?.message || 'Unsupported PDF structure'}`);
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

    let fullRawText = '';
    let totalRenderDuration = 0;
    let totalOcrDuration = 0;

    // 2. Process pages sequentially to maintain controlled memory usage
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      if (cancellationToken?.aborted) {
        throw new Error('Extraction cancelled by user.');
      }

      let renderedPage: RenderedPage | null = null;

      try {
        // Step A: Native page rasterization using Android PdfRenderer
        onProgress?.({
          step: 'ocr',
          currentPage: pageNum,
          totalPages: pageCount,
          message: `Rendering page ${pageNum} of ${pageCount}...`,
        });

        const renderT0 = Date.now();
        renderedPage = await this.pageRenderer.renderPage(file.uri, pageNum);
        const renderT1 = Date.now();
        const renderDur = renderT1 - renderT0;
        totalRenderDuration += renderDur;

        if (cancellationToken?.aborted) {
          throw new Error('Extraction cancelled by user.');
        }

        // Step B: Native OCR recognition via Google ML Kit
        onProgress?.({
          step: 'ocr',
          currentPage: pageNum,
          totalPages: pageCount,
          message: `Performing OCR on page ${pageNum} of ${pageCount}...`,
        });

        const ocrT0 = Date.now();
        const ocrResult = await this.ocrProvider.recognizeText(
          renderedPage.imageUri,
          cancellationToken
        );
        const ocrT1 = Date.now();
        const ocrDur = ocrT1 - ocrT0;
        totalOcrDuration += ocrDur;

        // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY] Log per-page performance
        console.log(
          `[PERF][OCR]\nPage: ${pageNum}/${pageCount}\nRender Duration: ${renderDur} ms\nOCR Duration: ${ocrDur} ms\nText Length: ${ocrResult.text?.length ?? 0} chars`
        );

        if (ocrResult.warnings && ocrResult.warnings.length > 0) {
          warnings.push(...ocrResult.warnings.map(w => `Page ${pageNum}: ${w}`));
        }

        const pageText = ocrResult.text ? ocrResult.text.trim() : '';
        if (pageText.length === 0) {
          pageFailures.push(pageNum);
          warnings.push(`Page ${pageNum} OCR failed: No readable text detected.`);
          fullRawText += `--- PAGE ${pageNum} ---\n[No readable text on page ${pageNum}]\n\n`;
        } else {
          fullRawText += `--- PAGE ${pageNum} ---\n${pageText}\n\n`;
        }
      } catch (pageErr: any) {
        if (cancellationToken?.aborted || /cancelled/i.test(pageErr?.message || '')) {
          throw new Error('Extraction cancelled by user.');
        }
        pageFailures.push(pageNum);
        warnings.push(`Page ${pageNum} failed: ${pageErr?.message || 'Rendering/OCR error'}`);
        fullRawText += `--- PAGE ${pageNum} ---\n[OCR failed for page ${pageNum}]\n\n`;
      } finally {
        // CRITICAL: Guaranteed cleanup of temporary rendered page bitmap
        if (renderedPage) {
          try {
            await renderedPage.cleanup();
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    const totalPipelineDuration = Date.now() - startTime;
    console.log(
      `[PERF][OCR]\nPDF pages: ${pageCount}\nPdfRenderer Duration: ${totalRenderDuration} ms\nOCR Duration: ${totalOcrDuration} ms\nTotal Extraction Duration: ${totalPipelineDuration} ms\nCharacters extracted: ${fullRawText.length}`
    );

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
      message: 'PDF OCR processing completed.',
    });

    return {
      rawText: normalizedText,
      extractionMethod: 'PDF_OCR',
      documentType,
      pageCount,
      warnings,
      characterCount: metrics.characterCount,
      nonWhitespaceCharacterCount: metrics.nonWhitespaceCharacterCount,
      nonEmptyLineCount: metrics.nonEmptyLineCount,
      extractionDurationMs: Date.now() - startTime,
      ...(pageFailures.length > 0 ? { pageFailures } : {}),
    };
  }
}
