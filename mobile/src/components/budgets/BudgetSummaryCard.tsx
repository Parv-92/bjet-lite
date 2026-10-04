/**
 * Bjet Mobile - BudgetSummaryCard Component (Phase 8)
 *
 * Displays overall monthly budget totals, spending progress, remaining balance,
 * over-budget category warnings, and pending confirmation exclusion note.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, Info, TrendingUp } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface BudgetSummaryCardProps {
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationPercentage: number;
  overBudgetCount: number;
  budgetCount: number;
}

export const BudgetSummaryCard: React.FC<BudgetSummaryCardProps> = ({
  totalLimit,
  totalSpent,
  totalRemaining,
  utilizationPercentage,
  overBudgetCount,
  budgetCount,
}) => {
  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const clampedPercentage = Math.min(100, Math.max(0, utilizationPercentage));
  const isOverBudget = totalSpent > totalLimit && totalLimit > 0;
  const isNearLimit = utilizationPercentage >= 85 && !isOverBudget;

  const getProgressColor = () => {
    if (isOverBudget) return colors.danger;
    if (isNearLimit) return colors.warning;
    return colors.brandLight;
  };

  return (
    <Card style={styles.card}>
      {/* Header: Title and Category count */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <TrendingUp color={colors.brandLight} size={18} />
          <Text style={styles.title}>Budgeted Spending</Text>
        </View>
        <Text style={styles.budgetCountText}>
          {budgetCount} {budgetCount === 1 ? 'budgeted category' : 'budgeted categories'}
        </Text>
      </View>

      {/* Main Metric: Spent / Limit */}
      <View style={styles.metricsContainer}>
        <View style={styles.amountRow}>
          <Text style={[styles.spentAmount, isOverBudget && styles.textDanger]}>
            {formatCurrency(totalSpent)}
          </Text>
          <Text style={styles.limitAmount}> / {formatCurrency(totalLimit)}</Text>
        </View>
        <Text style={[styles.percentageText, { color: getProgressColor() }]}>
          {utilizationPercentage.toFixed(1)}%
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

      {/* Remaining Breakdown */}
      <View style={styles.footerRow}>
        <Text style={styles.remainingLabel}>
          {isOverBudget ? 'Over Budget By' : 'Remaining Balance'}
        </Text>
        <Text
          style={[
            styles.remainingValue,
            isOverBudget ? styles.textDanger : styles.textSuccess,
          ]}
        >
          {formatCurrency(Math.abs(totalRemaining))}
        </Text>
      </View>

      {/* Over-Budget Alert Badge */}
      {overBudgetCount > 0 && (
        <View style={styles.overBudgetBanner}>
          <AlertTriangle color={colors.danger} size={14} />
          <Text style={styles.overBudgetText}>
            {overBudgetCount} {overBudgetCount === 1 ? 'category exceeds' : 'categories exceed'} budget limit
          </Text>
        </View>
      )}

      {/* Informational Caption: Requirement 18 */}
      <View style={styles.exclusionNote}>
        <Info color={colors.textMuted} size={12} />
        <Text style={styles.exclusionNoteText}>
          Pending receipt drafts are excluded from budget spending until confirmed.
        </Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  budgetCountText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  spentAmount: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  limitAmount: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  percentageText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  textDanger: {
    color: colors.danger,
  },
  textSuccess: {
    color: colors.success,
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  remainingLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  remainingValue: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  overBudgetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: spacing.sm,
  },
  overBudgetText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  exclusionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  exclusionNoteText: {
    color: colors.textMuted,
    fontSize: 10,
    fontStyle: 'italic',
  },
});
