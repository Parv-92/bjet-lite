/**
 * Bjet Mobile - BudgetEmptyState Component (Phase 8)
 *
 * Renders an informative empty state when no category budgets
 * exist for the selected month/year.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart, Plus } from 'lucide-react-native';
import { Button } from '../ui/Button';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface BudgetEmptyStateProps {
  monthName: string;
  year: number;
  onAddBudget: () => void;
  noCategories?: boolean;
}

export const BudgetEmptyState: React.FC<BudgetEmptyStateProps> = ({
  monthName,
  year,
  onAddBudget,
  noCategories = false,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <PieChart color={colors.brandLight} size={28} />
      </View>

      <Text style={styles.title}>
        {noCategories ? 'No categories found' : `No budgets for ${monthName} ${year}`}
      </Text>

      <Text style={styles.description}>
        {noCategories
          ? 'Categories are required to configure budgets.'
          : `No budget limits set for ${monthName} ${year}.`}
      </Text>

      {!noCategories && (
        <Button
          title="Add budget"
          icon={<Plus color={colors.background} size={16} />}
          onPress={onAddBudget}
          variant="primary"
          style={styles.actionButton}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  actionButton: {
    minWidth: 160,
  },
});
