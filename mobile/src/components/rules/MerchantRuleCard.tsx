/**
 * Bjet Mobile - MerchantRuleCard Component (Phase 10)
 * Displays a single merchant rule with pattern, category, priority, and actions.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Edit2, Trash2, ArrowRight } from 'lucide-react-native';
import { UserMerchantRule } from '../../types/rules';
import { CategoryIcon } from '../categories/CategoryIcon';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface MerchantRuleCardProps {
  rule: UserMerchantRule;
  onEdit: (rule: UserMerchantRule) => void;
  onDelete: (rule: UserMerchantRule) => void;
  isDeleting?: boolean;
}

export const MerchantRuleCard: React.FC<MerchantRuleCardProps> = ({
  rule,
  onEdit,
  onDelete,
  isDeleting = false,
}) => {
  const categoryName = rule.category?.name || `Category #${rule.category_id}`;
  const categoryColor = rule.category?.color || colors.brand;

  return (
    <View style={styles.card}>
      {/* Top Row: Pattern -> Category & Priority */}
      <View style={styles.topRow}>
        <View style={styles.patternContainer}>
          <View style={styles.patternPill}>
            <Text style={styles.patternText} numberOfLines={1}>
              {rule.merchant_pattern}
            </Text>
          </View>
          <ArrowRight size={14} color={colors.textMuted} style={styles.arrowIcon} />
          <View style={styles.categoryInfo}>
            <View
              style={[
                styles.categoryIconCircle,
                { backgroundColor: `${categoryColor}25`, borderColor: categoryColor },
              ]}
            >
              <CategoryIcon name={rule.category?.icon} size={14} color={categoryColor} />
            </View>
            <Text style={styles.categoryName} numberOfLines={1}>
              {categoryName}
            </Text>
          </View>
        </View>
      </View>

      {/* Subtitle explanation */}
      <Text style={styles.explanationText}>
        Matches merchant names or UPI VPAs containing "{rule.merchant_pattern}".
      </Text>

      {/* Footer Row: Action Controls */}
      <View style={styles.footerRow}>
        <Text style={styles.metaText}>
          Evaluated before default categories
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onEdit(rule)}
            disabled={isDeleting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Edit rule for ${rule.merchant_pattern}`}
          >
            <Edit2 size={16} color={colors.brandLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => onDelete(rule)}
            disabled={isDeleting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete rule for ${rule.merchant_pattern}`}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Trash2 size={16} color={colors.danger} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  patternContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  patternPill: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderMuted,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    maxWidth: '45%',
  },
  patternText: {
    color: colors.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.5,
  },
  arrowIcon: {
    marginHorizontal: spacing.xs,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  categoryName: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    flex: 1,
  },
  priorityBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  priorityText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  explanationText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  deleteButton: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
});
