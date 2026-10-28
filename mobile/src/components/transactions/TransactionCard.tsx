/**
 * Bjet Mobile - TransactionCard
 * Interactive card representing a transaction item in lists.
 * Tapping navigates to detailed view /transaction/[id].
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  FileCheck,
  CheckSquare,
  Square,
} from 'lucide-react-native';
import { TransactionStatusBadge } from './TransactionStatusBadge';

import { TransactionListItemResponse } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../utils/perfDiagnostic';

interface TransactionCardProps {
  transaction: TransactionListItemResponse;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
  transaction,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const router = useRouter();

  // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY] Sample first 2 transaction card renders
  if (transaction.id <= 2) {
    useRenderDiagnostic(`TransactionCard[#${transaction.id}]`, {
      amount: transaction.amount,
      status: transaction.status,
    });
  }

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const merchantName =
    transaction.merchant?.clean_name ||
    transaction.merchant_raw_name ||
    'Transaction';
  const categoryName = transaction.category?.name || 'Uncategorized';
  const categoryColor = transaction.category?.color || colors.textMuted;

  const isReimbursement = Boolean(transaction.is_reimbursement);
  const isReceived = transaction.direction === 'RECEIVED';
  const paidForOthers = parseFloat(transaction.amount_paid_for_someone_else || '0');
  const totalAmount = parseFloat(transaction.amount || '0');
  const netPersonalAmount = Math.max(0, totalAmount - paidForOthers);

  const handlePress = () => {
    if (isSelectionMode) {
      onToggleSelect?.(transaction.id);
    } else {
      router.push(`/transaction/${transaction.id}` as any);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${merchantName}, ${formatCurrency(transaction.amount)}`}
    >
      <View style={[styles.rowContainer, isSelected && styles.rowSelected]}>
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <View style={styles.selectionBox}>
            {isSelected ? (
              <CheckSquare size={18} color={colors.brandLight} />
            ) : (
              <Square size={18} color={colors.textMuted} />
            )}
          </View>
        )}

        {/* Category Accent Indicator Line */}
        <View
          style={[
            styles.categoryIndicator,
            { backgroundColor: isReimbursement ? colors.brandLight : categoryColor },
          ]}
        />

        {/* Transaction Content */}
        <View style={styles.contentWrapper}>
          <View style={styles.leftCol}>
            <Text style={styles.merchantName} numberOfLines={1}>
              {merchantName}
            </Text>

            <View style={styles.metaRow}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  if (isSelectionMode) {
                    onToggleSelect?.(transaction.id);
                  } else {
                    router.push(`/transaction/edit/${transaction.id}` as any);
                  }
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Categorize ${merchantName}, currently ${categoryName}`}
              >
                <Text
                  style={[styles.categoryBadge, { color: categoryColor }]}
                  numberOfLines={1}
                >
                  {categoryName}
                </Text>
              </TouchableOpacity>

              {transaction.friend?.name && (
                <Text style={styles.friendBadge} numberOfLines={1}>
                  ({transaction.friend.name})
                </Text>
              )}

              <Text style={styles.dateText}>{formatDate(transaction.timestamp)}</Text>

              {transaction.has_receipt && (
                <FileCheck
                  color={colors.brandLight}
                  size={12}
                  style={styles.receiptIcon}
                />
              )}
            </View>
          </View>

          <View style={styles.rightCol}>
            <Text
              style={[
                styles.amountText,
                isReceived ? styles.amountTextReceived : styles.amountTextSent,
              ]}
            >
              {isReceived ? '+' : '−'}
              {formatCurrency(transaction.amount)}
            </Text>

            {isReimbursement && (
              <View style={styles.reimbursementPill}>
                <Text style={styles.reimbursementPillText}>reimbursement</Text>
              </View>
            )}

            {paidForOthers > 0 && (
              <Text style={styles.netShareText}>
                Personal: {formatCurrency(netPersonalAmount)}
              </Text>
            )}

            {transaction.status !== 'CONFIRMED' && (
              <View style={styles.statusRow}>
                <TransactionStatusBadge status={transaction.status} size="sm" />
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  rowContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowSelected: {
    borderColor: colors.brandLight,
    backgroundColor: 'rgba(20, 184, 166, 0.08)',
  },
  selectionBox: {
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIndicator: {
    width: 3,
    height: 28,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  contentWrapper: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  merchantName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'nowrap',
  },
  categoryBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    maxWidth: 110,
  },
  friendBadge: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    maxWidth: 80,
  },
  dateText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  receiptIcon: {
    marginLeft: 2,
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 15,
    fontWeight: fontWeights.bold,
    fontVariant: ['tabular-nums'],
    lineHeight: 20,
  },
  amountTextSent: {
    color: colors.text,
  },
  amountTextReceived: {
    color: colors.brandLight,
  },
  reimbursementPill: {
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.xs,
    marginTop: 2,
  },
  reimbursementPillText: {
    color: colors.brandLight,
    fontSize: 10,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.1,
  },
  netShareText: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: fontWeights.normal,
    marginTop: 1,
  },
  statusRow: {
    marginTop: 2,
  },
});

export default TransactionCard;

