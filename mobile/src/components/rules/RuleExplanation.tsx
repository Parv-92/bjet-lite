/**
 * Bjet Mobile - RuleExplanation Component (Phase 10)
 * Informational card explaining Bjet's 3-tier categorization hierarchy and substring matching behavior.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Info, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Card } from '../ui/Card';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface RuleExplanationProps {
  collapsible?: boolean;
}

export const RuleExplanation: React.FC<RuleExplanationProps> = ({
  collapsible = false,
}) => {
  const [expanded, setExpanded] = useState(!collapsible);

  return (
    <Card style={styles.card}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => collapsible && setExpanded(!expanded)}
        activeOpacity={collapsible ? 0.7 : 1}
      >
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Info size={16} color={colors.brandLight} />
          </View>
          <Text style={styles.headerTitle}>How Categorization Works</Text>
        </View>
        {collapsible && (
          expanded ? (
            <ChevronUp size={16} color={colors.textMuted} />
          ) : (
            <ChevronDown size={16} color={colors.textMuted} />
          )
        )}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          <Text style={styles.description}>
            Bjet evaluates transactions through an authoritative 3-tier hierarchy:
          </Text>

          <View style={styles.stepRow}>
            <View style={[styles.stepNumber, styles.stepNumberActive]}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Your Merchant Rules</Text>
              <Text style={styles.stepDesc}>
                Matches merchant name or UPI VPA using case-insensitive text search. Evaluated before default categories.
              </Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Known Merchant Defaults</Text>
              <Text style={styles.stepDesc}>
                System-assigned default categories for recognized merchants when no user rule matches.
              </Text>
            </View>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepInfo}>
              <Text style={styles.stepTitle}>Uncategorized Fallback</Text>
              <Text style={styles.stepDesc}>
                Fallback category assigned when no merchant entity or rule match exists.
              </Text>
            </View>
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  content: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  stepNumberActive: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  stepNumberText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: fontWeights.bold,
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    color: colors.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  stepDesc: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
});
