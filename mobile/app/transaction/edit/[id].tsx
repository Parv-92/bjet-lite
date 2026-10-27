/**
 * Bjet Mobile - Edit Transaction Screen
 * Allows editing amount, merchant name, category, and notes.
 * Does NOT allow changing transaction status (generic PUT lifecycle protection).
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ChevronRight, ReceiptText, Check } from 'lucide-react-native';
import { ScreenContainer } from '../../../src/components/common/ScreenContainer';
import { Input } from '../../../src/components/ui/Input';
import { Button } from '../../../src/components/ui/Button';
import { ErrorMessage } from '../../../src/components/ui/ErrorMessage';
import { LoadingSpinner } from '../../../src/components/ui/LoadingSpinner';
import { EmptyState } from '../../../src/components/common/EmptyState';
import { CategoryPickerModal } from '../../../src/components/transactions/CategoryPickerModal';
import { useTransaction } from '../../../src/hooks/useTransaction';
import { useUpdateTransaction } from '../../../src/hooks/useTransactionMutations';
import { useCategories } from '../../../src/hooks/useCategories';
import { getApiErrorMessage } from '../../../src/api/client';
import { colors } from '../../../src/theme/colors';
import { spacing, radii } from '../../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../../src/theme/typography';

const editTransactionSchema = z
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
    is_reimbursement: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.paid_for_someone_else) {
        if (!data.amount_paid_for_someone_else || data.amount_paid_for_someone_else.trim() === '') {
          return false;
        }
        const paidVal = parseFloat(data.amount_paid_for_someone_else);
        const totalVal = parseFloat(data.amount);
        if (isNaN(paidVal) || paidVal <= 0) return false;
        if (!isNaN(totalVal) && paidVal > totalVal) return false;
      }
      return true;
    },
    {
      message: 'Amount paid for others must be greater than 0 and cannot exceed total amount',
      path: ['amount_paid_for_someone_else'],
    }
  );

type EditTransactionFormData = z.infer<typeof editTransactionSchema>;

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transactionId = Number(id);

  const { data: tx, isLoading, error: fetchError } = useTransaction(transactionId);
  const updateMutation = useUpdateTransaction();
  const { data: categories } = useCategories();

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditTransactionFormData>({
    resolver: zodResolver(editTransactionSchema),
    defaultValues: {
      amount: '',
      merchant_raw_name: '',
      category_id: null,
      notes: '',
      set_as_merchant_default: false,
      paid_for_someone_else: false,
      amount_paid_for_someone_else: '',
      is_reimbursement: false,
    },
  });

  // Populate form with existing transaction data
  useEffect(() => {
    if (tx) {
      const hasPaidForOthers = !!(
        tx.amount_paid_for_someone_else &&
        parseFloat(tx.amount_paid_for_someone_else) > 0
      );
      reset({
        amount: typeof tx.amount === 'string' ? parseFloat(tx.amount).toString() : String(tx.amount),
        merchant_raw_name: tx.merchant_raw_name || tx.merchant?.name || '',
        category_id: tx.category_id || (tx.category ? tx.category.id : null),
        notes: tx.notes || '',
        set_as_merchant_default: false,
        paid_for_someone_else: hasPaidForOthers,
        amount_paid_for_someone_else: hasPaidForOthers && tx.amount_paid_for_someone_else
          ? parseFloat(tx.amount_paid_for_someone_else).toString()
          : '',
        is_reimbursement: Boolean(tx.is_reimbursement),
      });
    }
  }, [tx, reset]);

  const selectedCategoryId = watch('category_id');
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);
  const watchedMerchant = watch('merchant_raw_name');
  const merchantName = (watchedMerchant || tx?.merchant?.name || tx?.merchant_raw_name || '').trim();

  const onSubmit = async (values: EditTransactionFormData) => {
    setApiError(null);
    try {
      const paidForSomeoneElse = !!values.paid_for_someone_else;
      const paidAmount = paidForSomeoneElse && values.amount_paid_for_someone_else
        ? parseFloat(values.amount_paid_for_someone_else)
        : null;

      await updateMutation.mutateAsync({
        id: transactionId,
        data: {
          amount: parseFloat(values.amount),
          merchant_raw_name: values.merchant_raw_name?.trim() || null,
          category_id: values.category_id !== undefined ? values.category_id : null,
          notes: values.notes?.trim() || null,
          set_as_merchant_default: !!values.set_as_merchant_default,
          amount_paid_for_someone_else: paidAmount,
          is_reimbursement: tx?.direction === 'RECEIVED' ? values.is_reimbursement : undefined,
        },
      });
      router.back();
    } catch (err: any) {
      setApiError(getApiErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading transaction details..." />
        </View>
      </ScreenContainer>
    );
  }

  if (fetchError || !tx) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft color={colors.text} size={22} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon={<ReceiptText color={colors.danger} size={48} />}
          title="Transaction Not Found"
          description={fetchError?.message || 'Unable to load transaction.'}
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </ScreenContainer>
    );
  }

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
          <Text style={styles.headerTitle}>Edit Transaction</Text>
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

        {/* Paid for someone else (Outgoing expenses only) */}
        {tx && tx.direction !== 'RECEIVED' && (
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
              <View style={styles.paidForElseContainer}>
                <Controller
                  control={control}
                  name="amount_paid_for_someone_else"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Amount Paid for Others (₹) *"
                      placeholder="e.g. 500"
                      keyboardType="decimal-pad"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={errors.amount_paid_for_someone_else?.message}
                    />
                  )}
                />
                {(() => {
                  const total = parseFloat(watch('amount') || '0');
                  const paid = parseFloat(watch('amount_paid_for_someone_else') || '0');
                  if (!isNaN(total) && !isNaN(paid) && paid > 0 && paid <= total) {
                    return (
                      <Text style={styles.netShareNotice}>
                        Your personal spending share:{' '}
                        <Text style={styles.netShareHighlight}>
                          ₹{(total - paid).toFixed(2)}
                        </Text>
                      </Text>
                    );
                  }
                  return null;
                })()}
              </View>
            )}
          </View>
        )}

        {/* Incoming Reimbursement Toggle (Received transactions only) */}
        {tx && tx.direction === 'RECEIVED' && (
          <View style={styles.adjustmentSection}>
            <Controller
              control={control}
              name="is_reimbursement"
              render={({ field: { value, onChange } }) => (
                <TouchableOpacity
                  style={styles.defaultCheckboxRow}
                  onPress={() => onChange(!value)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: !!value }}
                >
                  <View style={[styles.checkbox, value && styles.checkboxActive]}>
                    {value && <Check color={colors.background} size={14} strokeWidth={3} />}
                  </View>
                  <Text style={styles.defaultCheckboxText}>
                    This payment is a Category Reimbursement (reduces spending)
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

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

        {/* Save Button */}
        <Button
          title="Update Transaction"
          onPress={handleSubmit(onSubmit)}
          loading={updateMutation.isPending || isSubmitting}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  submitButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
  defaultCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: 2,
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  adjustmentSection: {
    marginBottom: spacing.xs,
  },
  paidForElseContainer: {
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  netShareNotice: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
  },
  netShareHighlight: {
    color: colors.brandLight,
    fontWeight: fontWeights.bold,
  },
});
