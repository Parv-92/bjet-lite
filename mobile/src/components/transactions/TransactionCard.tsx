/**
 * Bjet Mobile - TransactionCard
 * Interactive card representing a transaction item in lists.
 * Tapping navigates to detailed view /transaction/[id].
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileCheck,
  ChevronRight,
  CheckSquare,
  Square,
} from 'lucide-react-native';
import { Card } from '../ui/Card';
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
      <Card style={[styles.card, isSelected && styles.cardSelected]}>
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <View style={styles.selectionBox}>
            {isSelected ? (
              <CheckSquare size={20} color={colors.brand} />
            ) : (
              <Square size={20} color={colors.textMuted} />
            )}
          </View>
        )}

        <View style={styles.leftContent}>
          <View
            style={[
              styles.categoryCircle,
              {
                backgroundColor: isReimbursement
                  ? 'rgba(16, 185, 129, 0.15)'
                  : `${categoryColor}20`,
              },
            ]}
          >
            {isReceived ? (
              <ArrowDownLeft
                color={isReimbursement ? colors.brandLight : categoryColor}
                size={18}
              />
            ) : (
              <ArrowUpRight color={categoryColor} size={18} />
            )}
          </View>

          <View style={styles.details}>
            <View style={styles.topRow}>
              <Text style={styles.merchantName} numberOfLines={1}>
                {merchantName}
              </Text>
            </View>

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
              <Text style={styles.dot}>•</Text>
              <Text style={styles.dateText}>{formatDate(transaction.timestamp)}</Text>
              {transaction.has_receipt && (
                <>
                  <Text style={styles.dot}>•</Text>
                  <FileCheck
                    color={colors.brandLight}
                    size={12}
                    style={styles.receiptIcon}
                  />
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.rightContent}>
          <Text
            style={[
              styles.amountText,
              isReceived && styles.amountTextReceived,
              isReimbursement && styles.amountTextReimbursement,
            ]}
          >
            {isReceived ? '+' : '-'}
            {formatCurrency(transaction.amount)}
          </Text>

          {isReimbursement && (
            <View style={styles.reimbursementPill}>
              <Text style={styles.reimbursementPillText}>Reimbursement</Text>
            </View>
          )}

          {paidForOthers > 0 && (
            <Text style={styles.netShareText}>
              Net: {formatCurrency(netPersonalAmount)}
            </Text>
          )}

          <View style={styles.statusRow}>
            <TransactionStatusBadge status={transaction.status} size="sm" />
            {!isSelectionMode && (
              <ChevronRight
                color={colors.textMuted}
                size={14}
                style={styles.chevron}
              />
            )}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSelected: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  selectionBox: {
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  categoryCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  details: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  merchantName: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  categoryBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    maxWidth: 100,
  },
  friendBadge: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    marginLeft: 2,
    maxWidth: 80,
  },
  dot: {
    color: colors.textMuted,
    marginHorizontal: 4,
    fontSize: fontSizes.xs,
  },
  dateText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  receiptIcon: {
    marginLeft: 2,
  },
  rightContent: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    marginBottom: 4,
  },
  amountTextReceived: {
    color: colors.brandLight,
  },
  amountTextReimbursement: {
    color: colors.brandLight,
  },
  reimbursementPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.full,
    marginBottom: 2,
  },
  reimbursementPillText: {
    color: colors.brandLight,
    fontSize: 10,
    fontWeight: fontWeights.bold,
  },
  netShareText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: fontWeights.medium,
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    marginLeft: 4,
  },
});

export default TransactionCard;
