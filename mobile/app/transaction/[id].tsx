/**
 * Bjet Mobile - Transaction Detail Screen
 * Renders ONLY fields actually present in TransactionDetailResponse / API Contract v0.3.0.
 * Does not invent or assume fields such as notes, payment metadata, UTR, VPA, or receipt data.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  ReceiptText,
  Tag,
  Store,
  Calendar,
  Clock,
  Hash,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Users,
  Wallet,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../src/components/common/EmptyState';
import { useTransaction } from '../../src/hooks/useTransaction';
import { useDeleteTransaction } from '../../src/hooks/useTransactionMutations';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transactionId = Number(id);

  const { data: tx, isLoading, error, refetch } = useTransaction(transactionId);
  const deleteMutation = useDeleteTransaction();

  const handleBack = () => {
    router.back();
  };

  const handleEdit = () => {
    router.push(`/transaction/edit/${transactionId}` as any);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to permanently delete this transaction? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate(transactionId, {
              onSuccess: () => {
                router.back();
              },
              onError: (err) => {
                Alert.alert('Error', err.message || 'Failed to delete transaction.');
              },
            });
          },
        },
      ]
    );
  };

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return `₹${num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading transaction..." />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !tx) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft color={colors.text} size={22} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon={<ReceiptText color={colors.danger} size={48} />}
          title="Transaction Not Found"
          description={error?.message || 'Unable to load transaction details.'}
          actionLabel="Go Back"
          onAction={handleBack}
        />
      </ScreenContainer>
    );
  }

  const merchantName = tx.merchant?.clean_name || tx.merchant_raw_name || 'Not specified';
  const categoryName = tx.category?.name || 'Uncategorized';
  const categoryColor = tx.category?.color || colors.textMuted;

  const isReceived = tx.direction === 'RECEIVED';
  const isReimbursement = Boolean(tx.is_reimbursement);
  const totalAmount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
  const paidForOthers =
    tx.amount_paid_for_someone_else != null ? parseFloat(String(tx.amount_paid_for_someone_else)) : 0;
  const personalShare = Math.max(0, totalAmount - paidForOthers);
  const hasSplit = paidForOthers > 0;

  // Has optional payment metadata?
  const hasPaymentMetadata = Boolean(tx.upi_reference_id || tx.upi_vpa || tx.payment_app);

  return (
    <ScreenContainer scrollable>
      {/* Top Navigation Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Details</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={handleEdit}
            style={styles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Edit2 color={colors.textSecondary} size={18} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.iconButton, styles.deleteButton]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 color={colors.danger} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Hero Card: Amount & Direction */}
      <Card style={styles.heroCard}>
        <Text style={styles.currencyLabel}>{tx.currency}</Text>
        <Text style={styles.amountDisplay}>{formatCurrency(tx.amount)}</Text>
        <View
          style={[
            styles.typePill,
            isReceived ? styles.typePillIncoming : styles.typePillOutgoing,
          ]}
        >
          {isReceived ? (
            <ArrowDownLeft size={14} color={isReimbursement ? colors.brandLight : colors.success} />
          ) : (
            <ArrowUpRight size={14} color={colors.textSecondary} />
          )}
          <Text
            style={[
              styles.typePillText,
              isReceived ? styles.typePillTextIncoming : styles.typePillTextOutgoing,
            ]}
          >
            {isReimbursement
              ? 'Incoming Reimbursement'
              : isReceived
              ? 'Incoming Money'
              : 'Outgoing Spending'}
          </Text>
        </View>
      </Card>

      {/* Core Details Card */}
      <Text style={styles.sectionHeading}>Details</Text>
      <Card style={styles.detailsCard}>
        {/* Merchant */}
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Store color={colors.textSecondary} size={16} />
            <Text style={styles.rowLabel}>Merchant</Text>
          </View>
          <Text style={styles.rowValue} numberOfLines={1}>{merchantName}</Text>
        </View>

        <View style={styles.divider} />

        {/* Category */}
        <TouchableOpacity
          style={styles.row}
          onPress={handleEdit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Edit category"
        >
          <View style={styles.labelGroup}>
            <Tag color={categoryColor} size={16} />
            <Text style={styles.rowLabel}>Category</Text>
          </View>
          <View style={styles.categoryValueRow}>
            <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
            <Text style={[styles.rowValue, { color: categoryColor }]}>{categoryName}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Timestamp */}
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Calendar color={colors.textSecondary} size={16} />
            <Text style={styles.rowLabel}>Date & Time</Text>
          </View>
          <Text style={styles.rowValue}>{formatDateTime(tx.timestamp)}</Text>
        </View>

        <View style={styles.divider} />

        {/* Transaction Type */}
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <CreditCard color={colors.textSecondary} size={16} />
            <Text style={styles.rowLabel}>Type</Text>
          </View>
          <Text style={styles.rowValue}>
            {isReimbursement ? 'Reimbursement' : isReceived ? 'Income / Inflow' : 'Personal Expense'}
          </Text>
        </View>

        {/* Paid for Others Split Breakdown */}
        {hasSplit && (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.labelGroup}>
                <Users color={colors.warning} size={16} />
                <Text style={styles.rowLabel}>Paid for Others</Text>
              </View>
              <Text style={styles.rowValue}>{formatCurrency(paidForOthers)}</Text>
            </View>

            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.labelGroup}>
                <Wallet color={colors.brandLight} size={16} />
                <Text style={styles.rowLabel}>Your Personal Share</Text>
              </View>
              <Text style={[styles.rowValue, styles.highlightValue]}>
                {formatCurrency(personalShare)}
              </Text>
            </View>
          </>
        )}

        {/* Friend / Contact Information */}
        {(tx.friend || isReimbursement) && (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.labelGroup}>
                <Users color={colors.brandLight} size={16} />
                <Text style={styles.rowLabel}>Friend / Contact</Text>
              </View>
              <Text style={styles.rowValue}>
                {tx.friend?.name || tx.friend?.recognized_name || 'Matched Reimbursement'}
              </Text>
            </View>
          </>
        )}
      </Card>

      {/* Notes Section - Render ONLY if notes is present */}
      {tx.notes ? (
        <>
          <Text style={styles.sectionHeading}>Notes</Text>
          <Card style={styles.detailsCard}>
            <Text style={styles.notesText}>{tx.notes}</Text>
          </Card>
        </>
      ) : null}

      {/* Payment Metadata Section - Render ONLY if fields are actually present */}
      {hasPaymentMetadata ? (
        <>
          <Text style={styles.sectionHeading}>Payment Details</Text>
          <Card style={styles.detailsCard}>
            {tx.payment_app ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Payment App</Text>
                <Text style={styles.rowValue}>{tx.payment_app}</Text>
              </View>
            ) : null}

            {tx.upi_vpa ? (
              <>
                {tx.payment_app ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>UPI VPA</Text>
                  <Text style={styles.rowValue}>{tx.upi_vpa}</Text>
                </View>
              </>
            ) : null}

            {tx.upi_reference_id ? (
              <>
                {tx.payment_app || tx.upi_vpa ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Reference ID</Text>
                  <Text style={styles.rowValue}>{tx.upi_reference_id}</Text>
                </View>
              </>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* Raw Extracted Text - Render ONLY if present */}
      {tx.raw_extracted_text ? (
        <>
          <Text style={styles.sectionHeading}>Extracted Text</Text>
          <Card style={styles.detailsCard}>
            <Text style={styles.extractedText}>{tx.raw_extracted_text}</Text>
          </Card>
        </>
      ) : null}

      {/* System Audit Information */}
      <Text style={styles.sectionHeading}>System Info</Text>
      <Card style={styles.detailsCard}>
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Hash color={colors.textMuted} size={14} />
            <Text style={styles.systemLabel}>ID</Text>
          </View>
          <Text style={styles.systemValue}>#{tx.id}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Clock color={colors.textMuted} size={14} />
            <Text style={styles.systemLabel}>Created</Text>
          </View>
          <Text style={styles.systemValue}>{formatDateTime(tx.created_at)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.labelGroup}>
            <Clock color={colors.textMuted} size={14} />
            <Text style={styles.systemLabel}>Updated</Text>
          </View>
          <Text style={styles.systemValue}>{formatDateTime(tx.updated_at)}</Text>
        </View>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.xs + 2,
    borderRadius: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteButton: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  currencyLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    letterSpacing: 1,
    marginBottom: 4,
  },
  amountDisplay: {
    color: colors.text,
    fontSize: fontSizes.xxxl * 1.1,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.md,
  },
  statusBadgeContainer: {
    marginTop: 2,
  },
  sectionHeading: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
    marginTop: spacing.sm,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  rowValue: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    maxWidth: '60%',
    textAlign: 'right',
  },
  categoryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
  },
  typePillIncoming: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  typePillOutgoing: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderMuted,
  },
  typePillText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  typePillTextIncoming: {
    color: colors.brandLight,
  },
  typePillTextOutgoing: {
    color: colors.textSecondary,
  },
  highlightValue: {
    color: colors.brandLight,
    fontWeight: fontWeights.bold,
  },
  notesText: {
    color: colors.text,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    paddingVertical: spacing.xs,
  },
  extractedText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontFamily: 'monospace',
    lineHeight: 18,
    paddingVertical: spacing.xs,
  },
  systemLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  systemValue: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontFamily: 'monospace',
  },
});
