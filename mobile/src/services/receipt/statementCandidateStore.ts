/**
 * Bjet Mobile - Statement Candidate In-Memory Store (Phase 7)
 *
 * Keeps active statement candidates in memory during review.
 * Avoids URL parameter length limits when passing large multi-page candidate sets
 * (e.g. 90 transactions from 11-page GPay statement).
 *
 * Safeguard constraint:
 * Statement candidates are strictly local and are NEVER sent to POST /transactions.
 */

import type {
  TransactionCandidate,
  StatementMetadata,
  CandidatePersistenceStatus,
} from '../../types/receiptInterpretation';

class StatementCandidateStore {
  private candidates: TransactionCandidate[] = [];
  private metadata: StatementMetadata | undefined = undefined;
  private warnings: string[] = [];
  private sourceFileUri: string | undefined = undefined;
  private listeners: Set<() => void> = new Set();

  public setSession(
    candidates: TransactionCandidate[],
    metadata?: StatementMetadata,
    warnings?: string[],
    sourceFileUri?: string
  ) {
    this.sourceFileUri = sourceFileUri;
    this.candidates = candidates.map(c => {
      const isDuplicate = !!c.duplicateInfo?.isDuplicate;
      // Duplicates are excluded by default.
      // SENT expenses, recognized reimbursements, and visible non-spending items (inflows, top-ups) are not excluded by default.
      const isExcluded = isDuplicate;
      const reviewStatus = isDuplicate
        ? 'DUPLICATE_WARNING'
        : c.reviewStatus || 'READY_FOR_REVIEW';

      return {
        ...c,
        isExcluded,
        reviewStatus,
        persistenceStatus: 'NOT_SUBMITTED' as CandidatePersistenceStatus,
      };
    });
    this.metadata = metadata;
    this.warnings = warnings ? [...warnings] : [];
    this.notify();
  }

  public getCandidates(): TransactionCandidate[] {
    return this.candidates;
  }

  public getMetadata(): StatementMetadata | undefined {
    return this.metadata;
  }

  public getWarnings(): string[] {
    return this.warnings;
  }

  public getSourceFileUri(): string | undefined {
    return this.sourceFileUri;
  }

  public updateCandidate(localId: string, updated: TransactionCandidate) {
    const idx = this.candidates.findIndex(c => c.localId === localId);
    if (idx !== -1) {
      const next = [...this.candidates];
      next[idx] = { ...updated };
      this.candidates = next;
      this.notify();
    }
  }

  public updatePersistenceStatus(
    localId: string,
    status: CandidatePersistenceStatus,
    transactionId?: number,
    error?: string
  ) {
    const idx = this.candidates.findIndex(c => c.localId === localId);
    if (idx !== -1) {
      const current = this.candidates[idx];
      const next = [...this.candidates];
      next[idx] = {
        ...current,
        persistenceStatus: status,
        persistedTransactionId: transactionId ?? current.persistedTransactionId,
        persistenceError: error ?? (status === 'PERSISTED' ? undefined : current.persistenceError),
      };
      this.candidates = next;
      this.notify();
    }
  }

  public toggleInclusion(localId: string) {
    const idx = this.candidates.findIndex(c => c.localId === localId);
    if (idx !== -1) {
      const current = this.candidates[idx];

      // Non-SENT candidates and duplicates are locked unless marked as reimbursement
      const isPersistableDirection = current.direction === 'SENT' || (current.direction === 'RECEIVED' && current.isReimbursement);
      if (!isPersistableDirection || current.duplicateInfo?.isDuplicate) {
        return;
      }

      const isExcl = current.reviewStatus === 'EXCLUDED' || current.isExcluded;
      const nextStatus = isExcl ? 'READY_FOR_REVIEW' : 'EXCLUDED';
      const next = [...this.candidates];
      next[idx] = {
        ...current,
        reviewStatus: nextStatus,
        isExcluded: !isExcl,
      };
      this.candidates = next;
      this.notify();
    }
  }

  public setAllInclusion(include: boolean) {
    this.candidates = this.candidates.map(c => {
      // Duplicates must never be included
      if (c.duplicateInfo?.isDuplicate) {
        return {
          ...c,
          reviewStatus: 'DUPLICATE_WARNING',
          isExcluded: true,
        };
      }

      // Non-persistable candidates (ordinary RECEIVED and TOP_UP) remain visible non-spending items (not struck-through)
      const isPersistableDirection = c.direction === 'SENT' || (c.direction === 'RECEIVED' && c.isReimbursement);
      if (!isPersistableDirection) {
        return {
          ...c,
          reviewStatus: c.reviewStatus || 'READY_FOR_REVIEW',
          isExcluded: false,
        };
      }

      return {
        ...c,
        reviewStatus: include ? 'READY_FOR_REVIEW' : 'EXCLUDED',
        isExcluded: !include,
      };
    });
    this.notify();
  }

  public getPersistableCandidates(): TransactionCandidate[] {
    return this.candidates.filter(
      c =>
        !c.isExcluded &&
        (c.direction === 'SENT' || (c.direction === 'RECEIVED' && c.isReimbursement)) &&
        (c.amount ?? 0) > 0 &&
        c.persistenceStatus !== 'PERSISTED' &&
        c.persistenceStatus !== 'SKIPPED_DUPLICATE'
    );
  }

  public prepareRetryFailed(): TransactionCandidate[] {
    const failedCandidates: TransactionCandidate[] = [];
    const next = this.candidates.map(c => {
      if (c.persistenceStatus === 'FAILED') {
        const resetCandidate: TransactionCandidate = {
          ...c,
          persistenceStatus: 'SUBMITTING' as CandidatePersistenceStatus,
          persistenceError: undefined,
        };
        failedCandidates.push(resetCandidate);
        return resetCandidate;
      }
      return c;
    });

    if (failedCandidates.length > 0) {
      this.candidates = next;
      this.notify();
    }
    return failedCandidates;
  }

  public clearSession() {
    this.candidates = [];
    this.metadata = undefined;
    this.warnings = [];
    this.sourceFileUri = undefined;
    this.notify();
  }

  public clear() {
    this.clearSession();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }
}

export const statementCandidateStore = new StatementCandidateStore();

