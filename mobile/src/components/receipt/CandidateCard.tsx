/**
 * Bjet Mobile - Candidate Card Component (Phase 7)
 *
 * Displays a single parsed transaction candidate from a statement or receipt.
 *
 * Features:
 * - Direction indicator (SENT, RECEIVED, TOP_UP, UNKNOWN)
 * - Counterparty/merchant name & formatted INR amount
 * - Timestamp formatting
 * - Exact string UPI transaction ID / VPA
 * - Advisory category badge (clearly indicates suggestion; tappable)
 * - Duplicate detection warning & in-batch warnings
 * - Inclusion/exclusion toggle
 * - Collapsible source evidence audit snippet (sourcePage + sourceText)
 * - Edit trigger for full candidate modification
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  HelpCircle,
  AlertTriangle,
  Copy,
  ChevronDown,
  ChevronUp,
  Edit3,
  CheckSquare,
  Square,
  Tag,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react-native';
import { TransactionCandidate } from '../../types/receiptInterpretation';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

// Static formatting helpers hoisted outside component to eliminate per-render allocations
function formatAmount(amount?: number): string {
  if (amount === undefined) return '₹—';
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return 'Unknown Date';
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function getDirectionMeta(direction?: string) {
  switch (direction) {
    case 'RECEIVED':
      return {
        label: 'Received',
        icon: <ArrowDownLeft color={colors.success} size={16} />,
        color: colors.success,
        bgColor: 'rgba(16, 185, 129, 0.12)',
      };
    case 'TOP_UP':
      return {
        label: 'UPI Lite Top-up',
        icon: <RefreshCw color={colors.info} size={16} />,
        color: colors.info,
        bgColor: 'rgba(59, 130, 246, 0.12)',
      };
    case 'SENT':
      return {
        label: 'Sent',
        icon: <ArrowUpRight color={colors.textSecondary} size={16} />,
        color: colors.textSecondary,
        bgColor: 'rgba(148, 163, 184, 0.12)',
      };
    default:
      return {
        label: 'Unknown',
        icon: <HelpCircle color={colors.textMuted} size={16} />,
        color: colors.textMuted,
        bgColor: 'rgba(100, 116, 139, 0.12)',
      };
  }
}

interface CandidateCardProps {
  candidate: TransactionCandidate;
  onToggleInclusion: (candidateId: string) => void;
  onEdit: (candidate: TransactionCandidate) => void;
}

const CandidateCardComponent: React.FC<CandidateCardProps> = ({
  candidate,
  onToggleInclusion,
  onEdit,
}) => {
  const [showEvidence, setShowEvidence] = useState(false);

  const isDuplicate = !!candidate.duplicateInfo?.isDuplicate || !!candidate.isDuplicate;
  const isSent = candidate.direction === 'SENT';
  const isReimbursement = candidate.direction === 'RECEIVED' && !!candidate.isReimbursement;
  const isPersistableType = isSent || isReimbursement;

  // Selection is only applicable for SENT expenses and recognized reimbursements
  // (ordinary RECEIVED and TOP_UP do not have an inclusion checkbox as they are non-spending)
  const isSelectionDisabled = isDuplicate || candidate.persistenceStatus === 'PERSISTED';
  const isUserExcluded = isPersistableType && (candidate.reviewStatus === 'EXCLUDED' || candidate.isExcluded);

  // Card dimming and strikethrough are applied ONLY to user-excluded persistable items or duplicates
  const shouldDimCard = isUserExcluded || isDuplicate;
  const shouldStrikethrough = isUserExcluded;

  const formattedAmount = formatAmount(candidate.amount);
  const formattedDate = formatTimestamp(candidate.timestamp);
  const dirMeta = getDirectionMeta(candidate.direction);

  return (
    <View
      style={[
        styles.card,
        shouldDimCard && styles.cardExcluded,
        isDuplicate && styles.cardDuplicate,
        isReimbursement && styles.cardReimbursement,
        candidate.persistenceStatus === 'PERSISTED' && styles.cardPersisted,
        candidate.persistenceStatus === 'FAILED' && styles.cardFailed,
      ]}
    >
      {/* Top Header: Selection checkbox or Non-spending badge, Direction, and Edit action */}
      <View style={styles.headerRow}>
        {isPersistableType ? (
          <TouchableOpacity
            onPress={() => {
              if (!isSelectionDisabled) {
                onToggleInclusion(candidate.localId);
              }
            }}
            disabled={isSelectionDisabled}
            style={[styles.checkboxContainer, isSelectionDisabled && styles.checkboxDisabled]}
            accessibilityLabel={isUserExcluded ? 'Include candidate' : 'Exclude candidate'}
          >
            {isSelectionDisabled && candidate.persistenceStatus === 'PERSISTED' ? (
              <CheckCircle2 color={colors.success} size={20} />
            ) : isUserExcluded ? (
              <Square color={colors.textMuted} size={20} />
            ) : (
              <CheckSquare color={isReimbursement ? colors.success : colors.brandLight} size={20} />
            )}
            <Text
              style={[
                styles.inclusionText,
                isUserExcluded ? styles.textMuted : styles.textLight,
              ]}
            >
              {isDuplicate
                ? 'Excluded (Duplicate)'
                : isUserExcluded
                ? isReimbursement
                  ? `Excluded (${candidate.friendName || 'Reimbursement'})`
                  : 'Excluded (Expense)'
                : isReimbursement
                ? `Reimbursement (${candidate.friendName || 'Friend'})`
                : 'Expense'}
            </Text>
          </TouchableOpacity>
        ) : candidate.direction === 'RECEIVED' ? (
          <View style={styles.nonSpendingBadgeContainer}>
            <View style={styles.inflowBadge}>
              <ArrowDownLeft color={colors.success} size={13} />
              <Text style={styles.inflowBadgeText}>Inflow (₹0 spending)</Text>
            </View>
          </View>
        ) : candidate.direction === 'TOP_UP' ? (
          <View style={styles.nonSpendingBadgeContainer}>
            <View style={styles.topUpBadge}>
              <RefreshCw color={colors.info} size={13} />
              <Text style={styles.topUpBadgeText}>UPI Lite (₹0 spending)</Text>
            </View>
          </View>
        ) : (
          <View style={styles.nonSpendingBadgeContainer}>
            <View style={styles.unknownBadge}>
              <HelpCircle color={colors.textMuted} size={13} />
              <Text style={styles.unknownBadgeText}>Non-spending</Text>
            </View>
          </View>
        )}

        <View style={styles.headerRight}>
          {/* Persistence status badge */}
          {candidate.persistenceStatus === 'PERSISTED' && (
            <View style={styles.persistedBadge}>
              <CheckCircle2 color={colors.success} size={14} />
              <Text style={styles.persistedBadgeText}>
                Added #{candidate.persistedTransactionId || ''}
              </Text>
            </View>
          )}

          {candidate.persistenceStatus === 'SUBMITTING' && (
            <View style={styles.submittingBadge}>
              <Clock color={colors.info} size={14} />
              <Text style={styles.submittingBadgeText}>Adding...</Text>
            </View>
          )}

          {candidate.persistenceStatus === 'SKIPPED_DUPLICATE' && (
            <View style={styles.skippedBadge}>
              <Copy color={colors.warning} size={14} />
              <Text style={styles.skippedBadgeText}>In DB</Text>
            </View>
          )}

          {candidate.persistenceStatus === 'FAILED' && (
            <View style={styles.failedBadge}>
              <XCircle color={colors.danger} size={14} />
              <Text style={styles.failedBadgeText}>Failed</Text>
            </View>
          )}

          <View style={[styles.directionBadge, { backgroundColor: dirMeta.bgColor }]}>
            {dirMeta.icon}
            <Text style={[styles.directionText, { color: dirMeta.color }]}>
              {dirMeta.label}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => onEdit(candidate)}
            style={styles.editButton}
            accessibilityLabel="Edit candidate"
          >
            <Edit3 color={colors.textSecondary} size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Direction & Reimbursement / Inflow Notices */}
      {candidate.direction === 'RECEIVED' && isReimbursement && (
        <View style={styles.reimbursementNoticeBox}>
          <ShieldCheck color={colors.success} size={14} />
          <Text style={styles.reimbursementNoticeText}>
            Reimbursement from {candidate.friendName || candidate.counterpartyName || 'Friend'} — reduces category net spending
          </Text>
        </View>
      )}

      {candidate.direction === 'RECEIVED' && !isReimbursement && (
        <View style={styles.inflowNoticeBox}>
          <ArrowDownLeft color={colors.success} size={14} />
          <Text style={styles.inflowNoticeText}>
            Incoming payment — does not count toward spending
          </Text>
        </View>
      )}

      {candidate.direction === 'TOP_UP' && (
        <View style={styles.topUpNoticeBox}>
          <RefreshCw color={colors.info} size={14} />
          <Text style={styles.topUpNoticeText}>
            Wallet top-up — internal transfer (contributes ₹0 to spending)
          </Text>
        </View>
      )}

      {/* Failure error message if failed */}
      {candidate.persistenceStatus === 'FAILED' && candidate.persistenceError && (
        <View style={styles.errorBanner}>
          <AlertTriangle color={colors.danger} size={14} />
          <Text style={styles.errorBannerText}>{candidate.persistenceError}</Text>
        </View>
      )}

      {/* Main Details: Merchant & Amount */}
      <View style={styles.detailsRow}>
        <View style={styles.merchantContainer}>
          <Text
            style={[styles.merchantName, shouldStrikethrough && styles.textStrikethrough]}
            numberOfLines={2}
          >
            {candidate.direction === 'TOP_UP'
              ? 'UPI Lite Top-up'
              : candidate.counterpartyName || candidate.merchantRawName || 'Unknown Merchant'}
          </Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>

        <View style={styles.amountContainer}>
          <Text
            style={[
              styles.amountText,
              candidate.direction === 'RECEIVED' && styles.amountReceived,
              candidate.direction === 'TOP_UP' && styles.amountTopUp,
              shouldStrikethrough && styles.textStrikethrough,
            ]}
          >
            {candidate.direction === 'RECEIVED' ? `+${formattedAmount}` : formattedAmount}
          </Text>
          {candidate.upiTransactionId ? (
            <Text style={styles.upiIdText} numberOfLines={1}>
              UPI: {candidate.upiTransactionId}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Category Row (for expenses and reimbursements only) */}
      {(candidate.direction === 'SENT' || isReimbursement) && (
        <View style={styles.categoryRow}>
          <TouchableOpacity
            style={isReimbursement ? styles.reimbursementCategoryPill : styles.categoryPill}
            onPress={() => onEdit(candidate)}
            activeOpacity={0.7}
          >
            <Tag color={isReimbursement ? colors.success : colors.brandLight} size={12} />
            <Text
              style={
                isReimbursement
                  ? styles.reimbursementCategoryLabel
                  : styles.categoryPillLabel
              }
            >
              {isReimbursement
                ? `Offsets: ${candidate.suggestedCategoryName || 'Select Category'}`
                : candidate.suggestedCategoryName || 'Uncategorized'}
            </Text>
          </TouchableOpacity>

          {candidate.confidence && (
            <View style={styles.confidenceBadge}>
              <ShieldCheck color={colors.textMuted} size={12} />
              <Text style={styles.confidenceText}>
                {candidate.confidence} Confidence
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Duplicate Warning Alert */}
      {candidate.isDuplicate && (
        <View style={styles.warningBox}>
          <Copy color={colors.warning} size={14} />
          <Text style={styles.warningBoxText}>
            Duplicate detected{candidate.duplicateTransactionId ? ` (matches #${candidate.duplicateTransactionId})` : ''}
          </Text>
        </View>
      )}

      {/* General Warnings */}
      {candidate.warnings && candidate.warnings.length > 0 && (
        <View style={styles.warningsList}>
          {candidate.warnings.map((w, idx) => (
            <View key={idx} style={styles.warningItem}>
              <AlertTriangle color={colors.warning} size={12} />
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Source Evidence Expandable Section */}
      {(candidate.sourceText || candidate.sourcePage !== undefined) && (
        <View style={styles.evidenceContainer}>
          <TouchableOpacity
            style={styles.evidenceToggle}
            onPress={() => setShowEvidence(prev => !prev)}
            activeOpacity={0.7}
          >
            <Text style={styles.evidenceToggleText}>
              {showEvidence ? 'Hide Source Evidence' : 'View Source Evidence'}
              {candidate.sourcePage !== undefined ? ` (Page ${candidate.sourcePage})` : ''}
            </Text>
            {showEvidence ? (
              <ChevronUp color={colors.textMuted} size={14} />
            ) : (
              <ChevronDown color={colors.textMuted} size={14} />
            )}
          </TouchableOpacity>

          {showEvidence && candidate.sourceText && (
            <View style={styles.evidenceContent}>
              <Text style={styles.evidenceCode} selectable>
                {candidate.sourceText}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardExcluded: {
    opacity: 0.55,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderMuted,
  },
  cardDuplicate: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.03)',
  },
  cardReimbursement: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inclusionText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  textLight: {
    color: colors.textSecondary,
  },
  textMuted: {
    color: colors.textMuted,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  directionText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  editButton: {
    padding: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  merchantContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  merchantName: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  dateText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  amountReceived: {
    color: colors.success,
  },
  amountTopUp: {
    color: colors.info,
  },
  nonSpendingBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  inflowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  inflowBadgeText: {
    color: colors.success,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  topUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  topUpBadgeText: {
    color: colors.info,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  unknownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  unknownBadgeText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  reimbursementNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  reimbursementNoticeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  inflowNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  inflowNoticeText: {
    color: colors.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  topUpNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  topUpNoticeText: {
    color: colors.info,
    fontSize: 11,
    flex: 1,
  },
  reimbursementCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  reimbursementCategoryLabel: {
    color: colors.success,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  upiIdText: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderColor: 'rgba(52, 211, 153, 0.25)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  categoryPillLabel: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginTop: spacing.xs,
  },
  warningBoxText: {
    color: colors.warning,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  warningsList: {
    marginTop: spacing.xs,
    gap: 2,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  warningText: {
    color: colors.warning,
    fontSize: 11,
  },
  evidenceContainer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingTop: spacing.xs,
  },
  evidenceToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  evidenceToggleText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  evidenceContent: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  cardPersisted: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: 'rgba(16, 185, 129, 0.03)',
  },
  cardFailed: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
  },
  checkboxDisabled: {
    opacity: 0.6,
  },
  textDisabled: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  persistedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  persistedBadgeText: {
    color: colors.success,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  submittingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  submittingBadgeText: {
    color: colors.info,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  skippedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  skippedBadgeText: {
    color: colors.warning,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  failedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  failedBadgeText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  exclusionNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  exclusionNoticeText: {
    color: colors.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  errorBannerText: {
    color: colors.danger,
    fontSize: 11,
    flex: 1,
  },
  evidenceCode: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});

export const CandidateCard = React.memo<CandidateCardProps>(
  CandidateCardComponent,
  (prev, next) => {
    if (prev.onToggleInclusion !== next.onToggleInclusion) return false;
    if (prev.onEdit !== next.onEdit) return false;

    const p = prev.candidate;
    const n = next.candidate;
    if (p === n) return true;

    return (
      p.localId === n.localId &&
      p.reviewStatus === n.reviewStatus &&
      p.isExcluded === n.isExcluded &&
      p.isDuplicate === n.isDuplicate &&
      p.amount === n.amount &&
      p.direction === n.direction &&
      p.timestamp === n.timestamp &&
      p.merchantRawName === n.merchantRawName &&
      p.counterpartyName === n.counterpartyName &&
      p.confidence === n.confidence &&
      p.selectedCategoryId === n.selectedCategoryId &&
      p.suggestedCategoryId === n.suggestedCategoryId &&
      p.suggestedCategoryName === n.suggestedCategoryName &&
      p.sourceText === n.sourceText &&
      p.sourcePage === n.sourcePage &&
      p.persistenceStatus === n.persistenceStatus &&
      p.persistedTransactionId === n.persistedTransactionId &&
      p.persistenceError === n.persistenceError &&
      p.isReimbursement === n.isReimbursement &&
      p.friendId === n.friendId &&
      p.friendName === n.friendName &&
      p.warnings?.length === n.warnings?.length
    );
  }
);

