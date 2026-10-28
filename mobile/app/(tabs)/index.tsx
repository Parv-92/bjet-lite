/**
 * Bjet Lite - Primary Financial Overview Screen (Merged Budgets & Overview)
 *
 * Route: /(tabs)
 *
 * Requirements (Phase One):
 * - Displays previous completed month's financial summary by default.
 * - Displays previous completed month's category-wise budget and spending breakdown.
 * - Reliable calendar calculation (Jan -> Dec of previous year).
 * - Honest, data-backed display without fake zeros or fabricated metrics.
 * - Removed: Pending Confirmations section.
 * - Removed: Recent Transactions section (available in Transactions tab).
 * - Full budget management preserved (Add budget, Presets, Edit budget).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Sparkles,
  Wallet,
  Plus,
  BookmarkCheck,
  X,
  Check,
  ArrowRight,
  PieChart as PieChartIcon,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { MonthSelector } from '../../src/components/budgets/MonthSelector';
import { PreviousMonthOverviewCard } from '../../src/components/dashboard/PreviousMonthOverviewCard';
import { SpendingPieChartCard } from '../../src/components/budgets/SpendingPieChartCard';
import { CategoryBudgetCard } from '../../src/components/budgets/CategoryBudgetCard';
import { BudgetEmptyState } from '../../src/components/budgets/BudgetEmptyState';
import { useAuth } from '../../src/hooks/useAuth';
import { useBudgetSummary, useMonthlyFinancialSummary } from '../../src/hooks/useBudgets';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgetPresets, useApplyBudgetPreset } from '../../src/hooks/useBudgetPresets';
import { getApiErrorMessage } from '../../src/api/client';
import { BudgetSummary, BudgetPreset } from '../../src/types/api';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

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

export default function OverviewScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const now = new Date();
  const currentCalendarMonth = now.getMonth() + 1;
  const currentCalendarYear = now.getFullYear();

  // Authoritative previous completed calendar month
  // If January (1), previous month is December (12) of previous year
  const prevCompletedMonth = currentCalendarMonth === 1 ? 12 : currentCalendarMonth - 1;
  const prevCompletedYear = currentCalendarMonth === 1 ? currentCalendarYear - 1 : currentCalendarYear;

  // Defaults to previous completed month
  const [selectedMonth, setSelectedMonth] = useState(prevCompletedMonth);
  const [selectedYear, setSelectedYear] = useState(prevCompletedYear);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<number | null>(null);

  // Queries for the selected month
  const {
    data: summary,
    isLoading: isLoadingSummary,
    isRefetching: isRefetchingSummary,
    isError: isErrorSummary,
    error: summaryError,
    refetch: refetchSummary,
  } = useMonthlyFinancialSummary(selectedMonth, selectedYear);

  const {
    data: budgets,
    isLoading: isLoadingBudgets,
    isRefetching: isRefetchingBudgets,
    isError: isErrorBudgets,
    error: budgetsError,
    refetch: refetchBudgets,
  } = useBudgetSummary(selectedMonth, selectedYear);

  const { data: categories } = useCategories();
  const { data: presets, isLoading: isLoadingPresets } = useBudgetPresets({
    enabled: showPresetModal,
  });
  const applyPresetMutation = useApplyBudgetPreset();

  const isPreviousCompleted =
    selectedMonth === prevCompletedMonth && selectedYear === prevCompletedYear;
  const monthName = MONTH_NAMES[selectedMonth - 1] || `Month ${selectedMonth}`;
  const displayName = user?.full_name?.trim() || 'User';

  const handleRefresh = async () => {
    await Promise.all([
      refetchSummary(),
      refetchBudgets(),
      queryClient.invalidateQueries({
        queryKey: ['budgets', 'spending-breakdown', selectedMonth, selectedYear],
      }),
    ]);
  };

  const handleMonthChange = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  const handleJumpToPrevMonth = () => {
    setSelectedMonth(prevCompletedMonth);
    setSelectedYear(prevCompletedYear);
  };

  const handleAddBudget = () => {
    router.push({
      pathname: '/budget/create' as any,
      params: { month: selectedMonth, year: selectedYear },
    });
  };

  const handleEditBudget = (item: BudgetSummary) => {
    router.push({
      pathname: `/budget/edit/${item.category_id}` as any,
      params: { month: selectedMonth, year: selectedYear },
    });
  };

  const handleApplyPreset = (preset: BudgetPreset) => {
    Alert.alert(
      'Apply Preset',
      `Apply preset "${preset.name}" to ${monthName} ${selectedYear}? Any existing category limits for this month will be updated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            try {
              setApplyingPresetId(preset.id);
              await applyPresetMutation.mutateAsync({
                id: preset.id,
                data: {
                  month: selectedMonth,
                  year: selectedYear,
                },
              });
              setShowPresetModal(false);
              Alert.alert(
                'Success',
                `Preset "${preset.name}" applied successfully to ${monthName} ${selectedYear}!`
              );
            } catch (err) {
              Alert.alert('Error', getApiErrorMessage(err));
            } finally {
              setApplyingPresetId(null);
            }
          },
        },
      ]
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  const isLoading = isLoadingSummary || isLoadingBudgets;
  const isRefetching = isRefetchingSummary || isRefetchingBudgets;

  if (isLoading && !isRefetching) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading financial overview..." />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      scrollable
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={handleRefresh}
          tintColor={colors.brand}
          colors={[colors.brand]}
          progressBackgroundColor={colors.surfaceElevated}
        />
      }
    >
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandRow}>
            <Sparkles color={colors.brand} size={14} />
            <Text style={styles.brandTag}>BJET LITE</Text>
          </View>
          <Text style={styles.welcomeTitle} numberOfLines={1}>
            Hello, {displayName}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.presetsButton}
            onPress={() => setShowPresetModal(true)}
            accessibilityLabel="Apply budget preset"
            activeOpacity={0.8}
          >
            <BookmarkCheck color="#F59E0B" size={15} />
            <Text style={styles.presetsButtonText}>Presets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddBudget}
            accessibilityLabel="Add category budget"
            activeOpacity={0.8}
          >
            <Plus color={colors.background} size={15} />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
            accessibilityLabel="Settings"
            activeOpacity={0.8}
          >
            <SettingsIcon color={colors.textSecondary} size={16} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month Selector */}
      <MonthSelector
        month={selectedMonth}
        year={selectedYear}
        onMonthChange={handleMonthChange}
      />

      {/* Quick Jump to Previous Completed Month if viewing another month */}
      {!isPreviousCompleted && (
        <TouchableOpacity
          style={styles.jumpBanner}
          onPress={handleJumpToPrevMonth}
          activeOpacity={0.8}
        >
          <Text style={styles.jumpBannerText}>
            Jump to Previous Completed Month ({MONTH_NAMES[prevCompletedMonth - 1]} {prevCompletedYear})
          </Text>
          <ArrowRight size={13} color={colors.brandLight} />
        </TouchableOpacity>
      )}

      {/* Error State Banner if query fails */}
      {(isErrorSummary || isErrorBudgets) && (
        <ErrorMessage
          message={
            getApiErrorMessage(summaryError || budgetsError) ||
            'Failed to load complete financial data.'
          }
          onRetry={handleRefresh}
          style={styles.errorBox}
        />
      )}

      {/* Primary Financial Overview Card (Authoritative Previous Month / Selected Period) */}
      {summary && (
        <PreviousMonthOverviewCard
          summary={summary}
          monthName={monthName}
          year={selectedYear}
          isPreviousCompletedMonth={isPreviousCompleted}
        />
      )}

      {/* Category Spending Breakdown Donut Chart */}
      <SpendingPieChartCard month={selectedMonth} year={selectedYear} />

      {/* Category Budgets List */}
      <View style={styles.budgetsSection}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Category Budgets</Text>
            <Text style={styles.sectionSubtitle}>
              {budgets && budgets.length > 0
                ? `${budgets.length} budget limit${budgets.length > 1 ? 's' : ''} configured`
                : 'No budget limits configured'}
            </Text>
          </View>
        </View>

        {!budgets || budgets.length === 0 ? (
          <BudgetEmptyState
            monthName={monthName}
            year={selectedYear}
            onAddBudget={handleAddBudget}
            noCategories={!categories || categories.length === 0}
          />
        ) : (
          budgets.map((item) => (
            <CategoryBudgetCard
              key={`cat-budget-${item.id}`}
              item={item}
              onEdit={handleEditBudget}
              onPress={() => {
                router.push({
                  pathname: '/category-transactions' as any,
                  params: {
                    categoryId: String(item.category_id),
                    categoryName: item.category?.name || `Category #${item.category_id}`,
                    categoryColor: item.category?.color || colors.brand,
                    month: String(selectedMonth),
                    year: String(selectedYear),
                  },
                });
              }}
            />
          ))
        )}
      </View>

      {/* Presets Modal */}
      <Modal
        visible={showPresetModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPresetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <BookmarkCheck color="#F59E0B" size={18} />
                <Text style={styles.modalTitle}>Apply Budget Preset</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPresetModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Apply configured template limits to{' '}
              <Text style={styles.modalHighlight}>
                {monthName} {selectedYear}
              </Text>
              .
            </Text>

            {isLoadingPresets ? (
              <View style={styles.modalLoading}>
                <LoadingSpinner size="small" label="Loading presets..." />
              </View>
            ) : !presets || presets.length === 0 ? (
              <View style={styles.modalEmpty}>
                <Text style={styles.modalEmptyText}>
                  No presets available. Create presets in Settings → Budget Presets.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.presetList}
                showsVerticalScrollIndicator={false}
              >
                {presets.map((preset) => (
                  <TouchableOpacity
                    key={`preset-${preset.id}`}
                    style={styles.presetRow}
                    onPress={() => handleApplyPreset(preset)}
                    disabled={applyingPresetId !== null}
                    activeOpacity={0.7}
                  >
                    <View style={styles.presetLeft}>
                      <Text style={styles.presetName}>{preset.name}</Text>
                      <Text style={styles.presetDescription}>
                        {preset.items?.length || 0} category limits configured
                      </Text>
                    </View>
                    <View style={styles.applyAction}>
                      <Text style={styles.applyActionText}>Apply</Text>
                      <ArrowRight size={13} color={colors.brandLight} />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerLeft: {
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
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  presetsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  presetsButtonText: {
    color: '#F59E0B',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radii.sm,
  },
  addButtonText: {
    color: colors.background,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  settingsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jumpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  jumpBannerText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  errorBox: {
    marginBottom: spacing.lg,
  },
  budgetsSection: {
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
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
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginBottom: spacing.md,
  },
  modalHighlight: {
    color: colors.brandLight,
    fontWeight: fontWeights.semibold,
  },
  modalLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  modalEmpty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  modalEmptyText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  presetList: {
    maxHeight: 280,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderMuted,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  presetLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  presetName: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  presetDescription: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  applyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  applyActionText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
});
