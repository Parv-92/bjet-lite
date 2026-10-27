/**
 * Bjet Lite - Statement Transaction Persistence Service (Phase C8)
 *
 * Coordinates persisting reviewed statement candidates to the local SQLite database via transactionRepository.
 *
 * Core Guarantees:
 * 1. Hard Direction Boundary: Strictly persists 'SENT' expense candidates or 'RECEIVED' reimbursement candidates.
 *    Ordinary non-reimbursement inflows and TOP_UP wallet transfers are strictly blocked.
 * 2. SQLite Preflight Duplicate Check: Queries local transactionRepository.findExistingUpiRefs
 *    to intercept already-persisted UPI reference IDs.
 * 3. Controlled Concurrency: MAX_CONCURRENT_REQUESTS = 3 for worker pool batch processing.
 * 4. Explicit Lifecycle State Machine:
 *    NOT_SUBMITTED -> SUBMITTING -> (PERSISTED | SKIPPED_DUPLICATE | FAILED).
 *    A candidate is only marked PERSISTED after successful insertion with a valid ID.
 * 5. Category Fallback: Uses selectedCategoryId ?? suggestedCategoryId ?? null (repository auto-categorizes).
 */

import { transactionRepository } from '../../repositories';
import type { ITransactionRepository } from '../../repositories/transactionRepository';
import { triggerAutoBackup } from '../backup';
import type { CreateManualTransactionRequest } from '../../types/api';
import type {
  TransactionCandidate,
  CandidatePersistenceStatus,
} from '../../types/receiptInterpretation';
import { statementCandidateStore } from './statementCandidateStore';

export const MAX_CONCURRENT_REQUESTS = 3;

export interface StatementPersistenceProgress {
  completed: number;
  total: number;
  currentCandidate?: TransactionCandidate;
}

export interface StatementPersistenceResult {
  totalRequested: number;
  successCount: number;
  skippedDuplicateCount: number;
  failureCount: number;
  persistedLocalIds: string[];
  failedCandidates: Array<{ candidate: TransactionCandidate; error: string }>;
}

export class StatementTransactionPersistenceService {
  private isPersisting = false;
  private transactionRepo: ITransactionRepository;

  constructor(transactionRepo: ITransactionRepository = transactionRepository) {
    this.transactionRepo = transactionRepo;
  }

  public getIsPersisting(): boolean {
    return this.isPersisting;
  }

  /**
   * Persists a list of selected candidates with preflight duplicate checks and controlled concurrency.
   */
  public async persistCandidates(
    candidates: TransactionCandidate[],
    onProgress?: (progress: StatementPersistenceProgress) => void
  ): Promise<StatementPersistenceResult> {
    if (this.isPersisting) {
      throw new Error('A transaction persistence session is already in progress.');
    }

    this.isPersisting = true;

    try {
      // 1. Hard filter: Allow SENT candidates or RECEIVED reimbursement candidates with valid amounts
      const persistableCandidates = candidates.filter(
        c =>
          !c.isExcluded &&
          (c.direction === 'SENT' || (c.direction === 'RECEIVED' && c.isReimbursement)) &&
          (c.amount ?? 0) > 0 &&
          c.persistenceStatus !== 'PERSISTED' &&
          c.persistenceStatus !== 'SKIPPED_DUPLICATE'
      );

      const totalRequested = persistableCandidates.length;
      if (totalRequested === 0) {
        return {
          totalRequested: 0,
          successCount: 0,
          skippedDuplicateCount: 0,
          failureCount: 0,
          persistedLocalIds: [],
          failedCandidates: [],
        };
      }

      // 2. Preflight Duplicate Check using local transactionRepository
      const candidateRefs = persistableCandidates
        .map(c => c.transactionReference?.trim())
        .filter((ref): ref is string => Boolean(ref));
      const existingUpiRefs = await this.transactionRepo.findExistingUpiRefs(candidateRefs);

      // 3. Filter out duplicates (both from database and in-batch duplicates)
      const seenBatchUtrs = new Set<string>();
      const queueToSubmit: TransactionCandidate[] = [];
      let skippedDuplicateCount = 0;

      for (const candidate of persistableCandidates) {
        const utr = candidate.transactionReference?.trim();

        if (utr && existingUpiRefs.has(utr)) {
          // Exists in local database
          skippedDuplicateCount++;
          statementCandidateStore.updatePersistenceStatus(
            candidate.localId,
            'SKIPPED_DUPLICATE'
          );
          statementCandidateStore.updateCandidate(candidate.localId, {
            ...candidate,
            isExcluded: true,
            persistenceStatus: 'SKIPPED_DUPLICATE',
            duplicateInfo: {
              isDuplicate: true,
              reason: `Transaction with UPI Reference '${utr}' already exists in database.`,
            },
          });
        } else if (utr && seenBatchUtrs.has(utr)) {
          // Repeated within current statement batch
          skippedDuplicateCount++;
          statementCandidateStore.updatePersistenceStatus(
            candidate.localId,
            'SKIPPED_DUPLICATE'
          );
          statementCandidateStore.updateCandidate(candidate.localId, {
            ...candidate,
            isExcluded: true,
            persistenceStatus: 'SKIPPED_DUPLICATE',
            duplicateInfo: {
              isDuplicate: true,
              reason: `Duplicate UPI Reference '${utr}' repeated within statement.`,
            },
          });
        } else {
          if (utr) {
            seenBatchUtrs.add(utr);
          }
          queueToSubmit.push(candidate);
        }
      }

      // 4. Submit non-duplicate candidates via controlled worker pool
      let completedCount = 0;
      let successCount = 0;
      let failureCount = 0;
      const persistedLocalIds: string[] = [];
      const failedCandidates: Array<{ candidate: TransactionCandidate; error: string }> = [];

      let currentIndex = 0;
      const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, queueToSubmit.length);

      const worker = async () => {
        while (currentIndex < queueToSubmit.length) {
          const index = currentIndex++;
          const candidate = queueToSubmit[index];

          // Set candidate status to SUBMITTING
          statementCandidateStore.updatePersistenceStatus(candidate.localId, 'SUBMITTING');

          try {
            const requestPayload = this.mapCandidateToRequest(candidate);
            const response = await this.transactionRepo.createTransaction(requestPayload);

            if (!response || !response.id) {
              throw new Error('Transaction repository did not return a valid transaction ID.');
            }

            // Succeeded and transaction ID returned -> mark PERSISTED
            successCount++;
            persistedLocalIds.push(candidate.localId);
            statementCandidateStore.updatePersistenceStatus(
              candidate.localId,
              'PERSISTED',
              response.id
            );
          } catch (err: any) {
            failureCount++;
            const errorMessage = err?.message || 'Failed to persist transaction.';
            failedCandidates.push({ candidate, error: errorMessage });
            statementCandidateStore.updatePersistenceStatus(
              candidate.localId,
              'FAILED',
              undefined,
              errorMessage
            );
          } finally {
            completedCount++;
            if (onProgress) {
              onProgress({
                completed: completedCount,
                total: queueToSubmit.length,
                currentCandidate: candidate,
              });
            }
          }
        }
      };

      if (queueToSubmit.length > 0) {
        const workers = Array.from({ length: workerCount }, () => worker());
        await Promise.all(workers);
      }

      if (successCount > 0) {
        triggerAutoBackup({ reason: 'persist statement transactions batch' });
      }

      return {
        totalRequested,
        successCount,
        skippedDuplicateCount,
        failureCount,
        persistedLocalIds,
        failedCandidates,
      };
    } finally {
      this.isPersisting = false;
    }
  }

  /**
   * Maps a TransactionCandidate to CreateManualTransactionRequest.
   * Hard enforces direction === 'SENT' and valid amount.
   */
  public mapCandidateToRequest(candidate: TransactionCandidate): CreateManualTransactionRequest {
    const isReimbursementInflow = candidate.direction === 'RECEIVED' && candidate.isReimbursement;
    if (candidate.direction !== 'SENT' && !isReimbursementInflow) {
      throw new Error(
        `Candidate ${candidate.localId} direction is '${candidate.direction}'. Only 'SENT' expense candidates or 'RECEIVED' reimbursement candidates can be persisted.`
      );
    }

    if (!candidate.amount || candidate.amount <= 0) {
      throw new Error(`Candidate ${candidate.localId} has invalid amount: ${candidate.amount}`);
    }

    const merchantRawName =
      candidate.counterpartyName?.trim() ||
      candidate.merchantRawName?.trim() ||
      'Unknown Merchant';

    // Category fallback: selected -> suggested -> null
    const categoryId =
      candidate.selectedCategoryId ??
      candidate.suggestedCategoryId ??
      null;

    const upiRef = candidate.transactionReference?.trim() || candidate.upiTransactionId?.trim() || null;
    const upiVpa = candidate.upiVpa?.trim() || null;
    const paymentApp = candidate.paymentApp?.trim() || 'Google Pay';

    return {
      amount: candidate.amount,
      currency: candidate.currency || 'INR',
      timestamp: candidate.timestamp || new Date().toISOString(),
      merchant_raw_name: merchantRawName,
      category_id: categoryId,
      upi_reference_id: upiRef,
      upi_vpa: upiVpa,
      payment_app: paymentApp,
      notes: candidate.notes?.trim() || 'Imported from Google Pay statement',
      direction: candidate.direction === 'RECEIVED' ? 'RECEIVED' : 'SENT',
      is_reimbursement: candidate.isReimbursement ?? undefined,
    };
  }
}

export const statementTransactionPersistenceService = new StatementTransactionPersistenceService();
