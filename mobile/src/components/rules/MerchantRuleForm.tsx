/**
 * Bjet Mobile - MerchantRuleForm Component (Phase 10)
 * Reusable form for creating and replacing merchant rules with React Hook Form and Zod.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ChevronRight } from 'lucide-react-native';
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
      {/* Concise Explanatory Copy */}
      <Card style={styles.infoCard}>
        <Text style={styles.infoText}>
          Transactions matching this merchant will use the selected category by default.
        </Text>
      </Card>

      {/* Server Error Banner */}
      {serverError ? (
        <View style={styles.errorWrapper}>
          <ErrorMessage message={serverError} />
        </View>
      ) : null}

      {/* Merchant Pattern Input */}
      <Controller
        control={control}
        name="merchant_pattern"
        render={({ field: { onChange, onBlur, value } }) => (
          <View>
            <Input
              label="Merchant Pattern"
              placeholder="e.g. SWIGGY, UBER, JIO"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.merchant_pattern?.message}
              autoCapitalize="characters"
              maxLength={100}
              autoFocus={!initialValues?.merchant_pattern}
            />
          </View>
        )}
      />

      {/* Category Selector */}
      <View style={styles.categorySection}>
        <Text style={styles.fieldLabel}>Default Category</Text>
        <TouchableOpacity
          style={[
            styles.categoryButton,
            Boolean(errors.category_id) && styles.categoryButtonError,
          ]}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Select default category"
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
              Select category...
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
  infoCard: {
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  errorWrapper: {
    marginBottom: spacing.md,
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
