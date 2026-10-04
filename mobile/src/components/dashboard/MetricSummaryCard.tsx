/**
 * Bjet Mobile - MetricSummaryCard
 * Displays total monthly spending, budget limits, utilization progress, and warnings.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface MetricSummaryCardProps {
  totalSpent: number;
  totalLimit: number;
  totalRemaining: number;
  utilizationPercentage: number;
  overBudgetCount: number;
  monthName: string;
  year: number;
}

export const MetricSummaryCard: React.FC<MetricSummaryCardProps> = ({
  totalSpent,
  totalLimit,
  totalRemaining,
  utilizationPercentage,
  overBudgetCount,
  monthName,
  year,
}) => {
  const hasBudget = totalLimit > 0;
  const clampedProgress = Math.min(100, Math.max(0, utilizationPercentage));
  const isOverBudget = totalSpent > totalLimit && hasBudget;

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.periodText}>
            {monthName} {year}
          </Text>
          <Text style={styles.mainAmount}>{formatCurrency(totalSpent)}</Text>
          <Text style={styles.subtext}>Monthly Budget Spending</Text>
        </View>

        {isOverBudget ? (
          <View style={[styles.statusBadge, styles.statusBadgeDanger]}>
            <AlertTriangle color={colors.danger} size={14} />
            <Text style={styles.statusBadgeTextDanger}>Over Budget</Text>
          </View>
        ) : hasBudget ? (
          <View style={[styles.statusBadge, styles.statusBadgeSuccess]}>
            <CheckCircle2 color={colors.brand} size={14} />
            <Text style={styles.statusBadgeTextSuccess}>On Track</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, styles.statusBadgeMuted]}>
            <TrendingUp color={colors.textSecondary} size={14} />
            <Text style={styles.statusBadgeTextMuted}>No Budget Set</Text>
          </View>
        )}
      </View>

      {hasBudget && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${clampedProgress}%`,
                  backgroundColor: isOverBudget ? colors.danger : colors.brand,
                },
              ]}
            />
          </View>

          <View style={styles.metricsRow}>
            <View>
              <Text style={styles.metricLabel}>Budget Limit</Text>
              <Text style={styles.metricValue}>{formatCurrency(totalLimit)}</Text>
            </View>
            <View style={styles.metricAlignRight}>
              <Text style={styles.metricLabel}>Remaining</Text>
              <Text
                style={[
                  styles.metricValue,
                  isOverBudget ? styles.textDanger : styles.textSuccess,
                ]}
              >
                {formatCurrency(totalRemaining)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {overBudgetCount > 0 && (
        <View style={styles.warningBox}>
          <AlertTriangle color={colors.warning} size={14} />
          <Text style={styles.warningText}>
            {overBudgetCount} {overBudgetCount === 1 ? 'category is' : 'categories are'} over budget
          </Text>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  periodText: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  mainAmount: {
    color: colors.text,
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  subtext: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: colors.brand,
    borderWidth: 1,
  },
  statusBadgeDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: colors.danger,
    borderWidth: 1,
  },
  statusBadgeMuted: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: colors.border,
    borderWidth: 1,
  },
  statusBadgeTextSuccess: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  statusBadgeTextDanger: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  statusBadgeTextMuted: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  progressContainer: {
    marginTop: spacing.lg,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  metricAlignRight: {
    alignItems: 'flex-end',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  metricValue: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    marginTop: 2,
  },
  textSuccess: {
    color: colors.brandLight,
  },
  textDanger: {
    color: colors.danger,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  warningText: {
    color: colors.warning,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
});

export default MetricSummaryCard;
