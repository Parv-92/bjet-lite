/**
 * Bjet Mobile - Budgets Overview Screen (Phase 8)
 *
 * Route: /(tabs)/budgets
 *
 * Full budget management screen featuring:
 * - Monthly navigation with boundary checking
 * - Overall monthly spending vs limit aggregate card
 * - Category spending progress list with over-budget alerts
 * - Pull-to-refresh and TanStack Query caching
 * - Fast navigation to Add and Edit budget flows
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Wallet, BookmarkCheck, X, Check, ArrowRight } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { MonthSelector } from '../../src/components/budgets/MonthSelector';
import { BudgetSummaryCard } from '../../src/components/budgets/BudgetSummaryCard';
import { SpendingPieChartCard } from '../../src/components/budgets/SpendingPieChartCard';
import { CategoryBudgetCard } from '../../src/components/budgets/CategoryBudgetCard';
import { BudgetEmptyState } from '../../src/components/budgets/BudgetEmptyState';
import { useBudgetSummary } from '../../src/hooks/useBudgets';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgetPresets, useApplyBudgetPreset } from '../../src/hooks/useBudgetPresets';
import { useAuth } from '../../src/hooks/useAuth';
import { getApiErrorMessage } from '../../src/api/client';
import { BudgetSummary, BudgetPreset } from '../../src/types/api';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../src/utils/perfDiagnostic';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function BudgetsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<number | null>(null);

  const {
    data: budgets,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = useBudgetSummary(selectedMonth, selectedYear);

  const { data: categories } = useCategories();
  const { data: presets, isLoading: isLoadingPresets } = useBudgetPresets({ enabled: showPresetModal });
  const applyPresetMutation = useApplyBudgetPreset();

  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({
        queryKey: ['budgets', 'spending-breakdown', selectedMonth, selectedYear],
      }),
    ]);
  };

  // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
  useRenderDiagnostic('BudgetsScreen', {
    selectedMonth,
    selectedYear,
    isLoading,
    isRefetching,
    budgetCount: budgets?.length ?? 0,
  });

  // Compute aggregate metrics from authoritative backend summary records
  const {
    totalLimit,
    totalSpent,
    totalRemaining,
    utilizationPercentage,
    overBudgetCount,
  } = useMemo(() => {
    if (!budgets || budgets.length === 0) {
      return {
        totalLimit: 0,
        totalSpent: 0,
        totalRemaining: 0,
        utilizationPercentage: 0,
        overBudgetCount: 0,
      };
    }

    let limit = 0;
    let spent = 0;
    let overCount = 0;

    for (const b of budgets) {
      const bLimit = parseFloat(b.amount_limit) || 0;
      const bSpent = parseFloat(b.spent_amount) || 0;
      limit += bLimit;
      spent += bSpent;
      if (b.is_over_budget || bSpent > bLimit) {
        overCount++;
      }
    }

    const remaining = limit - spent;
    const utilization = limit > 0 ? (spent / limit) * 100 : 0;

    return {
      totalLimit: limit,
      totalSpent: spent,
      totalRemaining: remaining,
      utilizationPercentage: utilization,
      overBudgetCount: overCount,
    };
  }, [budgets]);

  const handleMonthChange = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
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

  const monthName = MONTH_NAMES[selectedMonth - 1] || `Month ${selectedMonth}`;

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
              Alert.alert('Success', `Preset "${preset.name}" applied successfully to ${monthName} ${selectedYear}!`);
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

  if (isLoading && !isRefetching) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading budgets..." />
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
        <View style={styles.headerTitles}>
          <View style={styles.brandRow}>
            <Wallet color={colors.brandLight} size={16} />
            <Text style={styles.brandTag}>BUDGET MANAGER</Text>
          </View>
          <Text style={styles.title}>Monthly Budgets</Text>
          <Text style={styles.subtitle}>
            Manage category limits and track expenditure
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
        </View>
      </View>

      {/* Month Selector Bar */}
      <MonthSelector
        month={selectedMonth}
        year={selectedYear}
        onMonthChange={handleMonthChange}
      />

      {/* Error State Banner */}
      {isError && (
        <ErrorMessage
          message={error ? getApiErrorMessage(error) : 'Failed to load budgets. Please try again.'}
          onRetry={refetch}
          style={styles.errorBox}
        />
      )}

      {/* Only render summary card and category budgets if not in error or if data exists */}
      {(!isError || (budgets && budgets.length > 0)) && (
        <>
          {/* Overall Summary Card */}
          <BudgetSummaryCard
            totalLimit={totalLimit}
            totalSpent={totalSpent}
            totalRemaining={totalRemaining}
            utilizationPercentage={utilizationPercentage}
            overBudgetCount={overBudgetCount}
            budgetCount={budgets ? budgets.length : 0}
          />

          {/* Monthly Spending Breakdown Pie / Donut Chart */}
          <SpendingPieChartCard
            month={selectedMonth}
            year={selectedYear}
          />

          {/* Category Budgets Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Category Budgets</Text>
            {budgets && budgets.length > 0 && (
              <Text style={styles.sectionCount}>
                {budgets.length} {budgets.length === 1 ? 'category' : 'categories'}
              </Text>
            )}
          </View>

          {/* Category Budget List or Empty State */}
          {!budgets || budgets.length === 0 ? (
            <BudgetEmptyState
              monthName={monthName}
              year={selectedYear}
              onAddBudget={handleAddBudget}
              noCategories={categories !== undefined && categories.length === 0}
            />
          ) : (
            <View style={styles.categoryList}>
              {budgets.map((item) => (
                <CategoryBudgetCard
                  key={item.id}
                  item={item}
                  onEdit={handleEditBudget}
                />
              ))}
            </View>
          )}
        </>
      )}

      {/* Apply Preset Modal */}
      <Modal
        visible={showPresetModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPresetModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.presetModalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <BookmarkCheck size={20} color="#F59E0B" />
                <Text style={styles.modalTitle}>Apply Budget Preset</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPresetModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.presetModalSubtitle}>
              Target: <Text style={styles.targetMonthHighlight}>{monthName} {selectedYear}</Text>
            </Text>

            {isLoadingPresets ? (
              <View style={styles.modalLoading}>
                <LoadingSpinner size="small" label="Loading presets..." />
              </View>
            ) : !presets || presets.length === 0 ? (
              <View style={styles.noPresetsBox}>
                <Text style={styles.noPresetsText}>No budget presets created yet.</Text>
                <TouchableOpacity
                  style={styles.createPresetButton}
                  onPress={() => {
                    setShowPresetModal(false);
                    router.push('/budget-presets');
                  }}
                >
                  <Plus size={16} color={colors.background} />
                  <Text style={styles.createPresetButtonText}>Create a Preset</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.presetsListScroll} showsVerticalScrollIndicator={false}>
                {presets.map((preset) => {
                  const total = preset.items.reduce(
                    (sum, it) => sum + parseFloat(it.amount || '0'),
                    0
                  );
                  const isApplying = applyingPresetId === preset.id;

                  return (
                    <View key={preset.id} style={styles.presetRowItem}>
                      <View style={styles.presetRowInfo}>
                        <Text style={styles.presetRowName}>{preset.name}</Text>
                        <Text style={styles.presetRowMeta}>
                          {preset.items.length} {preset.items.length === 1 ? 'category' : 'categories'} · Total ₹{total.toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.applyPresetBtn, isApplying && styles.applyPresetBtnDisabled]}
                        disabled={isApplying || applyingPresetId !== null}
                        onPress={() => handleApplyPreset(preset)}
                      >
                        <Text style={styles.applyPresetBtnText}>
                          {isApplying ? 'Applying...' : 'Apply'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.managePresetsLink}
              onPress={() => {
                setShowPresetModal(false);
                router.push('/budget-presets');
              }}
            >
              <Text style={styles.managePresetsLinkText}>Manage all presets</Text>
              <ArrowRight size={14} color={colors.brandLight} />
            </TouchableOpacity>
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
    alignItems: 'flex-start',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerTitles: {
    flex: 1,
    marginRight: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  brandTag: {
    color: colors.brandLight,
    fontSize: 10,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  presetsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
  },
  presetsButtonText: {
    color: '#F59E0B',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semiBold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
  },
  addButtonText: {
    color: colors.background,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  errorBox: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  sectionCount: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  categoryList: {
    marginBottom: spacing.xxl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  presetModalContainer: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modalTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  presetModalSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginBottom: spacing.md,
  },
  targetMonthHighlight: {
    color: colors.brandLight,
    fontWeight: fontWeights.bold,
  },
  modalLoading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  noPresetsBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  noPresetsText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  createPresetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  createPresetButtonText: {
    color: colors.background,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semiBold,
  },
  presetsListScroll: {
    maxHeight: 280,
    marginBottom: spacing.md,
  },
  presetRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  presetRowInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  presetRowName: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semiBold,
  },
  presetRowMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  applyPresetBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
  },
  applyPresetBtnDisabled: {
    opacity: 0.5,
  },
  applyPresetBtnText: {
    color: '#F59E0B',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  managePresetsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  managePresetsLinkText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
});
