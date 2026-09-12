/**
 * Bjet Mobile - Receipt Interpretation & Candidate Types (Phase 7)
 * Strictly typed data models for transaction candidates parsed from
 * individual receipts and statements.
 *
 * Requirements:
 * - Differentiates directions: SENT, RECEIVED, TOP_UP, UNKNOWN.
 * - Stores UPI IDs as exact string representations.
 * - Preserves extraction confidence, warnings, and source evidence.
 * - Maintains explicit review status without blindly trusting parser outputs.
 * - Treats category suggestions as advisory only.
 */

import { DocumentType } from '../services/receipt/types';

export type CandidateDirection = 'SENT' | 'RECEIVED' | 'TOP_UP' | 'UNKNOWN';

export type CandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ReviewStatus =
  | 'READY_FOR_REVIEW'
  | 'NEEDS_ATTENTION'
  | 'DUPLICATE_WARNING'
  | 'EXCLUDED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EDITED';

export type CandidatePersistenceStatus =
  | 'NOT_SUBMITTED'
  | 'SUBMITTING'
  | 'PERSISTED'
  | 'SKIPPED_DUPLICATE'
  | 'FAILED';

export interface DuplicateIndicator {
  isDuplicate: boolean;
  existingTransactionId?: number;
  reason?: string;
}

export interface TransactionCandidate {
  localId: string;
  merchantRawName?: string;
  counterpartyName?: string; // Optional alias/clean name
  amount?: number;
  currency?: string;
  timestamp?: string; // ISO-8601 UTC
  transactionReference?: string; // Exact 12-digit UPI UTR string
  upiTransactionId?: string; // Optional alias for transactionReference
  upiVpa?: string;
  paymentApp?: string;
  direction: CandidateDirection;
  suggestedCategoryId?: number | null;
  suggestedCategoryName?: string | null;
  selectedCategoryId?: number | null; // User-selected/overridden category
  confidence: CandidateConfidence;
  warnings: string[];
  sourcePage?: number;
  sourceText?: string;
  reviewStatus: ReviewStatus;
  isExcluded: boolean;
  isDuplicate?: boolean;
  duplicateTransactionId?: number;
  notes?: string;
  backendTransactionId?: number; // Present if already created as a backend draft
  duplicateInfo?: DuplicateIndicator;
  persistenceStatus?: CandidatePersistenceStatus;
  persistedTransactionId?: number;
  persistenceError?: string;
  isReimbursement?: boolean;
  friendId?: number | null;
  friendName?: string | null;
}

export interface StatementMetadata {
  periodStart?: string;
  periodEnd?: string;
  totalSentReported?: number;
  totalReceivedReported?: number;
  totalTopUpReported?: number;
  accountIdentifier?: string;
}

export interface InterpretationResult {
  documentType: DocumentType;
  candidates: TransactionCandidate[];
  statementMetadata?: StatementMetadata;
  warnings: string[];
  durationMs: number;
}
