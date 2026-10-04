/**
 * Bjet Mobile - Edit / Replace Merchant Rule Screen (Phase 10)
 * Screen allowing users to replace an existing rule configuration.
 * Explicitly treats editing as a replacement operation with rollback recovery.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { MerchantRuleForm, RuleFormData } from '../../../src/components/rules/MerchantRuleForm';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../../../src/components/ui/ErrorMessage';
import { useMerchantRule } from '../../../src/hooks/useMerchantRules';
import { useReplaceMerchantRule } from '../../../src/hooks/useMerchantRuleMutations';
import { RuleReplacementError } from '../../../src/types/rules';
import { getApiErrorMessage } from '../../../src/api/client';
import { colors } from '../../../src/theme/colors';
import { spacing, radii } from '../../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../../src/theme/typography';

export default function EditRuleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ruleId = parseInt(id || '', 10);

  const { data: rule, isLoading, error, refetch } = useMerchantRule(ruleId);
  const replaceMutation = useReplaceMerchantRule();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (data: RuleFormData) => {
    if (!rule) return;

    setServerError(null);
    try {
      await replaceMutation.mutateAsync({
        originalRule: rule,
        replacement: {
          merchant_pattern: data.merchant_pattern.trim(),
          category_id: data.category_id,
          priority: data.priority,
        },
      });
      router.back();
    } catch (err: unknown) {
      if (err instanceof RuleReplacementError) {
        setServerError(err.message);
      } else {
        const message = getApiErrorMessage(err);
        setServerError(message);
      }
    }
  };

  return (
    <ScreenContainer scrollable={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
        >
          <ChevronLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Edit Merchant Rule</Text>
          <Text style={styles.subtitle}>Update rule pattern or category</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading rule..." />
        </View>
      ) : error || !rule ? (
        <View style={styles.centerContainer}>
          <ErrorMessage
            message={error ? getApiErrorMessage(error) : 'Merchant rule not found.'}
            onRetry={() => refetch()}
          />
        </View>
      ) : (
        <MerchantRuleForm
          initialValues={{
            merchant_pattern: rule.merchant_pattern,
            category_id: rule.category_id,
            priority: rule.priority,
          }}
          onSubmit={handleSubmit}
          isLoading={replaceMutation.isPending}
          submitButtonText="Replace Rule"
          onCancel={() => router.back()}
          serverError={serverError}
          isEditing={true}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
