/**
 * Bjet Lite - Category-Wise Monthly Transaction Details Screen
 *
 * Dedicated page showing transactions for a selected category and month.
 * Requirements:
 * 1. Navigate to dedicated page for category and month.
 * 2. Display category name, selected month and year, and relevant spending summary.
 * 3. List only transactions belonging to that category within the selected month.
 * 4. Group transactions by date, with collapsible sections and dropdown arrows.
 * 5. Allow users to expand and collapse individual date groups.
 * 6. Display a concise empty state if no matching transactions exist.
 * 7. Preserve selected category and month during navigation, including when viewing previous months.
 * 8. Support back navigation without losing the previous screen's state.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  ReceiptText,
  AlertTriangle,
  Wallet,
  TrendingDown,
  ArrowDownLeft,
} from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { MonthSelector } from '../src/components/budgets/MonthSelector';
import { TransactionCard } from '../src/components/transactions/TransactionCard';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { EmptyState } from '../src/components/common/EmptyState';
import { Card } from '../src/components/ui/Card';
import { useTransactions } from '../src/hooks/useTransactions';
import { useCategoryBudgetStatus } from '../src/hooks/useBudgets';
import { useCategories } from '../src/hooks/useCategories';
import { TransactionListItemResponse } from '../src/types/api';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  transactions: TransactionListItemResponse[];
  dayNetSpending: number;
}

export default function CategoryTransactionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    categoryName?: string;
    categoryColor?: string;
    month?: string;
    year?: string;
  }>();

  const now = new Date();
  const initialMonth = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;
  const initialYear = params.year ? parseInt(params.year, 10) : now.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);

  const isUncategorized =
    !params.categoryId ||
    params.categoryId === 'null' ||
    params.categoryId === 'uncategorized' ||
    params.categoryName?.toLowerCase() === 'uncategorized';

  const categoryIdNum = isUncategorized ? null : parseInt(params.categoryId || '0', 10);

  // Look up category meta for accurate name/color fallback
  const { data: allCategories } = useCategories();
  const matchedCategory = useMemo(() => {
    if (isUncategorized) return null;
    return allCategories?.find((c) => c.id === categoryIdNum);
  }, [allCategories, categoryIdNum, isUncategorized]);

  const categoryName = isUncategorized
    ? 'Uncategorized'
    : matchedCategory?.name || params.categoryName || `Category #${categoryIdNum}`;

  const categoryColor = isUncategorized
    ? '#9E9E9E'
    : matchedCategory?.color || params.categoryColor || colors.brand;

  // Query transactions for the selected category and month
  const queryParams = useMemo(() => ({
    month: selectedMonth,
    year: selectedYear,
    ...(isUncategorized
      ? { uncategorized: true }
      : categoryIdNum !== null
      ? { category_id: categoryIdNum }
      : {}),
  }), [selectedMonth, selectedYear, isUncategorized, categoryIdNum]);

  const {
    data: transactions,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useTransactions(queryParams);

  // Query budget status if category has configured budget
  const { data: budgetStatus } = useCategoryBudgetStatus(
    categoryIdNum || 0,
    selectedMonth,
    selectedYear,
    !isUncategorized && categoryIdNum !== null && categoryIdNum > 0
  );

  // Calculate authoritative spending metrics from transactions
  const spendingSummary = useMemo(() => {
    if (!transactions) {
      return {
        personalNetSpending: 0,
        grossSent: 0,
        paidForOthers: 0,
        reimbursements: 0,
        count: 0,
      };
    }

    let grossSent = 0;
    let paidForOthers = 0;
    let reimbursements = 0;

    for (const tx of transactions) {
      if (tx.status !== 'CONFIRMED' && tx.status !== 'MANUAL') continue;

      if (tx.direction === 'RECEIVED' && tx.is_reimbursement) {
        reimbursements += parseFloat(tx.amount || '0') || 0;
      } else if (tx.direction === 'SENT') {
        const total = parseFloat(tx.amount || '0') || 0;
        const paidForOther = parseFloat(tx.amount_paid_for_someone_else || '0') || 0;
        grossSent += total;
        paidForOthers += paidForOther;
      }
    }

    const netOutgoing = Math.max(0, grossSent - paidForOthers);
    const personalNetSpending = Math.round((netOutgoing - reimbursements) * 100) / 100;

    return {
      personalNetSpending,
      grossSent: Math.round(grossSent * 100) / 100,
      paidForOthers: Math.round(paidForOthers * 100) / 100,
      reimbursements: Math.round(reimbursements * 100) / 100,
      count: transactions.length,
    };
  }, [transactions]);

  // Group transactions by Date
  const dateGroups = useMemo<DateGroup[]>(() => {
    if (!transactions || transactions.length === 0) return [];

    const map = new Map<string, DateGroup>();

    for (const tx of transactions) {
      const date = tx.timestamp ? new Date(tx.timestamp) : new Date();
      const dateKey = !isNaN(date.getTime())
        ? tx.timestamp.split('T')[0] || tx.timestamp.slice(0, 10)
        : 'unknown';

      let dateLabel = dateKey;
      if (!isNaN(date.getTime())) {
        const day = date.getDate();
        const monthName = MONTH_NAMES[date.getMonth()] || '';
        const year = date.getFullYear();
        dateLabel = `${day} ${monthName} ${year}`;
      }

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateKey,
          dateLabel,
          transactions: [],
          dayNetSpending: 0,
        });
      }

      map.get(dateKey)!.transactions.push(tx);
    }

    // Sort dates descending (newest date first)
    const sorted = Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    // Sort transactions within each date group and compute day spending
    for (const group of sorted) {
      group.transactions.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      let dayNet = 0;
      for (const tx of group.transactions) {
        if (tx.status !== 'CONFIRMED' && tx.status !== 'MANUAL') continue;
        if (tx.direction === 'RECEIVED' && tx.is_reimbursement) {
          dayNet -= parseFloat(tx.amount || '0') || 0;
        } else if (tx.direction === 'SENT') {
          const total = parseFloat(tx.amount || '0') || 0;
          const paidForOther = parseFloat(tx.amount_paid_for_someone_else || '0') || 0;
          dayNet += Math.max(0, total - paidForOther);
        }
      }
      group.dayNetSpending = Math.round(dayNet * 100) / 100;
    }

    return sorted;
  }, [transactions]);

  // State to track expanded date groups (default: all expanded so user immediately sees transactions)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  // Automatically expand all date groups on first load or when dateGroups change
  useEffect(() => {
    if (dateGroups.length > 0) {
      setExpandedDates(new Set(dateGroups.map((g) => g.dateKey)));
    }
  }, [dateGroups]);

  const toggleDateGroup = (dateKey: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const handleMonthChange = (newMonth: number, newYear: number) => {
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'number' ? val : parseFloat(val) || 0;
    return `₹${Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const monthName = MONTH_NAMES[selectedMonth - 1] || `Month ${selectedMonth}`;

  return (
    <ScreenContainer scrollable={false}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.7}
        >
          <ArrowLeft color={colors.text} size={20} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <View style={styles.categoryTitleRow}>
            <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
            <Text style={styles.categoryTitleText} numberOfLines={1}>
              {categoryName}
            </Text>
          </View>
          <Text style={styles.categorySubtitleText}>
            {monthName} {selectedYear}
          </Text>
        </View>

        <View style={styles.placeholderRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        {/* Month Selector for navigating months while preserving selected category */}
        <MonthSelector
          month={selectedMonth}
          year={selectedYear}
          onMonthChange={handleMonthChange}
        />

        {/* Spending Summary Card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryHeaderLeft}>
              <View style={[styles.summaryIconBox, { backgroundColor: `${categoryColor}22` }]}>
                <TrendingDown size={16} color={categoryColor} />
              </View>
              <View>
                <Text style={styles.summaryLabel}>Category Net Spending</Text>
                <Text style={styles.summaryPeriod}>
                  {monthName} {selectedYear}
                </Text>
              </View>
            </View>

            <View style={styles.txCountBadge}>
              <Text style={styles.txCountBadgeText}>
                {spendingSummary.count} {spendingSummary.count === 1 ? 'record' : 'records'}
              </Text>
            </View>
          </View>

          {/* Main Net Amount */}
          <View style={styles.amountContainer}>
            <Text style={styles.heroAmount}>
              {formatCurrency(spendingSummary.personalNetSpending)}
            </Text>
            {spendingSummary.reimbursements > 0 && (
              <View style={styles.reimbOffsetRow}>
                <ArrowDownLeft size={12} color={colors.success} />
                <Text style={styles.reimbOffsetText}>
                  Offset by {formatCurrency(spendingSummary.reimbursements)} in reimbursements
                </Text>
              </View>
            )}
          </View>

          {/* If budget limit is configured for this category */}
          {budgetStatus && (
            <View style={styles.budgetAllocationSection}>
              <View style={styles.budgetAllocationHeader}>
                <View style={styles.budgetAllocationLeft}>
                  <Wallet size={13} color={colors.textSecondary} />
                  <Text style={styles.budgetAllocationTitle}>Monthly Budget</Text>
                </View>
                <Text
                  style={[
                    styles.budgetAllocationStatus,
                    budgetStatus.is_over_budget ? styles.textDanger : styles.textSuccess,
                  ]}
                >
                  {budgetStatus.is_over_budget
                    ? `Over budget by ${formatCurrency(Math.abs(parseFloat(budgetStatus.remaining_amount)))}`
                    : `${formatCurrency(budgetStatus.remaining_amount)} remaining`}
                </Text>
              </View>

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(100, Math.max(0, budgetStatus.percentage_used || 0))}%`,
                      backgroundColor: budgetStatus.is_over_budget ? colors.danger : categoryColor,
                    },
                  ]}
                />
              </View>

              <View style={styles.budgetLimitsRow}>
                <Text style={styles.budgetLimitText}>
                  Limit: {formatCurrency(budgetStatus.amount_limit)}
                </Text>
                <Text style={styles.budgetLimitText}>
                  {budgetStatus.percentage_used?.toFixed(1)}% Used
                </Text>
              </View>
            </View>
          )}
        </Card>

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transactions by Date</Text>
          <Text style={styles.sectionSubtitle}>
            {dateGroups.length} {dateGroups.length === 1 ? 'date group' : 'date groups'}
          </Text>
        </View>

        {/* Transactions List / Loading / Empty State */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <LoadingSpinner size="large" label="Loading transactions..." />
          </View>
        ) : error ? (
          <EmptyState
            icon={<ReceiptText color={colors.danger} size={44} />}
            title="Failed to Load"
            description={error.message || 'Unable to load category transactions.'}
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        ) : dateGroups.length === 0 ? (
          /* Concise Empty State */
          <EmptyState
            icon={<ReceiptText color={colors.textMuted} size={44} />}
            title="No Transactions"
            description={`No transactions recorded for ${categoryName} in ${monthName} ${selectedYear}.`}
          />
        ) : (
          /* Collapsible Date Groups */
          dateGroups.map((group) => {
            const isExpanded = expandedDates.has(group.dateKey);

            return (
              <View key={`date-group-${group.dateKey}`} style={styles.dateGroupContainer}>
                {/* Collapsible Date Header */}
                <TouchableOpacity
                  style={styles.dateGroupHeader}
                  onPress={() => toggleDateGroup(group.dateKey)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${group.dateLabel}, ${group.transactions.length} transactions, ${
                    isExpanded ? 'expanded' : 'collapsed'
                  }`}
                >
                  <View style={styles.dateHeaderLeft}>
                    <Calendar size={14} color={colors.textSecondary} />
                    <Text style={styles.dateHeaderTitle}>{group.dateLabel}</Text>
                    <View style={styles.dateCountBadge}>
                      <Text style={styles.dateCountBadgeText}>
                        {group.transactions.length}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dateHeaderRight}>
                    <Text style={styles.dayTotalText}>
                      {formatCurrency(group.dayNetSpending)}
                    </Text>
                    {isExpanded ? (
                      <ChevronUp size={16} color={colors.textSecondary} />
                    ) : (
                      <ChevronDown size={16} color={colors.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Collapsible Items */}
                {isExpanded && (
                  <View style={styles.dateGroupItems}>
                    {group.transactions.map((tx) => (
                      <TransactionCard
                        key={`tx-${tx.id}`}
                        transaction={tx}
                        isSelectionMode={false}
                        isSelected={false}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryTitleText: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  categorySubtitleText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 1,
  },
  placeholderRight: {
    width: 36,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  summaryPeriod: {
    color: colors.textMuted,
    fontSize: 11,
  },
  txCountBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  txCountBadgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: fontWeights.medium,
  },
  amountContainer: {
    marginVertical: spacing.xs,
  },
  heroAmount: {
    color: colors.text,
    fontSize: 28,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  reimbOffsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  reimbOffsetText: {
    color: colors.success,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  budgetAllocationSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  budgetAllocationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  budgetAllocationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  budgetAllocationTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  budgetAllocationStatus: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  budgetLimitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  budgetLimitText: {
    color: colors.textMuted,
    fontSize: 10,
  },
  textDanger: {
    color: colors.danger,
  },
  textSuccess: {
    color: colors.success,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  centerContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateGroupContainer: {
    marginBottom: spacing.sm,
  },
  dateGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    marginBottom: 4,
  },
  dateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateHeaderTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  dateCountBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.full,
  },
  dateCountBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: fontWeights.bold,
  },
  dateHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayTotalText: {
    color: colors.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
  dateGroupItems: {
    paddingTop: 2,
  },
});
