/**
 * Bjet Mobile - CategoryBudgetCard Component (Phase 8)
 *
 * Displays an individual category budget with spending progress,
 * remaining allowance, over-budget warning tag, and edit action.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Edit3, AlertCircle, ChevronRight } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { BudgetSummary } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface CategoryBudgetCardProps {
  item: BudgetSummary;
  onEdit: (item: BudgetSummary) => void;
  onPress?: (item: BudgetSummary) => void;
}

export const CategoryBudgetCard: React.FC<CategoryBudgetCardProps> = ({
  item,
  onEdit,
  onPress,
}) => {
  const categoryName = item.category?.name || `Category #${item.category_id}`;
  const categoryColor = item.category?.color || colors.brand;
  const spent = parseFloat(item.spent_amount) || 0;
  const limit = parseFloat(item.amount_limit) || 0;
  const remaining = parseFloat(item.remaining_amount);
  const percentage = item.percentage_used || 0;
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const isOverBudget = item.is_over_budget || spent > limit;
  const isNearLimit = percentage >= 85 && !isOverBudget;

  const getProgressColor = () => {
    if (isOverBudget) return colors.danger;
    if (isNearLimit) return colors.warning;
    return categoryColor;
  };

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.75 : 1}
      onPress={() => onPress?.(item)}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`View ${categoryName} transactions`}
    >
      <Card
        style={StyleSheet.flatten([
          styles.card,
          isOverBudget && styles.cardOverBudget,
        ])}
      >
        {/* Top Header: Category name/color and Edit button */}
        <View style={styles.topRow}>
          <View style={styles.categoryInfo}>
            <View style={[styles.colorIndicator, { backgroundColor: categoryColor }]} />
            <Text style={styles.categoryName} numberOfLines={1}>
              {categoryName}
            </Text>
            {onPress && <ChevronRight size={14} color={colors.textMuted} style={styles.categoryChevron} />}
          </View>

          <TouchableOpacity
            style={styles.editButton}
            onPress={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            accessibilityLabel={`Edit ${categoryName} budget`}
            activeOpacity={0.7}
          >
            <Edit3 color={colors.textSecondary} size={15} />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Main Amounts Row */}
        <View style={styles.amountsRow}>
          <View style={styles.spentLimitRow}>
            <Text style={[styles.spentText, isOverBudget && styles.textDanger]}>
              {formatCurrency(spent)}
            </Text>
            <Text style={styles.limitText}> / {formatCurrency(limit)}</Text>
          </View>
          <Text style={[styles.percentageText, { color: getProgressColor() }]}>
            {percentage.toFixed(1)}%
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${clampedPercentage}%`,
                backgroundColor: getProgressColor(),
              },
            ]}
          />
        </View>

        {/* Footer: Remaining / Over-budget label */}
        <View style={styles.footerRow}>
          <Text style={styles.remainingLabel}>
            {isOverBudget ? 'Over Budget' : 'Remaining'}
          </Text>
          <Text
            style={[
              styles.remainingValue,
              isOverBudget ? styles.textDanger : styles.textSuccess,
            ]}
          >
            {isOverBudget
              ? `-${formatCurrency(Math.abs(remaining))}`
              : formatCurrency(remaining)}
          </Text>
        </View>

        {/* Over-budget tag */}
        {isOverBudget && (
          <View style={styles.overBudgetTag}>
            <AlertCircle color={colors.danger} size={12} />
            <Text style={styles.overBudgetTagText}>Limit exceeded for this category</Text>
          </View>
        )}
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
  },
  cardOverBudget: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.03)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  colorIndicator: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    marginRight: spacing.xs + 2,
  },
  categoryName: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  categoryChevron: {
    marginLeft: 4,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
  },
  editText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs + 2,
  },
  spentLimitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  spentText: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  limitText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  percentageText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remainingLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  remainingValue: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  textDanger: {
    color: colors.danger,
  },
  textSuccess: {
    color: colors.success,
  },
  overBudgetTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.2)',
  },
  overBudgetTagText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: fontWeights.medium,
  },
});
