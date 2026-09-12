/**
 * Bjet Mobile - Receipt Interpretation Service (Phase 7 Coordinator)
 *
 * Orchestrates document-specific parsing strategy selection and candidate enrichment.
 * Separates:
 * - Text extraction (Phase 6)
 * - Document interpretation (Phase 7)
 * - User review UI
 * - Backend persistence / confirmation
 */

import { ReceiptExtractionResult, DocumentType } from './types';
import {
  InterpretationResult,
  TransactionCandidate,
} from '../../types/receiptInterpretation';
import { IDocumentParser } from './parsers/types';
import { GooglePayStatementParser } from './parsers/GooglePayStatementParser';
import { IndividualReceiptParser } from './parsers/IndividualReceiptParser';
import { GenericStatementParser } from './parsers/GenericStatementParser';
import { CandidateBuilder, EnrichmentContext } from './CandidateBuilder';

export class ReceiptInterpretationService {
  private googlePayParser: IDocumentParser;
  private individualParser: IDocumentParser;
  private genericStatementParser: IDocumentParser;

  constructor(
    googlePayParser?: IDocumentParser,
    individualParser?: IDocumentParser,
    genericStatementParser?: IDocumentParser
  ) {
    this.googlePayParser = googlePayParser || new GooglePayStatementParser();
    this.individualParser = individualParser || new IndividualReceiptParser();
    this.genericStatementParser =
      genericStatementParser || new GenericStatementParser();
  }

  /**
   * Interpret extracted raw text into structured, reviewable TransactionCandidate(s).
   */
  public async interpret(
    extraction: ReceiptExtractionResult,
    context: EnrichmentContext = {}
  ): Promise<InterpretationResult> {
    const startTime = Date.now();
    const rawText = extraction.rawText || '';
    const documentType = extraction.documentType;
    const pageCount = extraction.pageCount || 1;

    let selectedParser: IDocumentParser;

    // Strategy Selection based on structural classification and content signatures
    if (this.googlePayParser.canParse(rawText)) {
      selectedParser = this.googlePayParser;
    } else if (
      documentType === 'TRANSACTION_STATEMENT' ||
      pageCount > 1 ||
      this.genericStatementParser.canParse(rawText, { pageCount })
    ) {
      selectedParser = this.genericStatementParser;
    } else {
      selectedParser = this.individualParser;
    }

    // Execute Document Parsing
    const parseT0 = Date.now();
    const parsed = await selectedParser.parse(rawText, { pageCount });
    const parseT1 = Date.now();
    const parseDur = parseT1 - parseT0;

    // Combine extraction warnings with parser warnings
    const combinedWarnings = [
      ...extraction.warnings,
      ...parsed.warnings,
    ];

    // Enrich candidates with duplicates and advisory category suggestions
    const enrichT0 = Date.now();
    const enrichedCandidates: TransactionCandidate[] = CandidateBuilder.enrich(
      parsed.candidates,
      context
    );
    const enrichT1 = Date.now();
    const enrichDur = enrichT1 - enrichT0;

    // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY] Log parser and candidate generation performance
    console.log(
      `[PERF][OCR]\nParser: ${selectedParser.constructor.name}\nParser Duration: ${parseDur} ms\nRaw Text Length: ${rawText.length} chars\nRaw Candidates: ${parsed.candidates.length}\nEnrichment Duration: ${enrichDur} ms\nEnriched Candidates: ${enrichedCandidates.length}`
    );

    return {
      documentType,
      candidates: enrichedCandidates,
      statementMetadata: parsed.statementMetadata,
      warnings: combinedWarnings,
      durationMs: Date.now() - startTime,
    };
  }
}
