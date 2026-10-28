/**
 * Bjet Mobile - Statement Summary Header Component (Phase 7)
 *
 * Displays high-level statement metadata, financial totals (Sent, Received, Top-up),
 * reconciliation badge against reported statement totals, direction filter chips,
 * and bulk selection toggles.
 *
 * Safeguard 1:
 * Clearly communicates that statement candidates are reviewed locally and not yet
 * persisted to backend confirmed state.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react-native';
import { StatementMetadata } from '../../types/receiptInterpretation';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

export type FilterCategory = 'ALL' | 'SENT' | 'RECEIVED' | 'TOP_UP' | 'DUPLICATES';

interface StatementSummaryHeaderProps {
  metadata?: StatementMetadata;
  totalCount: number;
  includedCount: number;
  excludedCount: number;
  duplicateCount: number;
  totalSent: number;
  totalReceived: number;
  totalTopUp: number;
  activeFilter: FilterCategory;
  onFilterChange: (filter: FilterCategory) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export const StatementSummaryHeader: React.FC<StatementSummaryHeaderProps> = ({
  metadata,
  totalCount,
  includedCount,
  excludedCount,
  duplicateCount,
  totalSent,
  totalReceived,
  totalTopUp,
  activeFilter,
  onFilterChange,
  onSelectAll,
  onDeselectAll,
}) => {
  const formatCurrency = (val: number) =>
    `₹${val.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Reconciliation check: Does calculated sum match statement-reported totals?
  const sentMatchesReported =
    metadata?.totalSentReported !== undefined &&
    Math.abs(metadata.totalSentReported - totalSent) < 0.01;

  const receivedMatchesReported =
    metadata?.totalReceivedReported !== undefined &&
    Math.abs(metadata.totalReceivedReported - totalReceived) < 0.01;

  const isReconciled = sentMatchesReported && receivedMatchesReported;

  return (
    <View style={styles.container}>
      {/* Safeguard 1 Informational Banner */}
      <View style={styles.infoBanner}>
        <ShieldAlert color={colors.warning} size={18} />
        <View style={styles.infoBannerTextContainer}>
          <Text style={styles.infoBannerTitle}>Statement Review (Local Preview)</Text>
          <Text style={styles.infoBannerText}>
            Statement candidates are parsed locally for review and editing. Bulk statement
            import is not yet supported by the backend contract and will not be persisted.
          </Text>
        </View>
      </View>

      {/* Statement Header info */}
      <View style={styles.metaCard}>
        <View style={styles.metaTopRow}>
          <View style={styles.iconCircle}>
            <Layers color={colors.brandLight} size={22} />
          </View>
          <View style={styles.metaDetails}>
            <Text style={styles.metaTitle}>Google Pay Transaction Statement</Text>
            {metadata?.periodStart && metadata?.periodEnd ? (
              <View style={styles.periodRow}>
                <Calendar color={colors.textSecondary} size={13} />
                <Text style={styles.periodText}>
                  {metadata.periodStart} – {metadata.periodEnd}
                </Text>
              </View>
            ) : (
              <Text style={styles.periodText}>Multi-page Statement</Text>
            )}
          </View>
        </View>

        {/* Financial Breakdown Cards */}
        <View style={styles.totalsGrid}>
          {/* Sent */}
          <View style={styles.totalItem}>
            <View style={styles.totalHeader}>
              <ArrowUpRight color={colors.textSecondary} size={14} />
              <Text style={styles.totalLabel}>Sent</Text>
            </View>
            <Text style={styles.totalValue}>{formatCurrency(totalSent)}</Text>
            {metadata?.totalSentReported !== undefined && (
              <Text style={styles.reportedSubtext}>
                Stmt: {formatCurrency(metadata.totalSentReported)}
              </Text>
            )}
          </View>

          {/* Received */}
          <View style={styles.totalItem}>
            <View style={styles.totalHeader}>
              <ArrowDownLeft color={colors.success} size={14} />
              <Text style={[styles.totalLabel, { color: colors.success }]}>Received</Text>
            </View>
            <Text style={[styles.totalValue, { color: colors.success }]}>
              {formatCurrency(totalReceived)}
            </Text>
            {metadata?.totalReceivedReported !== undefined && (
              <Text style={styles.reportedSubtext}>
                Stmt: {formatCurrency(metadata.totalReceivedReported)}
              </Text>
            )}
          </View>

          {/* UPI Lite Top-up */}
          <View style={styles.totalItem}>
            <View style={styles.totalHeader}>
              <RefreshCw color={colors.info} size={14} />
              <Text style={[styles.totalLabel, { color: colors.info }]}>UPI Lite</Text>
            </View>
            <Text style={[styles.totalValue, { color: colors.info }]}>
              {formatCurrency(totalTopUp)}
            </Text>
            <Text style={styles.reportedSubtext}>Internal transfer</Text>
          </View>
        </View>

        {/* Reconciliation Status */}
        {metadata?.totalSentReported !== undefined && (
          <View style={styles.reconciliationRow}>
            {isReconciled ? (
              <>
                <CheckCircle color={colors.brandLight} size={14} />
                <Text style={styles.reconciledText}>
                  100% Reconciled: Sums match statement summary exactly.
                </Text>
              </>
            ) : (
              <>
                <AlertCircle color={colors.warning} size={14} />
                <Text style={styles.unreconciledText}>
                  Note: Parsed amounts vary slightly from reported statement summary.
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Selection Summary & Bulk Controls */}
      <View style={styles.controlsRow}>
        <Text style={styles.selectionSummaryText}>
          <Text style={styles.selectionCountHighlight}>{includedCount}</Text> of {totalCount} candidates selected
          {excludedCount > 0 ? ` (${excludedCount} excluded)` : ''}
        </Text>

        <View style={styles.bulkActions}>
          <TouchableOpacity onPress={onSelectAll} style={styles.bulkButton}>
            <Text style={styles.bulkButtonText}>Select All</Text>
          </TouchableOpacity>
          <Text style={styles.bulkDivider}>/</Text>
          <TouchableOpacity onPress={onDeselectAll} style={styles.bulkButton}>
            <Text style={styles.bulkButtonText}>Deselect All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'ALL' && styles.filterChipActive]}
          onPress={() => onFilterChange('ALL')}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'ALL' && styles.filterChipTextActive,
            ]}
          >
            All ({totalCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'SENT' && styles.filterChipActive]}
          onPress={() => onFilterChange('SENT')}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'SENT' && styles.filterChipTextActive,
            ]}
          >
            Sent
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'RECEIVED' && styles.filterChipActive]}
          onPress={() => onFilterChange('RECEIVED')}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'RECEIVED' && styles.filterChipTextActive,
            ]}
          >
            Received
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'TOP_UP' && styles.filterChipActive]}
          onPress={() => onFilterChange('TOP_UP')}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'TOP_UP' && styles.filterChipTextActive,
            ]}
          >
            UPI Lite
          </Text>
        </TouchableOpacity>

        {duplicateCount > 0 && (
          <TouchableOpacity
            style={[
              styles.filterChip,
              styles.filterChipWarning,
              activeFilter === 'DUPLICATES' && styles.filterChipActiveWarning,
            ]}
            onPress={() => onFilterChange('DUPLICATES')}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: colors.warning },
                activeFilter === 'DUPLICATES' && styles.filterChipTextActive,
              ]}
            >
              Duplicates ({duplicateCount})
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoBannerTextContainer: {
    flex: 1,
  },
  infoBannerTitle: {
    color: colors.warning,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoBannerText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  metaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  metaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  metaDetails: {
    flex: 1,
  },
  metaTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  periodText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  totalsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  totalItem: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
  },
  totalValue: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  reportedSubtext: {
    color: colors.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
  reconciliationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  reconciledText: {
    color: colors.brandLight,
    fontSize: 11,
    fontWeight: fontWeights.medium,
  },
  unreconciledText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: fontWeights.medium,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  selectionSummaryText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  selectionCountHighlight: {
    color: colors.text,
    fontWeight: fontWeights.bold,
  },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bulkButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  bulkButtonText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  bulkDivider: {
    color: colors.textMuted,
    fontSize: 10,
  },
  filterScroll: {
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandLight,
  },
  filterChipWarning: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  filterChipActiveWarning: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  filterChipText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  filterChipTextActive: {
    color: colors.background,
    fontWeight: fontWeights.bold,
  },
});
