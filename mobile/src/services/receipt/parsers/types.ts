/**
 * Bjet Mobile - Parser Interfaces (Phase 7)
 */
import type {
  TransactionCandidate,
  StatementMetadata,
} from '../../../types/receiptInterpretation';

export interface ParsedDocument {
  candidates: TransactionCandidate[];
  statementMetadata?: StatementMetadata;
  warnings: string[];
}

export interface IDocumentParser {
  name: string;
  canParse(rawText: string, metadata?: { pageCount?: number; fileName?: string }): boolean;
  parse(rawText: string, metadata?: { pageCount?: number; fileName?: string }): Promise<ParsedDocument>;
}
