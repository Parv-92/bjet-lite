/**
 * Bjet Mobile - Statement Candidate Review Screen (Phase 7)
 *
 * Route: /receipt-review/statement
 *
 * Renders parsed statement candidates (e.g. 90 transactions from 11-page GPay statement).
 *
 * SAFEGUARDS ENFORCED:
 * 1. Statement review MUST NOT present the action as "Confirm Transactions" because
 *    statement candidates are not persisted or confirmed in Phase 7.
 *    Action is strictly "Review Selection" / "Continue" with clear explanation that
 *    statement import is not yet persisted.
 * 2. Category suggestions are advisory only. Candidates remain editable and the user can
 *    change the category before any future persistence workflow.
 * 3. Statement candidates remain strictly local and MUST NOT be submitted through POST /transactions.
 * 4. Zero backend or frontend modifications.
 */

import React, { useState, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CreditCard,
  ArrowRight,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { CandidateCard } from '../../src/components/receipt/CandidateCard';
import { CandidateEditModal } from '../../src/components/receipt/CandidateEditModal';
import {
  StatementSummaryHeader,
  FilterCategory,
} from '../../src/components/receipt/StatementSummaryHeader';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { statementCandidateStore } from '../../src/services/receipt/statementCandidateStore';
import {
  statementTransactionPersistenceService,
  StatementPersistenceProgress,
  StatementPersistenceResult,
} from '../../src/services/receipt/StatementTransactionPersistenceService';
import { TransactionCandidate } from '../../src/types/receiptInterpretation';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../src/utils/perfDiagnostic';

export default function StatementReviewScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // Subscribe to reactive updates from statementCandidateStore
  const candidates = useSyncExternalStore(
    statementCandidateStore.subscribe.bind(statementCandidateStore),
    statementCandidateStore.getCandidates.bind(statementCandidateStore)
  );
  const metadata = statementCandidateStore.getMetadata();

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
  const [editingCandidate, setEditingCandidate] = useState<TransactionCandidate | null>(null);

  // Persistence workflow states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistenceProgress, setPersistenceProgress] = useState<StatementPersistenceProgress | null>(null);
  const [persistenceResult, setPersistenceResult] = useState<StatementPersistenceResult | null>(null);

  // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
  useRenderDiagnostic('StatementReviewScreen', {
    activeFilter,
    candidateCount: candidates.length,
    isEditing: !!editingCandidate,
    isPersisting,
    hasResult: !!persistenceResult,
  });

  // Block hardware back button on Android while persistence is actively executing
  useEffect(() => {
    if (!isPersisting) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Consume event, prevent back navigation
    });
    return () => backHandler.remove();
  }, [isPersisting]);

  // Persistable candidates (SENT or RECEIVED reimbursement, not excluded, amount > 0, not yet persisted)
  const persistableCandidates = useMemo(
    () => statementCandidateStore.getPersistableCandidates(),
    [candidates]
  );
  const persistableCount = persistableCandidates.length;

  const { persistableExpensesCount, persistableReimbursementsCount, persistableNetSpending } = useMemo(() => {
    let expCount = 0;
    let reimbCount = 0;
    let netSpending = 0;

    for (const c of persistableCandidates) {
      const amt = c.amount || 0;
      if (c.direction === 'RECEIVED' && c.isReimbursement) {
        reimbCount++;
        netSpending -= amt;
      } else {
        expCount++;
        netSpending += amt;
      }
    }

    return {
      persistableExpensesCount: expCount,
      persistableReimbursementsCount: reimbCount,
      persistableNetSpending: Math.max(0, netSpending),
    };
  }, [persistableCandidates]);

  // Totals and metrics
  const {
    totalSent,
    totalReceived,
    totalTopUp,
    duplicateCount,
    includedCount,
    excludedCount,
    receivedCount,
    topUpCount,
  } = useMemo(() => {
    let sent = 0;
    let received = 0;
    let topUp = 0;
    let dupes = 0;
    let inc = 0;
    let exc = 0;
    let recvCnt = 0;
    let topUpCnt = 0;

    for (const c of candidates) {
      if (c.isDuplicate || c.duplicateInfo?.isDuplicate) dupes++;
      if (c.direction === 'RECEIVED') recvCnt++;
      if (c.direction === 'TOP_UP') topUpCnt++;

      if (c.reviewStatus === 'EXCLUDED' || c.isExcluded) {
        exc++;
      } else {
        inc++;
        if (c.amount !== undefined) {
          if (c.direction === 'SENT') sent += c.amount;
          else if (c.direction === 'RECEIVED') received += c.amount;
          else if (c.direction === 'TOP_UP') topUp += c.amount;
        }
      }
    }

    return {
      totalSent: sent,
      totalReceived: received,
      totalTopUp: topUp,
      duplicateCount: dupes,
      includedCount: inc,
      excludedCount: exc,
      receivedCount: recvCnt,
      topUpCount: topUpCnt,
    };
  }, [candidates]);

  // Filtered candidate list
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      switch (activeFilter) {
        case 'SENT':
          return c.direction === 'SENT';
        case 'RECEIVED':
          return c.direction === 'RECEIVED';
        case 'TOP_UP':
          return c.direction === 'TOP_UP';
        case 'DUPLICATES':
          return c.isDuplicate || c.duplicateInfo?.isDuplicate;
        case 'ALL':
        default:
          return true;
      }
    });
  }, [candidates, activeFilter]);

  const handleBack = useCallback(() => {
    if (isPersisting) return;
    router.back();
  }, [isPersisting, router]);

  const handleToggleInclusion = useCallback((localId: string) => {
    statementCandidateStore.toggleInclusion(localId);
  }, []);

  const handleEdit = useCallback((candidate: TransactionCandidate) => {
    setEditingCandidate(candidate);
  }, []);

  const handleSaveEdit = useCallback((updated: TransactionCandidate) => {
    statementCandidateStore.updateCandidate(updated.localId, updated);
  }, []);

  const handleSelectAll = useCallback(() => {
    statementCandidateStore.setAllInclusion(true);
  }, []);

  const handleDeselectAll = useCallback(() => {
    statementCandidateStore.setAllInclusion(false);
  }, []);

  // Open confirmation modal
  const handleOpenConfirmModal = useCallback(() => {
    if (persistableCount === 0 || isPersisting) return;
    setShowConfirmModal(true);
  }, [persistableCount, isPersisting]);

  // Execute persistence workflow
  const handleExecutePersistence = useCallback(async () => {
    setShowConfirmModal(false);
    setIsPersisting(true);

    try {
      const result = await statementTransactionPersistenceService.persistCandidates(
        persistableCandidates,
        progress => setPersistenceProgress(progress)
      );

      // Invalidate React Query caches so Transactions, Dashboard, and Budgets update immediately
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });

      setPersistenceResult(result);
    } catch (err: any) {
      Alert.alert('Persistence Error', err?.message || 'Failed to persist transactions.');
    } finally {
      setIsPersisting(false);
      setPersistenceProgress(null);
    }
  }, [persistableCandidates, queryClient]);

  // Retry failed transactions
  const handleRetryFailed = useCallback(async () => {
    const failedToRetry = statementCandidateStore.prepareRetryFailed();
    if (failedToRetry.length === 0) return;

    setPersistenceResult(null);
    setIsPersisting(true);

    try {
      const result = await statementTransactionPersistenceService.persistCandidates(
        failedToRetry,
        progress => setPersistenceProgress(progress)
      );

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets', 'summary'] });

      setPersistenceResult(result);
    } catch (err: any) {
      Alert.alert('Retry Error', err?.message || 'Failed to retry failed transactions.');
    } finally {
      setIsPersisting(false);
      setPersistenceProgress(null);
    }
  }, [queryClient]);

  // View transactions: keeps statement session intact and navigates to Transactions tab
  const handleViewTransactions = useCallback(() => {
    setPersistenceResult(null);
    router.replace('/(tabs)/transactions' as any);
  }, [router]);

  // Done: explicitly exits and clears statement session
  const handleDone = useCallback(() => {
    setPersistenceResult(null);
    statementCandidateStore.clearSession();
    router.replace('/(tabs)/scan' as any);
  }, [router]);

  const renderCandidateItem = useCallback(
    ({ item }: { item: TransactionCandidate }) => (
      <CandidateCard
        candidate={item}
        onToggleInclusion={handleToggleInclusion}
        onEdit={handleEdit}
      />
    ),
    [handleToggleInclusion, handleEdit]
  );

  const candidateKeyExtractor = useCallback(
    (item: TransactionCandidate) => item.localId,
    []
  );

  if (candidates.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <FileSpreadsheet color={colors.textSecondary} size={48} />
          <Text style={styles.emptyTitle}>No Statement Candidates</Text>
          <Text style={styles.emptySubtitle}>
            Extract text from a statement PDF in the Scan tab to review transaction candidates.
          </Text>
          <Button
            title="Go to Scan Tab"
            onPress={() => router.replace('/(tabs)/scan' as any)}
            variant="primary"
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Top App Bar */}
        <View style={styles.appBar}>
          <TouchableOpacity
            onPress={handleBack}
            disabled={isPersisting}
            style={[styles.backButton, isPersisting && styles.disabledOpacity]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft color={colors.text} size={20} />
          </TouchableOpacity>
          <View style={styles.appBarTitles}>
            <Text style={styles.appBarTitle}>Statement Review</Text>
            <Text style={styles.appBarSubtitle}>
              {candidates.length} Candidates • {persistableCount} Persistable
            </Text>
          </View>
        </View>

        {/* Candidate Virtualized FlashList */}
        <FlashList
          data={filteredCandidates}
          keyExtractor={candidateKeyExtractor}
          renderItem={renderCandidateItem}
          estimatedItemSize={140}
          ListHeaderComponent={
            <StatementSummaryHeader
              metadata={metadata}
              totalCount={candidates.length}
              includedCount={includedCount}
              excludedCount={excludedCount}
              duplicateCount={duplicateCount}
              totalSent={totalSent}
              totalReceived={totalReceived}
              totalTopUp={totalTopUp}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: 120 + insets.bottom,
          }}
        />

        {/* Floating Action Bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.xs) }]}>
          <View style={styles.bottomBarInfo}>
            <Text style={styles.bottomBarCount}>
              {persistableCount > 0
                ? `${persistableCount} transactions ready`
                : 'No transactions selected'}
            </Text>
            <Text style={styles.bottomBarSub}>
              ₹{persistableNetSpending.toLocaleString('en-IN', { minimumFractionDigits: 2 })} net spending
              {persistableReimbursementsCount > 0 ? ` (${persistableReimbursementsCount} reimbursements)` : ''}
              {` • ${receivedCount - persistableReimbursementsCount} inflows (₹0)`}
            </Text>
          </View>

          <Button
            title={persistableCount > 0 ? `Add ${persistableCount} Transactions` : 'No Transactions'}
            icon={<ArrowRight color={colors.background} size={16} />}
            onPress={handleOpenConfirmModal}
            disabled={persistableCount === 0 || isPersisting}
            variant="primary"
            style={styles.reviewButton}
          />
        </View>

        {/* In-place Candidate Edit Modal */}
        <CandidateEditModal
          visible={editingCandidate !== null}
          candidate={editingCandidate}
          onClose={() => setEditingCandidate(null)}
          onSave={handleSaveEdit}
        />

        {/* 1. Rich Confirmation Modal Before Persistence */}
        <Modal
          visible={showConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowConfirmModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <Card style={styles.confirmModalCard}>
              <View style={styles.modalHeaderIcon}>
                <CreditCard color={colors.brandLight} size={36} />
              </View>
              <Text style={styles.modalTitle}>Add {persistableCount} Transactions?</Text>
              <Text style={styles.modalImpact}>
                ₹{persistableNetSpending.toLocaleString('en-IN', { minimumFractionDigits: 2 })} net spending will be added to your budget.
              </Text>

              <View style={styles.modalBreakdown}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Expense transactions</Text>
                  <Text style={styles.breakdownValue}>{persistableExpensesCount}</Text>
                </View>
                {persistableReimbursementsCount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Reimbursements (offsets spending)</Text>
                    <Text style={[styles.breakdownValue, { color: colors.success }]}>
                      {persistableReimbursementsCount}
                    </Text>
                  </View>
                )}
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Non-spending inflows</Text>
                  <Text style={[styles.breakdownValue, { color: colors.info }]}>
                    {receivedCount - persistableReimbursementsCount}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Wallet top-ups (internal transfers)</Text>
                  <Text style={[styles.breakdownValue, { color: colors.info }]}>{topUpCount}</Text>
                </View>
              </View>

              <View style={styles.modalWarningBox}>
                <AlertTriangle color={colors.warning} size={16} />
                <Text style={styles.modalWarningText}>
                  These transactions will immediately affect your monthly budgets.
                </Text>
              </View>

              <View style={styles.modalActionsRow}>
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setShowConfirmModal(false)}
                  style={styles.modalActionBtn}
                />
                <Button
                  title="Add Transactions"
                  variant="primary"
                  onPress={handleExecutePersistence}
                  style={styles.modalActionBtn}
                />
              </View>
            </Card>
          </View>
        </Modal>

        {/* 2. Live Persistence Progress Modal */}
        <Modal
          visible={isPersisting}
          transparent
          animationType="fade"
          onRequestClose={() => {}} // Non-dismissable
        >
          <View style={styles.modalBackdrop}>
            <Card style={styles.progressModalCard}>
              <ActivityIndicator size="large" color={colors.brandLight} />
              <Text style={styles.progressTitle}>Adding Transactions...</Text>
              <Text style={styles.progressCounter}>
                {persistenceProgress?.completed ?? 0} / {persistenceProgress?.total ?? persistableCount} completed
              </Text>
              <Text style={styles.progressSub}>
                Controlled worker pool (max 3 concurrent requests). Please keep the app open.
              </Text>
            </Card>
          </View>
        </Modal>

        {/* 3. Import Complete Modal (Clear Audit Trail) */}
        <Modal
          visible={persistenceResult !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.modalBackdrop}>
            <Card style={styles.resultModalCard}>
              <View style={styles.modalHeaderIcon}>
                {persistenceResult?.failureCount === 0 ? (
                  <CheckCircle2 color={colors.success} size={40} />
                ) : (
                  <AlertCircle color={colors.warning} size={40} />
                )}
              </View>

              <Text style={styles.modalTitle}>Import Complete</Text>

              <View style={styles.auditMetricsBox}>
                <View style={styles.auditMetricRow}>
                  <Text style={[styles.auditMetricText, { color: colors.success }]}>
                    ✓ {persistenceResult?.successCount ?? 0} added successfully
                  </Text>
                </View>
                <View style={styles.auditMetricRow}>
                  <Text style={[styles.auditMetricText, { color: colors.warning }]}>
                    ⊘ {persistenceResult?.skippedDuplicateCount ?? 0} duplicates skipped
                  </Text>
                </View>
                <View style={styles.auditMetricRow}>
                  <Text
                    style={[
                      styles.auditMetricText,
                      { color: (persistenceResult?.failureCount ?? 0) > 0 ? colors.danger : colors.textMuted },
                    ]}
                  >
                    ⚠ {persistenceResult?.failureCount ?? 0} failed
                  </Text>
                </View>
              </View>

              <View style={styles.resultActions}>
                {persistenceResult && persistenceResult.failureCount > 0 && (
                  <Button
                    title={`Retry Failed (${persistenceResult.failureCount})`}
                    variant="outline"
                    onPress={handleRetryFailed}
                    style={styles.resultActionBtn}
                  />
                )}
                <Button
                  title="View Transactions"
                  variant="primary"
                  onPress={handleViewTransactions}
                  style={styles.resultActionBtn}
                />
                <Button
                  title="Done"
                  variant="ghost"
                  onPress={handleDone}
                  style={styles.resultActionBtn}
                />
              </View>
            </Card>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    marginRight: spacing.md,
  },
  appBarTitles: {
    flex: 1,
  },
  appBarTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  appBarSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100, // Extra space for floating bottom bar
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bottomBarInfo: {
    flex: 1,
  },
  bottomBarCount: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  bottomBarSub: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  reviewButton: {
    paddingHorizontal: spacing.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  disabledOpacity: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  modalHeaderIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  modalImpact: {
    color: colors.brandLight,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalBreakdown: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  breakdownValue: {
    color: colors.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  modalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    width: '100%',
  },
  modalWarningText: {
    color: colors.warning,
    fontSize: 11,
    flex: 1,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalActionBtn: {
    flex: 1,
  },
  progressModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  progressTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  progressCounter: {
    color: colors.brandLight,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  progressSub: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  resultModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  auditMetricsBox: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  auditMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  auditMetricText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  resultActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  resultActionBtn: {
    width: '100%',
  },
});
