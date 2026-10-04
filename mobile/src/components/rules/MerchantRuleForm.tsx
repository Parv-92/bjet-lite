/**
 * Bjet Mobile - MerchantRuleForm Component (Phase 10)
 * Reusable form for creating and replacing merchant rules with React Hook Form and Zod.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorMessage } from '../ui/ErrorMessage';
import { CategoryPickerModal } from '../transactions/CategoryPickerModal';
import { CategoryIcon } from '../categories/CategoryIcon';
import { useCategories } from '../../hooks/useCategories';
import { Category } from '../../types/api';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

const ruleSchema = z.object({
  merchant_pattern: z
    .string()
    .min(1, 'Merchant pattern is required')
    .max(100, 'Pattern must be 100 characters or fewer')
    .refine((val) => val.trim().length > 0, 'Pattern cannot be blank'),
  category_id: z.number({ required_error: 'Please select a category' }).min(1, 'Please select a category'),
  priority: z.number(),
});

export type RuleFormData = z.infer<typeof ruleSchema>;

interface MerchantRuleFormProps {
  initialValues?: Partial<RuleFormData>;
  onSubmit: (data: RuleFormData) => void;
  isLoading: boolean;
  submitButtonText?: string;
  onCancel?: () => void;
  serverError?: string | null;
  isEditing?: boolean;
}

export const MerchantRuleForm: React.FC<MerchantRuleFormProps> = ({
  initialValues,
  onSubmit,
  isLoading,
  submitButtonText = 'Save Rule',
  onCancel,
  serverError,
  isEditing = false,
}) => {
  const { data: categories } = useCategories();
  const [pickerVisible, setPickerVisible] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      merchant_pattern: initialValues?.merchant_pattern || '',
      category_id: initialValues?.category_id || 0,
      priority: initialValues?.priority ?? 10,
    },
  });

  const watchedPattern = watch('merchant_pattern');
  const watchedCategoryId = watch('category_id');

  const selectedCategory = categories?.find((c) => c.id === watchedCategoryId);

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Replacement Notice Banner if Editing */}
      {isEditing && (
        <Card style={styles.noticeCard}>
          <View style={styles.noticeHeader}>
            <AlertTriangle size={16} color={colors.warning} style={styles.noticeIcon} />
            <Text style={styles.noticeTitle}>Rule Replacement</Text>
          </View>
          <Text style={styles.noticeText}>
            Saving edits replaces this rule configuration with a new rule. Existing transactions remain unchanged.
          </Text>
        </Card>
      )}

      {/* Server Error Banner */}
      {serverError ? (
        <View style={styles.errorWrapper}>
          <ErrorMessage message={serverError} />
        </View>
      ) : null}

      {/* Live Preview Card */}
      <Card style={styles.previewCard}>
        <Text style={styles.previewHeading}>Rule Preview</Text>
        <Text style={styles.previewSummary}>
          Transactions with merchant or UPI containing{' '}
          <Text style={styles.previewHighlight}>
            "{watchedPattern.trim() ? watchedPattern.trim().toUpperCase() : 'PATTERN'}"
          </Text>
          {' '}will be automatically suggested as{' '}
          <Text style={styles.previewHighlight}>
            {selectedCategory ? selectedCategory.name : 'Category'}
          </Text>.
        </Text>
      </Card>

      {/* Merchant Pattern Input */}
      <Controller
        control={control}
        name="merchant_pattern"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Input
              label="Merchant Pattern *"
              placeholder="e.g. SWIGGY, UBER, ZOMATO"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.merchant_pattern?.message}
              autoCapitalize="characters"
              maxLength={100}
              autoFocus={!initialValues?.merchant_pattern}
            />
            <Text style={styles.fieldHint}>
              Matches any merchant name or UPI VPA containing this text (case-insensitive substring match).
            </Text>
          </View>
        )}
      />

      {/* Category Selector */}
      <View style={styles.categorySection}>
        <Text style={styles.fieldLabel}>Target Category *</Text>
        <TouchableOpacity
          style={[
            styles.categoryButton,
            Boolean(errors.category_id) && styles.categoryButtonError,
          ]}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Select target category"
        >
          {selectedCategory ? (
            <View style={styles.selectedCategoryRow}>
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: selectedCategory.color || colors.brand },
                ]}
              >
                <CategoryIcon
                  name={selectedCategory.icon}
                  size={16}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.selectedCategoryText}>
                {selectedCategory.name}
              </Text>
            </View>
          ) : (
            <Text style={styles.placeholderCategoryText}>
              Select category to map to...
            </Text>
          )}
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {errors.category_id && (
          <Text style={styles.fieldError}>{errors.category_id.message}</Text>
        )}
      </View>


      {/* Category Picker Modal */}
      <CategoryPickerModal
        visible={pickerVisible}
        selectedCategoryId={watchedCategoryId || null}
        onSelect={(cat: Category | null) => {
          setValue('category_id', cat ? cat.id : 0, { shouldValidate: true });
        }}
        onClose={() => setPickerVisible(false)}
      />

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        <Button
          title={submitButtonText}
          onPress={handleSubmit(onSubmit)}
          loading={isLoading}
          disabled={isLoading}
          style={styles.submitButton}
        />

        {onCancel && (
          <Button
            title="Cancel"
            onPress={onCancel}
            variant="ghost"
            disabled={isLoading}
            style={styles.cancelButton}
          />
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  noticeCard: {
    padding: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: spacing.md,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  noticeIcon: {
    marginRight: spacing.xs,
  },
  noticeTitle: {
    color: colors.warning,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
  },
  noticeText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  errorWrapper: {
    marginBottom: spacing.md,
  },
  previewCard: {
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  previewHeading: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  previewSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  previewHighlight: {
    color: colors.brandLight,
    fontWeight: fontWeights.bold,
  },
  fieldHint: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
  categorySection: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.xs,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    height: 48,
    paddingHorizontal: spacing.md,
  },
  categoryButtonError: {
    borderColor: colors.danger,
  },
  selectedCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  selectedCategoryText: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  placeholderCategoryText: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
  },
  fieldError: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
  },
  buttonsContainer: {
    marginTop: spacing.lg,
  },
  submitButton: {
    marginBottom: spacing.sm,
  },
  cancelButton: {
    borderColor: colors.border,
  },
});
