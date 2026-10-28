/**
 * Bjet Mobile - Transactions Screen
 * Main transactions list with monthly grouping (SectionList),
 * selection mode, atomic bulk deletion, and status filter chips.
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Plus,
  ReceiptText,
  CheckSquare,
  Trash2,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { TransactionCard } from '../../src/components/transactions/TransactionCard';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../src/components/common/EmptyState';
import { useTransactions, GetTransactionsParams } from '../../src/hooks/useTransactions';
import { useCategories } from '../../src/hooks/useCategories';
import { useBulkDeleteTransactions } from '../../src/hooks/useTransactionMutations';
import { useAuth } from '../../src/hooks/useAuth';
import { getApiErrorMessage } from '../../src/api/client';
import { TransactionListItemResponse, TransactionStatus } from '../../src/types/api';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../src/utils/perfDiagnostic';

type FilterTab = 'ALL' | 'MANUAL';

interface FilterOption {
  key: FilterTab;
  label: string;
  status?: TransactionStatus;
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'ALL', label: 'All' },
  { key: 'MANUAL', label: 'Manual', status: 'MANUAL' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface TransactionSection {
  title: string;
  key: string;
  netMovement: number;
  totalCount: number;
  data: TransactionListItemResponse[];
}

export default function TransactionsScreen() {
  const router = useRouter();
  const localParams = useLocalSearchParams<{
    categoryFilter?: string;
    categoryName?: string;
  }>();
  const { isAuthenticated } = useAuth();
  const { data: allCategories } = useCategories();

  const [selectedFilter, setSelectedFilter] = useState<FilterTab>('ALL');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Category filter state (Feature 2)
  const [categoryFilter, setCategoryFilter] = useState<{ id: string; name: string } | null>(null);

  // Sync category filter from route params when returning from /category-filter
  useEffect(() => {
    if (localParams.categoryFilter !== undefined) {
      if (localParams.categoryFilter === 'all' || !localParams.categoryFilter) {
        setCategoryFilter(null);
      } else {
        setCategoryFilter({
          id: localParams.categoryFilter,
          name:
            localParams.categoryName ||
            (localParams.categoryFilter === 'uncategorized'
              ? 'Uncategorized'
              : 'Category'),
        });
      }
    }
  }, [localParams.categoryFilter, localParams.categoryName]);

  const activeCategoryColor = useMemo(() => {
    if (!categoryFilter) return null;
    if (categoryFilter.id === 'uncategorized') return '#9E9E9E';
    const cat = allCategories?.find((c) => String(c.id) === categoryFilter.id);
    return cat?.color || colors.brand;
  }, [categoryFilter, allCategories]);

  const handleClearCategoryFilter = () => {
    setCategoryFilter(null);
    router.setParams({ categoryFilter: undefined, categoryName: undefined });
  };

  const handleOpenCategoryFilter = () => {
    router.push({
      pathname: '/category-filter' as any,
      params: {
        selectedCategoryFilter: categoryFilter ? categoryFilter.id : 'all',
      },
    });
  };

  const bulkDeleteMutation = useBulkDeleteTransactions();

  const activeStatus = useMemo(() => {
    const opt = FILTER_OPTIONS.find((f) => f.key === selectedFilter);
    return opt?.status;
  }, [selectedFilter]);

  // Query parameters with both status and category filtering
  const queryParams = useMemo<GetTransactionsParams | undefined>(() => {
    const p: GetTransactionsParams = {};
    if (activeStatus) {
      p.status = activeStatus;
    }
    if (categoryFilter) {
      if (categoryFilter.id === 'uncategorized') {
        p.uncategorized = true;
      } else {
        p.category_id = parseInt(categoryFilter.id, 10);
      }
    }
    return Object.keys(p).length > 0 ? p : undefined;
  }, [activeStatus, categoryFilter]);

  const {
    data: transactions,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useTransactions(queryParams);

  // Collapsible monthly groups (Feature 3):
  // All monthly groups must be collapsed by default whenever screen is opened fresh!
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Group transactions by Month + Year
  const sections = useMemo<TransactionSection[]>(() => {
    if (!transactions || transactions.length === 0) return [];

    const groupMap = new Map<string, { title: string; key: string; netMovement: number; data: TransactionListItemResponse[] }>();

    for (const tx of transactions) {
      const date = tx.timestamp ? new Date(tx.timestamp) : new Date();
      const year = isNaN(date.getFullYear()) ? new Date().getFullYear() : date.getFullYear();
      const month = isNaN(date.getMonth()) ? new Date().getMonth() : date.getMonth();
      const monthName = MONTH_NAMES[month] || `Month ${month + 1}`;
      const groupKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const title = `${monthName} ${year}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { title, key: groupKey, netMovement: 0, data: [] });
      }
      groupMap.get(groupKey)!.data.push(tx);
    }

    // Sort months descending (newest first)
    const sortedSections = Array.from(groupMap.values()).sort((a, b) => b.key.localeCompare(a.key));

    // Sort items within each month descending by date and compute authoritative monthly net movement
    for (const sec of sortedSections) {
      sec.data.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      let outgoing = 0;
      let incoming = 0;
      for (const tx of sec.data) {
        if (tx.direction === 'RECEIVED' && tx.is_reimbursement) {
          incoming += parseFloat(tx.amount || '0') || 0;
        } else if (tx.direction === 'SENT') {
          const paidForOthers = parseFloat(tx.amount_paid_for_someone_else || '0') || 0;
          const total = parseFloat(tx.amount || '0') || 0;
          outgoing += Math.max(0, total - paidForOthers);
        }
      }
      sec.netMovement = Math.round((incoming - outgoing) * 100) / 100;
    }

    // Pass data: [] for collapsed months to keep virtualization and rendering fast
    return sortedSections.map((sec) => ({
      ...sec,
      totalCount: sec.data.length,
      data: expandedMonths.has(sec.key) ? sec.data : [],
    }));
  }, [transactions, expandedMonths]);

  // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
  useRenderDiagnostic('TransactionsScreen', {
    selectedFilter,
    isLoading,
    isRefetching,
    txCount: transactions?.length ?? 0,
    hasError: !!error,
  });

  const handleAddPress = () => {
    router.push('/transaction/create' as any);
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (!transactions) return;
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  const handleExitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      'Delete Transactions',
      `Delete ${count} selected transaction${count > 1 ? 's' : ''}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
              setSelectedIds(new Set());
              setIsSelectionMode(false);
              Alert.alert('Deleted', `${res.deleted_count} transaction${res.deleted_count > 1 ? 's' : ''} deleted.`);
            } catch (err) {
              Alert.alert('Cannot Delete', getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  };


  if (!isAuthenticated) {
    return null;
  }

  return (
    <ScreenContainer scrollable={false}>
      {/* Header with Title and Actions */}
      {!isSelectionMode ? (
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Transactions</Text>
            <Text style={styles.subtitle}>
              {transactions ? `${transactions.length} transactions` : 'No transactions recorded'}
            </Text>
          </View>
          <View style={styles.headerRightActions}>

            {transactions && transactions.length > 0 && (
              <TouchableOpacity
                style={styles.selectModeButton}
                onPress={() => setIsSelectionMode(true)}
                activeOpacity={0.8}
                accessibilityLabel="Enter selection mode"
              >
                <CheckSquare color={colors.textSecondary} size={16} />
                <Text style={styles.selectModeButtonText}>Select</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddPress}
              activeOpacity={0.8}
            >
              <Plus color={colors.background} size={16} strokeWidth={2.5} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open settings"
            >
              <SettingsIcon color={colors.textSecondary} size={18} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Selection Mode Action Bar */
        <View style={styles.selectionBar}>
          <TouchableOpacity
            style={styles.cancelSelectionBtn}
            onPress={handleExitSelectionMode}
            activeOpacity={0.7}
          >
            <X size={18} color={colors.textSecondary} />
            <Text style={styles.cancelSelectionText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.selectedCountText}>
            {selectedIds.size} Selected
          </Text>

          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={handleSelectAllToggle}
            activeOpacity={0.7}
          >
            <Text style={styles.selectAllText}>
              {transactions && selectedIds.size === transactions.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Row: Status Chips + Category Filter */}
      <View style={styles.filterRow}>
        <View style={styles.statusChipsContainer}>
          {FILTER_OPTIONS.map((filter) => {
            const isActive = selectedFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setSelectedFilter(filter.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Category Filter Button / Active Filter Pill */}
        {!categoryFilter ? (
          <TouchableOpacity
            style={styles.categoryFilterButton}
            onPress={handleOpenCategoryFilter}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Filter by category"
          >
            <Filter size={12} color={colors.textSecondary} />
            <Text style={styles.categoryFilterButtonText}>Category</Text>
            <ChevronDown size={12} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <View style={styles.activeCategoryPill}>
            <TouchableOpacity
              style={styles.activeCategoryPillTouch}
              onPress={handleOpenCategoryFilter}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Category filter: ${categoryFilter.name}`}
            >
              <View
                style={[
                  styles.activeCategoryDot,
                  { backgroundColor: activeCategoryColor || colors.brand },
                ]}
              />
              <Text style={styles.activeCategoryPillText} numberOfLines={1}>
                {categoryFilter.name}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.clearCategoryButton}
              onPress={handleClearCategoryFilter}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear category filter"
            >
              <X size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Transaction List / Loading / Empty State */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading transactions..." />
        </View>
      ) : error ? (
        <EmptyState
          icon={<ReceiptText color={colors.danger} size={48} />}
          title="Failed to Load"
          description={error.message || 'Unable to load transactions.'}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <View style={styles.listWrapper}>
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TransactionCard
                transaction={item}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={handleToggleSelect}
              />
            )}
            renderSectionHeader={({ section }) => {
              const isExpanded = expandedMonths.has(section.key);
              const isNetNegative = section.netMovement < 0;
              const isNetPositive = section.netMovement > 0;
              const absMovement = Math.abs(section.netMovement);
              const formattedMovement = `₹${absMovement.toLocaleString('en-IN', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`;

              return (
                <TouchableOpacity
                  style={styles.sectionHeader}
                  onPress={() => toggleMonth(section.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${section.title}, ${section.totalCount} transactions, ${
                    isExpanded ? 'expanded' : 'collapsed'
                  }`}
                >
                  <View style={styles.sectionLeft}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{section.totalCount}</Text>
                    </View>
                  </View>

                  <View style={styles.sectionRight}>
                    {/* Monthly Net Movement Badge with explicit +/- and direction icon */}
                    <View
                      style={[
                        styles.movementBadge,
                        isNetNegative
                          ? styles.movementBadgeNegative
                          : isNetPositive
                          ? styles.movementBadgePositive
                          : styles.movementBadgeNeutral,
                      ]}
                    >
                      {isNetNegative ? (
                        <ArrowUpRight size={12} color={colors.danger} />
                      ) : isNetPositive ? (
                        <ArrowDownLeft size={12} color={colors.success} />
                      ) : null}
                      <Text
                        style={[
                          styles.movementText,
                          isNetNegative
                            ? styles.movementTextNegative
                            : isNetPositive
                            ? styles.movementTextPositive
                            : styles.movementTextNeutral,
                        ]}
                      >
                        {isNetNegative
                          ? `−${formattedMovement}`
                          : isNetPositive
                          ? `+${formattedMovement}`
                          : '₹0'}
                      </Text>
                    </View>

                    {/* Collapsible Dropdown Arrow */}
                    <View style={styles.sectionChevronBox}>
                      {isExpanded ? (
                        <ChevronUp size={15} color={colors.textSecondary} />
                      ) : (
                        <ChevronDown size={15} color={colors.textSecondary} />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              isSelectionMode && styles.listContentWithActionBar,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.brandLight}
                colors={[colors.brandLight]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon={<ReceiptText color={colors.textMuted} size={40} />}
                title={
                  categoryFilter
                    ? 'No matching transactions'
                    : selectedFilter === 'ALL'
                    ? 'No transactions'
                    : `No ${FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.label.toLowerCase()} transactions`
                }
                description={
                  categoryFilter
                    ? `No transactions in ${categoryFilter.name}.`
                    : selectedFilter === 'ALL'
                    ? 'Record transactions manually or import a monthly UPI statement.'
                    : `No transactions match the ${FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.label.toLowerCase()} filter.`
                }
                actionLabel={
                  categoryFilter
                    ? 'Clear category filter'
                    : selectedFilter === 'ALL'
                    ? 'Add transaction'
                    : undefined
                }
                onAction={
                  categoryFilter
                    ? handleClearCategoryFilter
                    : selectedFilter === 'ALL'
                    ? handleAddPress
                    : undefined
                }
              />
            }

          />

          {/* Bottom Floating Bulk Action Bar */}
          {isSelectionMode && (
            <View style={styles.bulkActionBar}>
              <TouchableOpacity
                style={[
                  styles.deleteSelectedBtn,
                  selectedIds.size === 0 && styles.deleteSelectedBtnDisabled,
                ]}
                disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
                onPress={handleDeleteSelected}
                activeOpacity={0.8}
              >
                {bulkDeleteMutation.isPending ? (
                  <LoadingSpinner size="small" />
                ) : (
                  <>
                    <Trash2 size={18} color={colors.text} />
                    <Text style={styles.deleteSelectedBtnText}>
                      Delete Selected ({selectedIds.size})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  selectModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  selectModeButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semiBold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    gap: 4,
  },
  addButtonText: {
    color: colors.background,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  settingsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    width: 36,
    height: 36,
    borderRadius: radii.md,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  cancelSelectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cancelSelectionText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  selectedCountText: {
    color: colors.brandLight,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  selectAllBtn: {
    paddingVertical: 2,
  },
  selectAllText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semiBold,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statusChipsContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  categoryFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryFilterButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  activeCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.brandLight,
    borderRadius: radii.sm,
    paddingLeft: spacing.sm + 2,
    paddingRight: 6,
    paddingVertical: 3,
    maxWidth: 160,
  },
  activeCategoryPillTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  activeCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeCategoryPillText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    flexShrink: 1,
  },
  clearCategoryButton: {
    marginLeft: 4,
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.brandLight,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  filterChipTextActive: {
    color: colors.brandLight,
    fontWeight: fontWeights.semibold,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  listContentWithActionBar: {
    paddingBottom: 90,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  sectionChevronBox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  sectionBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  movementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.xs,
    borderWidth: 1,
  },
  movementBadgeNegative: {
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
    borderColor: 'rgba(244, 63, 94, 0.25)',
  },
  movementBadgePositive: {
    backgroundColor: 'rgba(20, 184, 166, 0.08)',
    borderColor: 'rgba(20, 184, 166, 0.25)',
  },
  movementBadgeNeutral: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderMuted,
  },
  movementText: {
    fontSize: 11,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
  movementTextNegative: {
    color: colors.danger,
  },
  movementTextPositive: {
    color: colors.brandLight,
  },
  movementTextNeutral: {
    color: colors.textMuted,
  },

  sectionBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: fontWeights.medium,
  },
  bulkActionBar: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  deleteSelectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    minWidth: 220,
  },
  deleteSelectedBtnDisabled: {
    opacity: 0.4,
  },
  deleteSelectedBtnText: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
