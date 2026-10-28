/**
 * Bjet Mobile - Monthly Spending Breakdown Pie / Donut Chart Card
 *
 * Renders an authoritative spending breakdown for the currently selected month and year:
 * - Represents the user's ENTIRE personal spending for the month.
 * - Outgoing expenses (minus paid-for-others) offset by reimbursements.
 * - Explicitly includes Uncategorized spending (#9E9E9E).
 * - Only includes categories with positive final net spending (> 0).
 * - Built using react-native-svg for crisp, hardware-accelerated donut visualization.
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, G } from 'react-native-svg';
import { PieChart, ChevronRight } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { useMonthlySpendingBreakdown } from '../../hooks/useBudgets';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface SpendingPieChartCardProps {
  month: number;
  year: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const SpendingPieChartCard: React.FC<SpendingPieChartCardProps> = ({ month, year }) => {
  const router = useRouter();
  const { data: breakdown, isLoading, isError } = useMonthlySpendingBreakdown(month, year);

  const handleCategoryPress = (item: {
    category_id: number | null;
    category_name: string;
    color: string;
  }) => {
    router.push({
      pathname: '/category-transactions' as any,
      params: {
        categoryId: item.category_id !== null ? String(item.category_id) : 'uncategorized',
        categoryName: item.category_name,
        categoryColor: item.color,
        month: String(month),
        year: String(year),
      },
    });
  };

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const monthLabel = `${MONTH_NAMES[month - 1] || ''} ${year}`;

  // SVG Donut Dimensions
  const chartSize = 180;
  const strokeWidth = 20;
  const radius = (chartSize - strokeWidth) / 2; // (180 - 20) / 2 = 80
  const center = chartSize / 2; // 90
  const circumference = 2 * Math.PI * radius; // ~502.65

  const totalSpent = breakdown
    ? typeof breakdown.total_spent === 'number'
      ? breakdown.total_spent
      : parseFloat(breakdown.total_spent) || 0
    : 0;
  const items = breakdown?.items || [];
  const hasSpending = totalSpent > 0 && items.length > 0;

  // Calculate slice stroke dash array and offsets
  let cumulativeOffset = 0;
  const slices = items.map((item) => {
    const itemAmount =
      typeof item.spent_amount === 'number'
        ? item.spent_amount
        : parseFloat(item.spent_amount) || 0;
    const fraction = totalSpent > 0 ? itemAmount / totalSpent : 0;
    const strokeDash = fraction * circumference;
    const gap = Math.max(0, circumference - strokeDash);
    const offset = -cumulativeOffset;
    cumulativeOffset += strokeDash;

    return {
      ...item,
      strokeDasharray: `${strokeDash} ${gap}`,
      strokeDashoffset: offset,
      color: item.category_color || '#3B82F6',
    };
  });

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <PieChart size={16} color={colors.brandLight} />
          </View>
          <View>
            <Text style={styles.title}>Spending Breakdown</Text>
            <Text style={styles.subtitle}>Where did money go this month</Text>
          </View>
        </View>
        <View style={styles.monthPill}>
          <Text style={styles.monthPillText}>{monthLabel}</Text>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={styles.loadingText}>Loading breakdown...</Text>
        </View>
      ) : isError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptySubtitle}>Unable to load spending breakdown</Text>
        </View>
      ) : !hasSpending ? (
        /* Empty / Zero spending state */
        <View style={styles.emptyContainer}>
          <View style={styles.donutWrapper}>
            <Svg width={chartSize} height={chartSize}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke={colors.border}
                strokeWidth={strokeWidth}
                fill="none"
                opacity={0.3}
              />
            </Svg>
            <View style={styles.donutCenter}>
              <Text style={styles.centerLabel}>TOTAL SPENT</Text>
              <Text style={styles.centerAmount}>₹0</Text>
            </View>
          </View>
          <Text style={styles.emptyTitle}>No spending recorded</Text>
          <Text style={styles.emptySubtitle}>
            Transactions logged for {monthLabel} will appear here categorized with visual shares.
          </Text>
        </View>
      ) : (
        /* Donut Chart and Category List */
        <View style={styles.contentContainer}>
          {/* Donut Chart */}
          <View style={styles.donutWrapper}>
            <Svg width={chartSize} height={chartSize}>
              <G transform={`rotate(-90 ${center} ${center})`}>
                {/* Background Ring */}
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={colors.borderMuted}
                  strokeWidth={strokeWidth}
                  fill="none"
                  opacity={0.4}
                />
                {/* Slices */}
                {slices.map((slice, index) => (
                  <Circle
                    key={`slice-${slice.category_id ?? 'uncat'}-${index}`}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={slice.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={slice.strokeDasharray}
                    strokeDashoffset={slice.strokeDashoffset}
                    strokeLinecap="butt"
                    fill="none"
                  />
                ))}
              </G>
            </Svg>

            {/* Centered Total */}
            <View style={styles.donutCenter}>
              <Text style={styles.centerLabel}>TOTAL SPENT</Text>
              <Text style={styles.centerAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(totalSpent)}
              </Text>
              <Text style={styles.centerCategoryCount}>
                {items.length} {items.length === 1 ? 'category' : 'categories'}
              </Text>
            </View>
          </View>

          {/* Category Legend & Breakdown List */}
          <View style={styles.legendList}>
            {slices.map((item, index) => (
              <TouchableOpacity
                key={`legend-${item.category_id ?? 'uncat'}-${index}`}
                style={styles.legendItem}
                onPress={() => handleCategoryPress(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`View ${item.category_name} transactions for ${monthLabel}`}
              >
                {/* Top Row: Color dot, Category Name, Amount, Percentage */}
                <View style={styles.legendItemHeader}>
                  <View style={styles.legendLeft}>
                    <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {item.category_name}
                    </Text>
                  </View>

                  <View style={styles.legendRight}>
                    <Text style={styles.categoryAmount}>
                      {formatCurrency(item.spent_amount)}
                    </Text>
                    <View style={styles.percentageBadge}>
                      <Text style={styles.percentageText}>{item.percentage}%</Text>
                    </View>
                    <ChevronRight size={13} color={colors.textMuted} style={styles.chevron} />
                  </View>
                </View>

                {/* Relative Progress Bar */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        backgroundColor: item.color,
                        width: `${Math.min(100, Math.max(2, item.percentage))}%`,
                      },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  title: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  monthPill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthPillText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  contentContainer: {
    alignItems: 'center',
  },
  donutWrapper: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  donutCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  centerAmount: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginVertical: 2,
    maxWidth: 130,
    textAlign: 'center',
  },
  centerCategoryCount: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  legendList: {
    width: '100%',
    marginTop: spacing.md,
    paddingTop: spacing.xs,
  },
  legendItem: {
    marginBottom: spacing.sm,
  },
  legendItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.xs,
  },
  categoryName: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    flexShrink: 1,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryAmount: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginRight: spacing.xs,
  },
  percentageBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  percentageText: {
    fontSize: 10,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  chevron: {
    marginLeft: 4,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: colors.surfaceHover,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
  },
});
