/**
 * Bjet Lite - Previous Month & Financial Overview Card
 * Hallmark-inspired clean, restrained presentation of monthly financial movement:
 * - Personal Net Spending (Gross SENT - Paid For Others - RECEIVED Reimbursements)
 * - Incoming Money (Reimbursements received)
 * - Net Movement (+ / −) with distinct visual indicators
 * - Budget Allocation & Usage progress
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Wallet,
} from 'lucide-react-native';
import { Card } from '../ui/Card';
import type { MonthlyFinancialSummary } from '../../repositories/budgetRepository';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface PreviousMonthOverviewCardProps {
  summary: MonthlyFinancialSummary;
  monthName: string;
  year: number;
  isPreviousCompletedMonth?: boolean;
}

export const PreviousMonthOverviewCard: React.FC<PreviousMonthOverviewCardProps> = ({
  summary,
  monthName,
  year,
  isPreviousCompletedMonth = false,
}) => {
  const {
    personalSpending,
    incomingMoney,
    netMovement,
    totalBudgetLimit,
    totalRemainingBudget,
    budgetUtilization,
    overBudgetCount,
    transactionCount,
  } = summary;

  const hasBudgets = totalBudgetLimit > 0;
  const isOverBudget = personalSpending > totalBudgetLimit && hasBudgets;
  const isNetNegative = netMovement < 0; // Negative movement means net outflow (spent more than received)
  const isNetPositive = netMovement > 0; // Positive movement means net inflow

  const formatCurrency = (val: number) => {
    return `₹${Math.abs(val).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const clampedProgress = Math.min(100, Math.max(0, budgetUtilization));

  return (
    <Card style={styles.card}>
      {/* Top Badge: Previous Completed Month vs Selected Period */}
      <View style={styles.headerRow}>
        <View style={styles.badgeContainer}>
          <Calendar size={12} color={isPreviousCompletedMonth ? colors.brandLight : colors.textSecondary} />
          <Text style={[styles.badgeText, isPreviousCompletedMonth && styles.badgeTextActive]}>
            {isPreviousCompletedMonth ? 'Previous completed month' : 'Selected month'}
          </Text>
        </View>

        <Text style={styles.periodText}>
          {monthName} {year}
        </Text>
      </View>

      {/* Hero Metric: Personal Net Spending */}
      <View style={styles.heroSection}>
        <Text style={styles.heroLabel}>Personal Net Spending</Text>
        <Text style={styles.heroAmount}>
          {formatCurrency(personalSpending)}
        </Text>
        <Text style={styles.heroSubtext}>
          {transactionCount > 0
            ? `${transactionCount} transaction${transactionCount > 1 ? 's' : ''} in ${monthName}`
            : `No transactions recorded for ${monthName} ${year}`}
        </Text>
      </View>

      {/* Flow Breakdown Row: Incoming Money vs Net Movement */}
      <View style={styles.flowRow}>
        {/* Incoming Money */}
        <View style={styles.flowItem}>
          <View style={styles.flowLabelRow}>
            <View style={[styles.flowIconCircle, styles.flowIconIncoming]}>
              <ArrowDownLeft size={13} color={colors.success} />
            </View>
            <Text style={styles.flowLabel}>Incoming</Text>
          </View>
          <Text style={styles.flowAmount}>
            +{formatCurrency(incomingMoney)}
          </Text>
          <Text style={styles.flowHint}>Reimbursements</Text>
        </View>

        <View style={styles.flowDivider} />

        {/* Net Movement */}
        <View style={styles.flowItem}>
          <View style={styles.flowLabelRow}>
            <View
              style={[
                styles.flowIconCircle,
                isNetNegative ? styles.flowIconOutgoing : styles.flowIconIncoming,
              ]}
            >
              {isNetNegative ? (
                <ArrowUpRight size={13} color={colors.danger} />
              ) : (
                <ArrowDownLeft size={13} color={colors.success} />
              )}
            </View>
            <Text style={styles.flowLabel}>Net Movement</Text>
          </View>
          <Text
            style={[
              styles.flowAmount,
              isNetNegative ? styles.flowAmountNegative : isNetPositive ? styles.flowAmountPositive : null,
            ]}
          >
            {isNetNegative ? `−${formatCurrency(netMovement)}` : isNetPositive ? `+${formatCurrency(netMovement)}` : `₹0.00`}
          </Text>
          <Text style={styles.flowHint}>
            {isNetNegative ? 'Net Outflow' : isNetPositive ? 'Net Inflow' : 'Balanced'}
          </Text>
        </View>
      </View>

      {/* Budget Allocation & Utilization Section */}
      <View style={styles.budgetSection}>
        <View style={styles.budgetHeaderRow}>
          <View style={styles.budgetHeaderLeft}>
            <Wallet size={14} color={colors.brandLight} />
            <Text style={styles.budgetTitle}>Budget Allocation</Text>
          </View>

          {isOverBudget ? (
            <View style={[styles.budgetPill, styles.budgetPillDanger]}>
              <AlertTriangle size={12} color={colors.danger} />
              <Text style={styles.budgetPillTextDanger}>
                {overBudgetCount} over budget
              </Text>
            </View>
          ) : hasBudgets ? (
            <View style={[styles.budgetPill, styles.budgetPillSuccess]}>
              <CheckCircle2 size={12} color={colors.brandLight} />
              <Text style={styles.budgetPillTextSuccess}>
                {Math.round(budgetUtilization)}% used
              </Text>
            </View>
          ) : null}
        </View>

        {hasBudgets ? (
          <>
            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${clampedProgress}%` },
                  isOverBudget && styles.progressBarFillDanger,
                ]}
              />
            </View>

            {/* Budget Limit Details */}
            <View style={styles.budgetMetricsRow}>
              <View>
                <Text style={styles.budgetMetricLabel}>Total Budget</Text>
                <Text style={styles.budgetMetricValue}>
                  {formatCurrency(totalBudgetLimit)}
                </Text>
              </View>

              <View style={styles.alignRight}>
                <Text style={styles.budgetMetricLabel}>
                  {isOverBudget ? 'Exceeded By' : 'Remaining'}
                </Text>
                <Text
                  style={[
                    styles.budgetMetricValue,
                    isOverBudget ? styles.budgetMetricValueDanger : styles.budgetMetricValueSuccess,
                  ]}
                >
                  {isOverBudget
                    ? formatCurrency(personalSpending - totalBudgetLimit)
                    : formatCurrency(totalRemainingBudget)}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noBudgetNotice}>
            <Text style={styles.noBudgetNoticeText}>
              No budget limits allocated for this month.
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  badgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: fontWeights.semibold,
  },
  badgeTextActive: {
    color: colors.brandLight,
  },
  periodText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    marginBottom: 4,
  },
  heroAmount: {
    color: colors.text,
    fontSize: 32,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  heroSubtext: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  flowRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  flowItem: {
    flex: 1,
  },
  flowDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  flowLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  flowIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowIconIncoming: {
    backgroundColor: 'rgba(20, 184, 166, 0.15)',
  },
  flowIconOutgoing: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
  },
  flowLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  flowAmount: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  flowAmountNegative: {
    color: colors.danger,
  },
  flowAmountPositive: {
    color: colors.success,
  },
  flowHint: {
    color: colors.textMuted,
    fontSize: 10,
  },
  budgetSection: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingTop: spacing.md,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  budgetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  budgetTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  budgetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  budgetPillSuccess: {
    backgroundColor: 'rgba(20, 184, 166, 0.1)',
  },
  budgetPillDanger: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  budgetPillTextSuccess: {
    color: colors.brandLight,
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },
  budgetPillTextDanger: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.brand,
    borderRadius: radii.full,
  },
  progressBarFillDanger: {
    backgroundColor: colors.danger,
  },
  budgetMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  budgetMetricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  budgetMetricValue: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
  budgetMetricValueSuccess: {
    color: colors.brandLight,
  },
  budgetMetricValueDanger: {
    color: colors.danger,
  },
  noBudgetNotice: {
    paddingVertical: spacing.xs,
  },
  noBudgetNoticeText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
});
