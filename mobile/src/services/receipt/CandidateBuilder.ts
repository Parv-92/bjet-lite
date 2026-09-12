/**
 * Bjet Mobile - Candidate Builder (Phase 7)
 * Enriches transaction candidates with:
 * - Duplicate detection indicators against cached backend transactions.
 * - Advisory category suggestions evaluated against UserMerchantRules and Categories.
 * - In-batch duplicate detection (e.g. repeated UTRs in the same document).
 *
 * Requirements:
 * - Category suggestions are strictly advisory: SuggestedCategory != confirmed category.
 * - Candidates remain fully editable by the user.
 * - Authoritative business rules remain on the backend upon actual persistence.
 */

import {
  TransactionCandidate,
  DuplicateIndicator,
} from '../../types/receiptInterpretation';
import { Transaction, Category, TransactionListItemResponse, Friend } from '../../types/api';
import { UserMerchantRule } from '../../types/rules';

export interface EnrichmentContext {
  existingTransactions?: (Transaction | TransactionListItemResponse)[];
  userRules?: UserMerchantRule[];
  rules?: UserMerchantRule[];
  categories?: Category[];
  friends?: Friend[];
}

/**
 * Normalizes friend pattern deterministically: collapse whitespace, strip, uppercase.
 * Exactly matches backend friend_repo.py normalize_friend_pattern().
 */
export function normalizeFriendPattern(text?: string | null): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Finds user friend whose recognized_name matches or is contained in sender_text.
 * Exactly reproduces backend friend_repo.py find_matching_friend() semantics.
 */
export function findMatchingFriend(
  senderText?: string | null,
  friends: Friend[] = []
): Friend | undefined {
  if (!senderText) return undefined;
  const normSender = normalizeFriendPattern(senderText);
  if (!normSender) return undefined;

  // Never mistake bank credit lines for counterparty
  if (normSender.startsWith('PAID TO BANK') || normSender.includes('BANK OF INDIA')) {
    return undefined;
  }

  // Clean common transaction prefixes if present (e.g. "Received from Utsav" -> "UTSAV")
  const cleanedSender = normSender.replace(/^(?:RECEIVED\s+FROM|FROM)\s+/i, '').trim();
  if (!cleanedSender || cleanedSender.length < 2) {
    return undefined;
  }

  // 1. Exact match first (against cleanedSender or normSender)
  for (const friend of friends) {
    const normPattern = normalizeFriendPattern(friend.recognized_name);
    if (normPattern && (normPattern === cleanedSender || normPattern === normSender)) {
      return friend;
    }
  }

  // 2. Substring match (friend recognized_name inside sender_text or vice-versa)
  for (const friend of friends) {
    const normPattern = normalizeFriendPattern(friend.recognized_name);
    if (normPattern && normPattern.length >= 2) {
      if (
        patIncludes(cleanedSender, normPattern) ||
        patIncludes(normPattern, cleanedSender) ||
        patIncludes(normSender, normPattern)
      ) {
        return friend;
      }
    }
  }

  return undefined;
}

function patIncludes(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

export class CandidateBuilder {
  /**
   * Enriches raw parsed candidates with duplicate analysis, friend reimbursement
   * recognition, and advisory category suggestions.
   */
  public static enrich(
    candidates: TransactionCandidate[],
    context: EnrichmentContext = {}
  ): TransactionCandidate[] {
    const existingTxs = context.existingTransactions || [];
    const userRules = context.userRules || context.rules || [];
    const categories = context.categories || [];
    const friends = context.friends || [];

    // Map categories by ID for quick lookup
    const categoryMap = new Map<number, Category>();
    categories.forEach(c => categoryMap.set(c.id, c));

    // Fallback uncategorized category (for outgoing SENT expenses only)
    const uncategorizedCat = categories.find(
      c => c.name.toLowerCase() === 'uncategorized'
    );

    // Track UTR references inside this current statement batch
    const seenBatchUtrs = new Set<string>();

    return candidates.map(candidate => {
      const warnings = [...candidate.warnings];
      let duplicateInfo: DuplicateIndicator | undefined = candidate.duplicateInfo;
      let reviewStatus = candidate.reviewStatus;

      // -----------------------------------------------------------------
      // 1. Duplicate Detection (Authoritative check against existing records)
      // -----------------------------------------------------------------
      if (!duplicateInfo) {
        // A. Primary check: exact match on 12-digit UPI Reference ID (UTR)
        if (candidate.transactionReference) {
          const match = existingTxs.find(
            tx => tx.upi_reference_id === candidate.transactionReference
          );

          if (match) {
            duplicateInfo = {
              isDuplicate: true,
              existingTransactionId: match.id,
              reason: `A transaction with UPI Reference ID '${candidate.transactionReference}' already exists (#${match.id}).`,
            };
            reviewStatus = 'DUPLICATE_WARNING';
            warnings.push(`Duplicate: Matches existing transaction #${match.id}.`);
          } else if (seenBatchUtrs.has(candidate.transactionReference)) {
            // B. In-batch duplicate check: multiple rows with identical UTR in statement
            duplicateInfo = {
              isDuplicate: true,
              reason: `Duplicate UPI Reference ID '${candidate.transactionReference}' repeated within this statement.`,
            };
            reviewStatus = 'DUPLICATE_WARNING';
            warnings.push('Duplicate: Repeated UPI reference within statement.');
          } else {
            seenBatchUtrs.add(candidate.transactionReference);
          }
        }

        // C. Fallback check (only if UTR is missing or didn't match):
        // Matching amount, similar merchant, and timestamp within 24 hours
        if (!duplicateInfo && candidate.amount && candidate.amount > 0) {
          const candTime = candidate.timestamp
            ? new Date(candidate.timestamp).getTime()
            : Date.now();
          const windowMs = 24 * 60 * 60 * 1000;

          const similar = existingTxs.find(tx => {
            const txAmount = parseFloat(tx.amount);
            if (Math.abs(txAmount - candidate.amount!) > 0.01) return false;

            const txTime = new Date(tx.timestamp).getTime();
            if (Math.abs(txTime - candTime) > windowMs) return false;

            // Merchant comparison if available
            if (candidate.merchantRawName && tx.merchant_raw_name) {
              return (
                candidate.merchantRawName.toLowerCase().includes(tx.merchant_raw_name.toLowerCase()) ||
                tx.merchant_raw_name.toLowerCase().includes(candidate.merchantRawName.toLowerCase())
              );
            }
            return true;
          });

          if (similar) {
            duplicateInfo = {
              isDuplicate: true,
              existingTransactionId: similar.id,
              reason: `A similar transaction of ₹${candidate.amount} was already logged around this date (#${similar.id}).`,
            };
            reviewStatus = 'DUPLICATE_WARNING';
            warnings.push(`Possible duplicate of transaction #${similar.id}.`);
          }
        }
      }

      // -----------------------------------------------------------------
      // 2. Friend & Reimbursement Recognition (for RECEIVED candidates)
      // -----------------------------------------------------------------
      let isReimbursement = candidate.isReimbursement ?? false;
      let friendId: number | null = candidate.friendId ?? null;
      let friendName: string | null = candidate.friendName ?? null;

      if (candidate.direction === 'RECEIVED') {
        const senderText = candidate.counterpartyName || candidate.merchantRawName;
        const matchedFriend = findMatchingFriend(senderText, friends);
        if (matchedFriend) {
          isReimbursement = true;
          friendId = matchedFriend.id;
          friendName = matchedFriend.name;
        } else {
          isReimbursement = false;
          friendId = null;
          friendName = null;
        }
      } else {
        isReimbursement = false;
        friendId = null;
        friendName = null;
      }

      // -----------------------------------------------------------------
      // 3. Advisory Category Suggestion (Strictly Advisory)
      // -----------------------------------------------------------------
      let suggestedCategoryId: number | null = candidate.suggestedCategoryId || null;
      let suggestedCategoryName: string | null = candidate.suggestedCategoryName || null;

      if (candidate.direction === 'TOP_UP') {
        // TOP_UP is an internal transfer, not an expenditure: do not assign fake merchant/category
        suggestedCategoryId = null;
        suggestedCategoryName = null;
      } else if (candidate.direction === 'RECEIVED') {
        if (isReimbursement && friendId) {
          const matchedFriend = friends.find(f => f.id === friendId);
          if (matchedFriend) {
            suggestedCategoryId = matchedFriend.category_id;
            suggestedCategoryName =
              matchedFriend.category?.name || categoryMap.get(matchedFriend.category_id)?.name || null;
          }
        } else {
          // Unrecognized RECEIVED is non-spending inflow: do not assign expense category
          suggestedCategoryId = null;
          suggestedCategoryName = null;
        }
      } else if (candidate.direction === 'SENT') {
        if (!suggestedCategoryId) {
          const normMerchant = (candidate.merchantRawName || '').toUpperCase();
          const normVpa = (candidate.upiVpa || '').toUpperCase();

          // Check user rules (already sorted priority DESC, created_at DESC by backend)
          for (const rule of userRules) {
            const pattern = (rule.merchant_pattern || '').trim().toUpperCase();
            if (pattern) {
              const isMatch =
                (normMerchant && normMerchant.includes(pattern)) ||
                (normVpa && normVpa.includes(pattern));

              if (isMatch) {
                suggestedCategoryId = rule.category_id;
                suggestedCategoryName =
                  rule.category?.name || categoryMap.get(rule.category_id)?.name || null;
                break;
              }
            }
          }

          // Fallback to Uncategorized if no rule matched
          if (!suggestedCategoryId && uncategorizedCat) {
            suggestedCategoryId = uncategorizedCat.id;
            suggestedCategoryName = uncategorizedCat.name;
          }
        }
      }

      // Preserve any user-overridden selectedCategoryId, or default to advisory suggestion
      const selectedCategoryId =
        candidate.selectedCategoryId !== undefined
          ? candidate.selectedCategoryId
          : suggestedCategoryId;

      return {
        ...candidate,
        isReimbursement,
        friendId,
        friendName,
        suggestedCategoryId,
        suggestedCategoryName,
        selectedCategoryId,
        duplicateInfo: duplicateInfo || { isDuplicate: false },
        reviewStatus,
        warnings,
      };
    });
  }
}
