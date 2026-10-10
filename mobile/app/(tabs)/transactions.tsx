/**
 * Bjet Mobile - Transactions Screen
 * Main transactions list with monthly grouping (SectionList),
 * selection mode, atomic bulk deletion, and status filter chips.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Plus,
  ReceiptText,
  CheckSquare,
  Trash2,
  X,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { TransactionCard } from '../../src/components/transactions/TransactionCard';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../src/components/common/EmptyState';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useBulkDeleteTransactions } from '../../src/hooks/useTransactionMutations';
import { useAuth } from '../../src/hooks/useAuth';
import { getApiErrorMessage } from '../../src/api/client';
import { TransactionListItemResponse, TransactionStatus } from '../../src/types/api';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../src/utils/perfDiagnostic';

type FilterTab = 'ALL' | 'CONFIRMED' | 'PENDING_CONFIRMATION' | 'MANUAL';

interface FilterOption {
  key: FilterTab;
  label: string;
  status?: TransactionStatus;
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CONFIRMED', label: 'Confirmed', status: 'CONFIRMED' },
  { key: 'PENDING_CONFIRMATION', label: 'Pending Review', status: 'PENDING_CONFIRMATION' },
  { key: 'MANUAL', label: 'Manual', status: 'MANUAL' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface TransactionSection {
  title: string;
  key: string;
  data: TransactionListItemResponse[];
}

export default function TransactionsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState<FilterTab>('ALL');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const bulkDeleteMutation = useBulkDeleteTransactions();

  const activeStatus = useMemo(() => {
    const opt = FILTER_OPTIONS.find((f) => f.key === selectedFilter);
    return opt?.status;
  }, [selectedFilter]);

  const {
    data: transactions,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useTransactions(activeStatus ? { status: activeStatus } : undefined);

  // Group transactions by Month + Year
  const sections = useMemo<TransactionSection[]>(() => {
    if (!transactions || transactions.length === 0) return [];

    const groupMap = new Map<string, TransactionSection>();

    for (const tx of transactions) {
      const date = tx.timestamp ? new Date(tx.timestamp) : new Date();
      const year = isNaN(date.getFullYear()) ? new Date().getFullYear() : date.getFullYear();
      const month = isNaN(date.getMonth()) ? new Date().getMonth() : date.getMonth();
      const monthName = MONTH_NAMES[month] || `Month ${month + 1}`;
      const groupKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const title = `${monthName} ${year}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, { title, key: groupKey, data: [] });
      }
      groupMap.get(groupKey)!.data.push(tx);
    }

    // Sort months descending (newest first)
    const sortedSections = Array.from(groupMap.values()).sort((a, b) => b.key.localeCompare(a.key));

    // Sort items within each month descending by date
    for (const sec of sortedSections) {
      sec.data.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
    }

    return sortedSections;
  }, [transactions]);

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
      `Are you sure you want to permanently delete ${count} selected transaction${count > 1 ? 's' : ''}? This action cannot be undone.`,
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
              Alert.alert('Deleted', `Successfully deleted ${res.deleted_count} transaction(s).`);
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
              {transactions ? `${transactions.length} transactions` : 'Track and manage your spending'}
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

      {/* Filter Chips - Read-only list filters */}
      <View style={styles.filterRow}>
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
            renderSectionHeader={({ section: { title, data } }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{data.length}</Text>
                </View>
              </View>
            )}
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
                icon={<ReceiptText color={colors.textMuted} size={48} />}
                title={
                  selectedFilter === 'ALL'
                    ? 'No Transactions Yet'
                    : `No ${FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.label} Transactions`
                }
                description={
                  selectedFilter === 'ALL'
                    ? 'Tap "+ Add" to record your first transaction.'
                    : `No transactions match the "${FILTER_OPTIONS.find((f) => f.key === selectedFilter)?.label}" filter.`
                }
                actionLabel={selectedFilter === 'ALL' ? 'Add Transaction' : undefined}
                onAction={selectedFilter === 'ALL' ? handleAddPress : undefined}
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
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: colors.brandLight,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  filterChipTextActive: {
    color: colors.brandLight,
    fontWeight: fontWeights.bold,
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
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionBadge: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderMuted,
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
