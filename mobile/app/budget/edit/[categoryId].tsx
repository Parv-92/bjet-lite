/**
 * Bjet Mobile - Edit Budget Screen (Phase 8)
 *
 * Route: /budget/edit/[categoryId]?month={m}&year={y}
 *
 * Allows updating the monthly spending limit for an existing category budget.
 * Category identity and spending history are preserved as read-only.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Trash2,
} from 'lucide-react-native';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { Card } from '../../../src/components/ui/Card';
import { Button } from '../../../src/components/ui/Button';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../../../src/components/ui/ErrorMessage';
import { useCategoryBudgetStatus, useSetBudget, useDeleteBudget } from '../../../src/hooks/useBudgets';
import { getApiErrorMessage } from '../../../src/api/client';
import { colors } from '../../../src/theme/colors';
import { spacing, radii } from '../../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../../src/theme/typography';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function EditBudgetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId: string; month?: string; year?: string }>();

  const categoryId = parseInt(params.categoryId, 10);
  const now = new Date();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();

  const {
    data: budgetStatus,
    isLoading,
    error: fetchError,
  } = useCategoryBudgetStatus(categoryId, month, year);

  const setBudgetMutation = useSetBudget();
  const deleteBudgetMutation = useDeleteBudget();

  const [amountStr, setAmountStr] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (budgetStatus) {
      setAmountStr(parseFloat(budgetStatus.amount_limit).toString());
    }
  }, [budgetStatus]);

  const monthName = MONTH_NAMES[month - 1] || `Month ${month}`;

  const handleBack = () => {
    router.back();
  };

  const handleRemove = () => {
    const name = budgetStatus?.category?.name || `Category #${categoryId}`;
    Alert.alert(
      'Remove from Month?',
      `Are you sure you want to remove "${name}" from the ${monthName} ${year} budget?\n\nExisting transactions will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSubmitError(null);
            try {
              await deleteBudgetMutation.mutateAsync({
                category_id: categoryId,
                month,
                year,
              });
              router.back();
            } catch (err: any) {
              setSubmitError(getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const handleUpdate = async () => {
    setSubmitError(null);

    const numAmount = parseFloat(amountStr);
    if (isNaN(numAmount) || numAmount < 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid non-negative budget limit.');
      return;
    }

    const name = budgetStatus?.category?.name || `Category #${categoryId}`;

    if (numAmount === 0) {
      Alert.alert(
        'Remove Category Budget?',
        `Setting the budget limit to ₹0 will remove "${name}" from the ${monthName} ${year} budget.\n\nDo you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove Budget',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteBudgetMutation.mutateAsync({
                  category_id: categoryId,
                  month,
                  year,
                });
                router.back();
              } catch (err: any) {
                setSubmitError(getApiErrorMessage(err));
              }
            },
          },
        ]
      );
      return;
    }

    try {
      await setBudgetMutation.mutateAsync({
        category_id: categoryId,
        month,
        year,
        amount_limit: numAmount,
      });

      router.back();
    } catch (err: any) {
      setSubmitError(getApiErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingSpinner size="large" label="Loading category budget..." />
      </ScreenContainer>
    );
  }

  if (fetchError || !budgetStatus) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <AlertCircle color={colors.danger} size={48} />
          <Text style={styles.errorTitle}>Budget Not Found</Text>
          <Text style={styles.errorMessage}>
            {fetchError ? getApiErrorMessage(fetchError) : 'No budget found for this category and month.'}
          </Text>
          <Button title="Back to Budgets" onPress={handleBack} variant="secondary" />
        </View>
      </ScreenContainer>
    );
  }

  const categoryName = budgetStatus.category?.name || `Category #${categoryId}`;
  const categoryColor = budgetStatus.category?.color || colors.brand;
  const spent = parseFloat(budgetStatus.spent_amount) || 0;

  return (
    <ScreenContainer scrollable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flexOne}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            accessibilityLabel="Go back"
          >
            <ArrowLeft color={colors.text} size={20} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.screenTitle}>Edit Budget</Text>
            <Text style={styles.screenSubtitle}>
              {categoryName}, {monthName} {year}
            </Text>
          </View>
        </View>

        {/* Error Banner */}
        {submitError && (
          <ErrorMessage message={submitError} style={styles.errorBanner} />
        )}

        {/* Form Card */}
        <Card style={styles.formCard}>
          {/* Category Header (Read-Only) */}
          <View style={styles.categoryHeader}>
            <View style={[styles.colorDot, { backgroundColor: categoryColor }]} />
            <Text style={styles.categoryNameText}>{categoryName}</Text>
          </View>

          {/* Period Banner */}
          <View style={styles.periodBanner}>
            <Calendar color={colors.brandLight} size={16} />
            <Text style={styles.periodText}>
              Period: <Text style={styles.periodHighlight}>{monthName} {year}</Text>
            </Text>
          </View>

          {/* Current Spent Info (Read-Only from Backend) */}
          <View style={styles.spentInfoBox}>
            <View style={styles.spentHeader}>
              <TrendingUp color={colors.textSecondary} size={16} />
              <Text style={styles.spentLabel}>Current Confirmed Spending</Text>
            </View>
            <Text style={styles.spentValue}>
              ₹{spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>

          {/* New Amount Limit Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Monthly Budget Limit (₹)</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Button
            title={setBudgetMutation.isPending ? 'Updating...' : 'Update Budget Limit'}
            icon={<CheckCircle2 color={colors.background} size={18} />}
            onPress={handleUpdate}
            disabled={setBudgetMutation.isPending || deleteBudgetMutation.isPending}
            variant="primary"
            style={styles.fullWidth}
          />
          <Button
            title={deleteBudgetMutation.isPending ? 'Removing...' : 'Remove from this Month'}
            icon={<Trash2 color={colors.danger} size={18} />}
            onPress={handleRemove}
            disabled={setBudgetMutation.isPending || deleteBudgetMutation.isPending}
            variant="ghost"
            style={styles.removeButton}
            textStyle={styles.removeButtonText}
          />
          <Button
            title="Cancel"
            onPress={handleBack}
            variant="secondary"
            style={styles.fullWidth}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  backButton: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
    marginRight: spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  screenTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  screenSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  errorBanner: {
    marginBottom: spacing.md,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: radii.full,
    marginRight: spacing.sm,
  },
  categoryNameText: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  periodBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  periodText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  periodHighlight: {
    color: colors.brandLight,
    fontWeight: fontWeights.semibold,
  },
  spentInfoBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  spentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  spentLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  spentValue: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  formGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.text,
    fontSize: fontSizes.base,
  },
  amountInput: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.brandLight,
  },
  actionsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  fullWidth: {
    width: '100%',
  },
  removeButton: {
    width: '100%',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  removeButtonText: {
    color: colors.danger,
    fontWeight: fontWeights.semibold,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
});
