/**
 * Bjet Mobile - Main Dashboard / Home Screen
 * Displays user overview, monthly budget progress, pending receipts,
 * and newest-first recent transactions using TanStack Query.
 */
import React from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Sparkles, PieChart } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { MetricSummaryCard } from '../../src/components/dashboard/MetricSummaryCard';
import { CategoryBudgetRow } from '../../src/components/dashboard/CategoryBudgetRow';
import { PendingConfirmationsSection } from '../../src/components/dashboard/PendingConfirmationsSection';
import { RecentTransactionsSection } from '../../src/components/dashboard/RecentTransactionsSection';
import { useAuth } from '../../src/hooks/useAuth';
import { useDashboard } from '../../src/hooks/useDashboard';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../src/utils/perfDiagnostic';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function HomeScreen() {
  const { user, isAuthenticated } = useAuth();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const {
    budgetSummary,
    recentTransactions,
    pendingTransactions,
    metrics,
    isLoading,
    isRefetching,
    isError,
    errorMessage,
    refetchAll,
  } = useDashboard(currentMonth, currentYear);

  // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
  useRenderDiagnostic('DashboardScreen', {
    isLoading,
    isRefetching,
    isError,
    budgetCount: budgetSummary.length,
    recentCount: recentTransactions.length,
  });

  const monthName = MONTH_NAMES[currentMonth - 1];

  // User display name
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'User';

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading && !isRefetching) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading your financial dashboard..." />
        </View>
      </ScreenContainer>
    );
  }

  // If there's an error and no cached/loaded data, show explicit ErrorState without fake zeros
  if (isError && !isRefetching && budgetSummary.length === 0 && recentTransactions.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <View style={styles.welcomeRow}>
            <View style={styles.greetingContainer}>
              <View style={styles.brandRow}>
                <Sparkles color={colors.brand} size={14} />
                <Text style={styles.brandTag}>BJET FINANCIAL</Text>
              </View>
              <Text style={styles.welcomeTitle} numberOfLines={1}>
                Hello, {displayName}
              </Text>
            </View>
          </View>
        </View>
        <ErrorMessage
          message={errorMessage || 'Failed to load dashboard data. Please try again.'}
          onRetry={refetchAll}
          style={styles.errorBox}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetchAll}
          tintColor={colors.brand}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surfaceElevated}
        />
      }
    >
      {/* Top Welcome Header */}
      <View style={styles.header}>
        <View style={styles.welcomeRow}>
          <View style={styles.greetingContainer}>
            <View style={styles.brandRow}>
              <Sparkles color={colors.brand} size={14} />
              <Text style={styles.brandTag}>BJET FINANCIAL</Text>
            </View>
            <Text style={styles.welcomeTitle} numberOfLines={1}>
              Hello, {displayName}
            </Text>
          </View>
        </View>
      </View>

      {/* Error state banner if query fails during refetch with existing data */}
      {isError && (
        <ErrorMessage
          message={errorMessage || 'Failed to load dashboard data. Please try again.'}
          onRetry={refetchAll}
          style={styles.errorBox}
        />
      )}

      {/* Primary Financial Overview Metric Card (only displayed when not in error or data present) */}
      {(!isError || budgetSummary.length > 0) && (
        <MetricSummaryCard
          totalSpent={metrics.totalSpent}
          totalLimit={metrics.totalLimit}
          totalRemaining={metrics.totalRemaining}
          utilizationPercentage={metrics.utilizationPercentage}
          overBudgetCount={metrics.overBudgetCount}
          monthName={monthName}
          year={currentYear}
        />
      )}

      {/* Pending Confirmations Section */}
      <PendingConfirmationsSection transactions={pendingTransactions} />

      {/* Category Budget Breakdown Overview */}
      {budgetSummary.length > 0 && (
        <View style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Budget Breakdown</Text>
            <Text style={styles.sectionSubtext}>{budgetSummary.length} categories</Text>
          </View>
          <Card style={styles.categoryCard}>
            {budgetSummary.map((item) => (
              <CategoryBudgetRow key={item.id} item={item} />
            ))}
          </Card>
        </View>
      )}

      {/* Recent Transactions List (Guaranteed newest-first) */}
      <RecentTransactionsSection transactions={recentTransactions} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingContainer: {
    flex: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  brandTag: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.2,
  },
  welcomeTitle: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  errorBox: {
    marginBottom: spacing.lg,
  },
  categorySection: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  sectionSubtext: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});
