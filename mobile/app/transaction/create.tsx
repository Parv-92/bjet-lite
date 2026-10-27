/**
 * Bjet Mobile - Create Manual Transaction Screen
 * Form for adding a manual transaction.
 * Status is automatically CONFIRMED by backend.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ChevronDown, Tag, ChevronRight, Check } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { CategoryPickerModal } from '../../src/components/transactions/CategoryPickerModal';
import { useCreateTransaction } from '../../src/hooks/useTransactionMutations';
import { useCategories } from '../../src/hooks/useCategories';
import { Category } from '../../src/types/api';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

const createTransactionSchema = z
  .object({
    amount: z
      .string()
      .min(1, 'Amount is required')
      .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, {
        message: 'Amount must be greater than 0',
      }),
    merchant_raw_name: z.string().optional(),
    category_id: z.number().nullable().optional(),
    notes: z.string().optional(),
    set_as_merchant_default: z.boolean().optional(),
    paid_for_someone_else: z.boolean().optional(),
    amount_paid_for_someone_else: z.string().optional(),
    upi_reference_id: z.string().optional(),
    upi_vpa: z.string().optional(),
    payment_app: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.paid_for_someone_else && data.amount_paid_for_someone_else) {
        const split = parseFloat(data.amount_paid_for_someone_else);
        const total = parseFloat(data.amount || '0');
        return !isNaN(split) && split >= 0 && split <= total;
      }
      return true;
    },
    {
      message: 'Amount paid for others cannot exceed total transaction amount',
      path: ['amount_paid_for_someone_else'],
    }
  );

type CreateTransactionFormData = z.infer<typeof createTransactionSchema>;

export default function CreateTransactionScreen() {
  const router = useRouter();
  const createMutation = useCreateTransaction();
  const { data: categories } = useCategories();

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateTransactionFormData>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: {
      amount: '',
      merchant_raw_name: '',
      category_id: null,
      notes: '',
      set_as_merchant_default: false,
      paid_for_someone_else: false,
      amount_paid_for_someone_else: '',
      upi_reference_id: '',
      upi_vpa: '',
      payment_app: '',
    },
  });

  const selectedCategoryId = watch('category_id');
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);
  const watchedMerchant = watch('merchant_raw_name');
  const merchantName = (watchedMerchant || '').trim();

  const onSubmit = async (values: CreateTransactionFormData) => {
    setApiError(null);
    try {
      const paidForSomeoneElse = !!values.paid_for_someone_else;
      const paidAmount =
        paidForSomeoneElse && values.amount_paid_for_someone_else
          ? parseFloat(values.amount_paid_for_someone_else)
          : null;

      await createMutation.mutateAsync({
        amount: parseFloat(values.amount),
        merchant_raw_name: values.merchant_raw_name?.trim() || null,
        category_id: values.category_id || null,
        notes: values.notes?.trim() || null,
        set_as_merchant_default: !!values.set_as_merchant_default,
        amount_paid_for_someone_else: paidAmount,
        upi_reference_id: values.upi_reference_id?.trim() || null,
        upi_vpa: values.upi_vpa?.trim() || null,
        payment_app: values.payment_app?.trim() || null,
        timestamp: new Date().toISOString(),
      });
      router.back();
    } catch (err: any) {
      setApiError(err?.message || 'Failed to create transaction.');
    }
  };

  return (
    <ScreenContainer scrollable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft color={colors.text} size={22} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Transaction</Text>
          <View style={styles.headerRightPlaceholder} />
        </View>

        {apiError && (
          <ErrorMessage
            message={apiError}
            style={styles.errorBanner}
          />
        )}

        {/* Amount Input */}
        <Controller
          control={control}
          name="amount"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Amount (₹) *"
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.amount?.message}
            />
          )}
        />

        {/* Merchant Name */}
        <Controller
          control={control}
          name="merchant_raw_name"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Merchant / Payee Name"
              placeholder="e.g. Swiggy, Uber, Amazon"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.merchant_raw_name?.message}
            />
          )}
        />

        {/* Category Picker Selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Category</Text>
          <TouchableOpacity
            style={styles.categoryPickerButton}
            onPress={() => setCategoryModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.pickerLeft}>
              <View
                style={[
                  styles.categoryDot,
                  {
                    backgroundColor: selectedCategory?.color || colors.textMuted,
                  },
                ]}
              />
              <Text
                style={[
                  styles.pickerText,
                  !selectedCategory && styles.pickerPlaceholder,
                ]}
              >
                {selectedCategory?.name || 'Select Category'}
              </Text>
            </View>
            <ChevronRight color={colors.textMuted} size={18} />
          </TouchableOpacity>
        </View>

        {/* Optional Merchant Default Action */}
        {merchantName.length > 0 &&
          selectedCategoryId !== null &&
          selectedCategory?.name !== 'Uncategorized' && (
            <Controller
              control={control}
              name="set_as_merchant_default"
              render={({ field: { value, onChange } }) => (
                <TouchableOpacity
                  style={styles.defaultCheckboxRow}
                  onPress={() => onChange(!value)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!value }}
                  accessibilityLabel={`Keep ${selectedCategory?.name || 'this category'} default for ${merchantName}`}
                >
                  <View style={[styles.checkbox, value && styles.checkboxActive]}>
                    {value && <Check color={colors.background} size={14} strokeWidth={3} />}
                  </View>
                  <Text style={styles.defaultCheckboxText}>
                    Keep this category default for{' '}
                    <Text style={styles.merchantHighlight}>{merchantName}</Text>
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}

        {/* Paid for someone else */}
        <View style={styles.adjustmentSection}>
          <Controller
            control={control}
            name="paid_for_someone_else"
            render={({ field: { value, onChange } }) => (
              <TouchableOpacity
                style={styles.defaultCheckboxRow}
                onPress={() => {
                  const next = !value;
                  onChange(next);
                  if (!next) {
                    setValue('amount_paid_for_someone_else', '');
                  }
                }}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!value }}
              >
                <View style={[styles.checkbox, value && styles.checkboxActive]}>
                  {value && <Check color={colors.background} size={14} strokeWidth={3} />}
                </View>
                <Text style={styles.defaultCheckboxText}>
                  I paid part of this for someone else
                </Text>
              </TouchableOpacity>
            )}
          />

          {watch('paid_for_someone_else') && (
            <View style={styles.splitInputContainer}>
              <Controller
                control={control}
                name="amount_paid_for_someone_else"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Amount Paid for Others (₹)"
                    placeholder="e.g. 300"
                    keyboardType="numeric"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.amount_paid_for_someone_else?.message}
                  />
                )}
              />
            </View>
          )}
        </View>

        {/* Notes */}
        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Notes"
              placeholder="Add details, description, or memo"
              multiline
              numberOfLines={3}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              style={styles.textArea}
              containerStyle={styles.textAreaContainer}
              error={errors.notes?.message}
            />
          )}
        />

        {/* Collapsible Payment Details */}
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setShowAdvanced(!showAdvanced)}
          activeOpacity={0.7}
        >
          <Text style={styles.collapsibleTitle}>Payment Details (Optional)</Text>
          <ChevronDown
            color={colors.textSecondary}
            size={18}
            style={showAdvanced && styles.chevronRotated}
          />
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.advancedSection}>
            <Controller
              control={control}
              name="payment_app"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Payment App"
                  placeholder="e.g. Google Pay, PhonePe, Paytm"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <Controller
              control={control}
              name="upi_vpa"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="UPI VPA"
                  placeholder="e.g. merchant@okaxis"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />

            <Controller
              control={control}
              name="upi_reference_id"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="UPI Reference / Transaction ID"
                  placeholder="e.g. 123456789012"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />
          </View>
        )}

        {/* Submit Button */}
        <Button
          title="Save Transaction"
          onPress={handleSubmit(onSubmit)}
          loading={createMutation.isPending || isSubmitting}
          style={styles.submitButton}
        />

        {/* Category Picker Modal */}
        <CategoryPickerModal
          visible={categoryModalVisible}
          selectedCategoryId={selectedCategoryId}
          onSelect={(cat) => setValue('category_id', cat ? cat.id : null)}
          onClose={() => setCategoryModalVisible(false)}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
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
  headerRightPlaceholder: {
    width: 28,
  },
  errorBanner: {
    marginBottom: spacing.md,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    marginBottom: spacing.xs,
  },
  categoryPickerButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  pickerText: {
    color: colors.text,
    fontSize: fontSizes.base,
  },
  pickerPlaceholder: {
    color: colors.textMuted,
  },
  textAreaContainer: {
    marginBottom: spacing.md,
  },
  textArea: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  collapsibleTitle: {
    color: colors.brandLight,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  advancedSection: {
    paddingLeft: spacing.xs,
    marginBottom: spacing.md,
  },
  submitButton: {
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
  defaultCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  checkboxActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  defaultCheckboxText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    flex: 1,
  },
  merchantHighlight: {
    color: colors.brandLight,
    fontWeight: fontWeights.semibold,
  },
  adjustmentSection: {
    marginBottom: spacing.md,
  },
  splitInputContainer: {
    marginTop: spacing.xs,
    paddingLeft: spacing.md,
  },
});
