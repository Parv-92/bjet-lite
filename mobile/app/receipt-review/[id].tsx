/**
 * Bjet Mobile - Single Receipt Review & Confirmation Screen (Phase 7)
 *
 * Route: /receipt-review/[id]
 *
 * Dedicated review screen for draft transactions created from receipt scans
 * (status: PENDING_CONFIRMATION).
 *
 * Requirements:
 * - Fetches draft transaction details.
 * - Allows user review and editing of amount, merchant name, category, and notes.
 * - Category suggestion is clearly presented as ADVISORY ONLY (Safeguard 2).
 * - Confirmation is performed strictly through the dedicated endpoint:
 *   POST /api/v1/transactions/{id}/confirm
 * - Invalidates transactions and budget caches upon confirmation.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ReceiptText,
  CheckCircle2,
  Tag,
  Store,
  Calendar,
  AlertCircle,
  FileCheck,
  Check,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { CategoryPickerModal } from '../../src/components/transactions/CategoryPickerModal';
import { useTransaction } from '../../src/hooks/useTransaction';
import { useCategories } from '../../src/hooks/useCategories';
import { useConfirmTransaction } from '../../src/hooks/useConfirmTransaction';
import { getApiErrorMessage } from '../../src/api/client';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function ReceiptReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const transactionId = Number(id);

  const { data: tx, isLoading, error: fetchError } = useTransaction(transactionId);
  const { data: categories } = useCategories();
  const confirmMutation = useConfirmTransaction();

  // Form State
  const [amountStr, setAmountStr] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState('');
  const [notes, setNotes] = useState('');
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isConfirmedSuccess, setIsConfirmedSuccess] = useState(false);

  useEffect(() => {
    if (tx) {
      setAmountStr(tx.amount !== undefined ? String(tx.amount) : '');
      setMerchantName(tx.merchant?.clean_name || tx.merchant_raw_name || '');
      setSelectedCategoryId(tx.category_id || null);
      if (tx.category) {
        setSelectedCategoryName(tx.category.name);
      }
      setTimestamp(tx.timestamp || new Date().toISOString());
      setIsReimbursement(Boolean(tx.is_reimbursement));
    }
  }, [tx]);

  // Sync category name when categories load or selection changes
  useEffect(() => {
    if (selectedCategoryId && categories) {
      const found = categories.find((c) => c.id === selectedCategoryId);
      if (found) setSelectedCategoryName(found.name);
    }
  }, [selectedCategoryId, categories]);

  const handleBack = () => {
    router.back();
  };

  const handleConfirm = async () => {
    setSubmitError(null);

    const numAmount = parseFloat(amountStr);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert('Category Required', 'Please assign a category before confirming this transaction.');
      return;
    }

    try {
      await confirmMutation.mutateAsync({
        id: transactionId,
        data: {
          amount: numAmount,
          category_id: selectedCategoryId,
          timestamp: timestamp || new Date().toISOString(),
          merchant_name: merchantName.trim() || undefined,
          notes: notes.trim() || undefined,
          is_reimbursement: isReimbursement,
        },
      });

      setIsConfirmedSuccess(true);
    } catch (err: any) {
      setSubmitError(getApiErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <LoadingSpinner size="large" label="Loading draft receipt..." />
      </ScreenContainer>
    );
  }

  if (fetchError || !tx) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <AlertCircle color={colors.danger} size={48} />
          <Text style={styles.errorTitle}>Transaction Not Found</Text>
          <Text style={styles.errorMessage}>
            {fetchError ? getApiErrorMessage(fetchError) : 'Could not locate draft transaction.'}
          </Text>
          <Button title="Back to Scan" onPress={handleBack} variant="secondary" />
        </View>
      </ScreenContainer>
    );
  }

  // Already confirmed state
  if (tx.status === 'CONFIRMED' && !isConfirmedSuccess) {
    return (
      <ScreenContainer scrollable>
        <Card style={styles.confirmedNoticeCard}>
          <FileCheck color={colors.brandLight} size={40} />
          <Text style={styles.confirmedNoticeTitle}>Already Confirmed</Text>
          <Text style={styles.confirmedNoticeDesc}>
            This receipt transaction has already been confirmed and applied to your budget.
          </Text>
          <Button
            title="View Transaction Details"
            onPress={() => router.replace(`/transaction/${transactionId}` as any)}
            variant="primary"
            style={styles.fullWidth}
          />
        </Card>
      </ScreenContainer>
    );
  }

  // Success state after confirmation
  if (isConfirmedSuccess) {
    return (
      <ScreenContainer>
        <Card style={styles.successCard}>
          <View style={styles.successCircle}>
            <CheckCircle2 color={colors.brandLight} size={48} />
          </View>
          <Text style={styles.successTitle}>Transaction Confirmed!</Text>
          <Text style={styles.successSubtitle}>
            Receipt #{transactionId} is now confirmed and recorded into your transactions and budget.
          </Text>
          <View style={styles.successActions}>
            <Button
              title="View in Transactions"
              onPress={() => router.replace(`/transaction/${transactionId}` as any)}
              variant="primary"
              style={styles.fullWidth}
            />
            <Button
              title="Scan Another Receipt"
              onPress={() => router.replace('/(tabs)/scan' as any)}
              variant="secondary"
              style={styles.fullWidth}
            />
          </View>
        </Card>
      </ScreenContainer>
    );
  }

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
            <Text style={styles.screenTitle}>Review Receipt</Text>
            <Text style={styles.screenSubtitle}>Draft #{transactionId}</Text>
          </View>
        </View>

        {/* Error Banner */}
        {submitError && (
          <ErrorMessage message={submitError} style={styles.errorBanner} />
        )}

        {/* Advisory Banner (Safeguard 2) */}
        <View style={styles.advisoryBanner}>
          <ReceiptText color={colors.info} size={18} />
          <View style={styles.advisoryBannerTextContainer}>
            <Text style={styles.advisoryBannerTitle}>Advisory Suggestions</Text>
            <Text style={styles.advisoryBannerText}>
              Extracted details and category are advisory. Please review, edit as needed,
              and confirm to persist into your budget.
            </Text>
          </View>
        </View>

        {/* Review Form Card */}
        <Card style={styles.formCard}>
          {/* Amount Field */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Merchant Field */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Merchant / Payee</Text>
            <View style={styles.inputWithIcon}>
              <Store color={colors.textSecondary} size={18} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, styles.inputFlex]}
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="Merchant name"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Category Field */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Category (Required for confirmation)</Text>
            <TouchableOpacity
              style={styles.categoryPickerButton}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Tag color={colors.brandLight} size={18} />
              <Text
                style={[
                  styles.categoryPickerText,
                  !selectedCategoryName && styles.textPlaceholder,
                ]}
              >
                {selectedCategoryName || 'Select a Category'}
              </Text>
              <Text style={styles.changeCategoryText}>Select</Text>
            </TouchableOpacity>
          </View>

          {/* Category Reimbursement Toggle */}
          <TouchableOpacity
            style={styles.reimbursementToggleRow}
            onPress={() => setIsReimbursement(!isReimbursement)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isReimbursement }}
          >
            <View style={[styles.checkbox, isReimbursement && styles.checkboxActive]}>
              {isReimbursement && <Check color={colors.background} size={14} strokeWidth={3} />}
            </View>
            <View style={styles.reimbursementToggleTextContainer}>
              <Text style={styles.reimbursementToggleTitle}>
                This payment reduces my spending (Reimbursement)
              </Text>
              <Text style={styles.reimbursementToggleSubtitle}>
                Offsets your {selectedCategoryName || 'selected category'} expenditure
              </Text>
            </View>
          </TouchableOpacity>

          {/* Timestamp Field */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Transaction Date & Time</Text>
            <View style={styles.inputWithIcon}>
              <Calendar color={colors.textSecondary} size={18} style={styles.fieldIcon} />
              <TextInput
                style={[styles.input, styles.inputFlex]}
                value={timestamp}
                onChangeText={setTimestamp}
                placeholder="YYYY-MM-DDTHH:MM:SSZ"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          {/* Notes Field */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add personal notes or context..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Button
            title={confirmMutation.isPending ? 'Confirming...' : 'Confirm Transaction'}
            icon={<CheckCircle2 color={colors.background} size={18} />}
            onPress={handleConfirm}
            disabled={confirmMutation.isPending}
            variant="primary"
            style={styles.fullWidth}
          />
          <Button
            title="Cancel & Keep Draft"
            onPress={handleBack}
            variant="secondary"
            style={styles.fullWidth}
          />
        </View>

        {/* Category Picker Sheet */}
        <CategoryPickerModal
          visible={showCategoryPicker}
          selectedCategoryId={selectedCategoryId}
          onSelect={(cat) => {
            setSelectedCategoryId(cat ? cat.id : null);
            setSelectedCategoryName(cat ? cat.name : null);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
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
  advisoryBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.28)',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  advisoryBannerTextContainer: {
    flex: 1,
  },
  advisoryBannerTitle: {
    color: colors.info,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    marginBottom: 2,
  },
  advisoryBannerText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
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
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingLeft: spacing.md,
  },
  fieldIcon: {
    marginRight: spacing.xs,
  },
  inputFlex: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  categoryPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  categoryPickerText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.base,
    marginLeft: spacing.sm,
  },
  textPlaceholder: {
    color: colors.textMuted,
  },
  changeCategoryText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  actionsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  fullWidth: {
    width: '100%',
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
  confirmedNoticeCard: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  confirmedNoticeTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  confirmedNoticeDesc: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  successCard: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  successSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  successActions: {
    width: '100%',
    gap: spacing.sm,
  },
  reimbursementToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
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
  reimbursementToggleTextContainer: {
    flex: 1,
  },
  reimbursementToggleTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semiBold,
  },
  reimbursementToggleSubtitle: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
});
