/**
 * Bjet Mobile - Candidate Edit Modal (Phase 7)
 *
 * Allows in-place review and editing of an individual transaction candidate.
 *
 * Requirements:
 * - Safeguard 2: Category suggestions are ADVISORY ONLY.
 *   SuggestedCategory != confirmed category.
 *   Candidates remain editable and the user can change the category before
 *   any future persistence workflow.
 * - Allows modifying merchant name, amount, direction, advisory category, notes,
 *   and inclusion/exclusion status.
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  X,
  Check,
  Tag,
  Info,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Trash2,
  ShieldCheck,
} from 'lucide-react-native';
import { TransactionCandidate, CandidateDirection } from '../../types/receiptInterpretation';
import { CategoryPickerModal } from '../transactions/CategoryPickerModal';
import { Button } from '../ui/Button';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface CandidateEditModalProps {
  visible: boolean;
  candidate: TransactionCandidate | null;
  onClose: () => void;
  onSave: (updatedCandidate: TransactionCandidate) => void;
}

export const CandidateEditModal: React.FC<CandidateEditModalProps> = ({
  visible,
  candidate,
  onClose,
  onSave,
}) => {
  const [merchantName, setMerchantName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [direction, setDirection] = useState<CandidateDirection>('SENT');
  const [categoryId, setCategoryId] = useState<number | null | undefined>(null);
  const [categoryName, setCategoryName] = useState<string | null | undefined>(null);
  const [notes, setNotes] = useState('');
  const [isExcluded, setIsExcluded] = useState(false);
  const [isReimbursement, setIsReimbursement] = useState(false);
  const [friendName, setFriendName] = useState<string | null>(null);
  const [friendId, setFriendId] = useState<number | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (candidate) {
      setMerchantName(
        candidate.counterpartyName || candidate.merchantRawName || ''
      );
      setAmountStr(
        candidate.amount !== undefined ? candidate.amount.toString() : ''
      );
      setDirection(candidate.direction || 'SENT');
      setCategoryId(candidate.selectedCategoryId ?? candidate.suggestedCategoryId);
      setCategoryName(candidate.suggestedCategoryName);
      setNotes(candidate.notes || '');
      setIsExcluded(candidate.reviewStatus === 'EXCLUDED');
      setIsReimbursement(!!candidate.isReimbursement);
      setFriendName(candidate.friendName || null);
      setFriendId(candidate.friendId || null);
    }
  }, [candidate, visible]);

  if (!candidate) return null;

  const handleSave = () => {
    const numAmount = parseFloat(amountStr);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive number for the amount.');
      return;
    }

    if (!merchantName.trim()) {
      Alert.alert('Invalid Merchant', 'Please enter a counterparty or merchant name.');
      return;
    }

    const updated: TransactionCandidate = {
      ...candidate,
      counterpartyName: merchantName.trim(),
      amount: numAmount,
      direction,
      suggestedCategoryId: categoryId,
      suggestedCategoryName: categoryName,
      selectedCategoryId: categoryId,
      notes: notes.trim() || undefined,
      isReimbursement: direction === 'RECEIVED' ? isReimbursement : false,
      friendId: direction === 'RECEIVED' ? friendId : null,
      friendName: direction === 'RECEIVED' ? friendName : null,
      reviewStatus: isExcluded ? 'EXCLUDED' : 'EDITED',
    };

    onSave(updated);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flexOne}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Edit Candidate</Text>
              <Text style={styles.headerSubtitle}>
                {candidate.upiTransactionId
                  ? `UPI Reference: ${candidate.upiTransactionId}`
                  : `ID: ${candidate.localId}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close modal"
            >
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {/* Advisory Category Notice Banner */}
            <View style={styles.advisoryNotice}>
              <Info color={colors.info} size={16} />
              <Text style={styles.advisoryNoticeText}>
                Category suggestions are advisory only. Candidates remain editable and
                unconfirmed until submitted through future persistence workflows.
              </Text>
            </View>

            {/* Merchant / Counterparty */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Merchant / Counterparty</Text>
              <TextInput
                style={styles.input}
                value={merchantName}
                onChangeText={setMerchantName}
                placeholder="Merchant name"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Amount */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Direction Selector */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Direction</Text>
              <View style={styles.directionRow}>
                <TouchableOpacity
                  style={[
                    styles.directionChip,
                    direction === 'SENT' && styles.directionChipActiveSent,
                  ]}
                  onPress={() => setDirection('SENT')}
                >
                  <ArrowUpRight
                    color={direction === 'SENT' ? colors.text : colors.textSecondary}
                    size={16}
                  />
                  <Text
                    style={[
                      styles.directionChipText,
                      direction === 'SENT' && styles.directionChipTextActive,
                    ]}
                  >
                    Sent
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.directionChip,
                    direction === 'RECEIVED' && styles.directionChipActiveRecv,
                  ]}
                  onPress={() => setDirection('RECEIVED')}
                >
                  <ArrowDownLeft
                    color={direction === 'RECEIVED' ? colors.success : colors.textSecondary}
                    size={16}
                  />
                  <Text
                    style={[
                      styles.directionChipText,
                      direction === 'RECEIVED' && styles.directionChipTextActiveRecv,
                    ]}
                  >
                    Received
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.directionChip,
                    direction === 'TOP_UP' && styles.directionChipActiveTopUp,
                  ]}
                  onPress={() => setDirection('TOP_UP')}
                >
                  <RefreshCw
                    color={direction === 'TOP_UP' ? colors.info : colors.textSecondary}
                    size={16}
                  />
                  <Text
                    style={[
                      styles.directionChipText,
                      direction === 'TOP_UP' && styles.directionChipTextActiveTopUp,
                    ]}
                  >
                    UPI Lite
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reimbursement Toggle for RECEIVED transactions */}
            {direction === 'RECEIVED' && (
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={[
                    styles.reimbursementToggle,
                    isReimbursement && styles.reimbursementToggleActive,
                  ]}
                  onPress={() => setIsReimbursement(prev => !prev)}
                >
                  <View style={[styles.checkbox, isReimbursement && styles.checkboxActive]}>
                    {isReimbursement && <Check color={colors.background} size={14} strokeWidth={3} />}
                  </View>
                  <View style={styles.reimbursementTextContainer}>
                    <Text style={styles.reimbursementTitle}>
                      Mark as Reimbursement
                      {friendName ? ` (from ${friendName})` : ''}
                    </Text>
                    <Text style={styles.reimbursementSubtitle}>
                      Offsets personal spending in the selected category
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Advisory Category Selection (for expenses and reimbursements) */}
            {(direction === 'SENT' || (direction === 'RECEIVED' && isReimbursement)) && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {direction === 'RECEIVED' ? 'Offset Category' : 'Advisory Category'}
                </Text>
                <TouchableOpacity
                  style={styles.categorySelector}
                  onPress={() => setShowCategoryPicker(true)}
                >
                  <Tag color={colors.brandLight} size={18} />
                  <Text style={styles.categorySelectorText}>
                    {categoryName ? categoryName : 'Select Category'}
                  </Text>
                  <Text style={styles.categorySelectorSub}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TOP_UP Notice */}
            {direction === 'TOP_UP' && (
              <View style={styles.topUpNotice}>
                <RefreshCw color={colors.info} size={16} />
                <Text style={styles.topUpNoticeText}>
                  UPI Lite top-ups are internal wallet transfers, not expenses. They contribute ₹0 to spending and have no category.
                </Text>
              </View>
            )}

            {/* Notes */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes for this transaction..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Exclusion Toggle */}
            <View style={styles.exclusionContainer}>
              <TouchableOpacity
                style={[
                  styles.exclusionToggle,
                  isExcluded && styles.exclusionToggleActive,
                ]}
                onPress={() => setIsExcluded(prev => !prev)}
              >
                <Trash2
                  color={isExcluded ? colors.danger : colors.textSecondary}
                  size={18}
                />
                <Text
                  style={[
                    styles.exclusionToggleText,
                    isExcluded && styles.exclusionToggleTextActive,
                  ]}
                >
                  {isExcluded
                    ? 'Candidate Excluded from Import'
                    : 'Exclude This Candidate'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            <Button
              title="Save Changes"
              variant="primary"
              onPress={handleSave}
              style={styles.footerButton}
            />
          </View>
        </KeyboardAvoidingView>

        {/* Category Picker Modal */}
        <CategoryPickerModal
          visible={showCategoryPicker}
          selectedCategoryId={categoryId}
          onSelect={(cat) => {
            setCategoryId(cat ? cat.id : null);
            setCategoryName(cat ? cat.name : null);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  closeButton: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.full,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  advisoryNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  advisoryNoticeText: {
    flex: 1,
    color: colors.info,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  formGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: fontSizes.base,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  directionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  directionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
  },
  directionChipActiveSent: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.textSecondary,
  },
  directionChipActiveRecv: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: colors.success,
  },
  directionChipActiveTopUp: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: colors.info,
  },
  directionChipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  directionChipTextActive: {
    color: colors.text,
    fontWeight: fontWeights.bold,
  },
  directionChipTextActiveRecv: {
    color: colors.success,
    fontWeight: fontWeights.bold,
  },
  directionChipTextActiveTopUp: {
    color: colors.info,
    fontWeight: fontWeights.bold,
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  categorySelectorText: {
    flex: 1,
    marginLeft: spacing.sm,
    color: colors.text,
    fontSize: fontSizes.base,
  },
  categorySelectorSub: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  exclusionContainer: {
    marginTop: spacing.xs,
  },
  exclusionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  exclusionToggleActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  exclusionToggleText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  exclusionToggleTextActive: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerButton: {
    width: '100%',
  },
  reimbursementToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  reimbursementToggleActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  reimbursementTextContainer: {
    flex: 1,
  },
  reimbursementTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  reimbursementSubtitle: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  topUpNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  topUpNoticeText: {
    flex: 1,
    color: colors.info,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
});
