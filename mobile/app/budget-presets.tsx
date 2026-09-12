/**
 * Bjet Mobile - Budget Presets Screen (Phase 14)
 * Allows users to create, edit, delete, and apply reusable monthly budget templates.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Plus,
  Sliders,
  Trash2,
  Edit2,
  X,
  Calendar,
  Send,
  Check,
} from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { EmptyState } from '../src/components/common/EmptyState';
import {
  useBudgetPresets,
  useCreateBudgetPreset,
  useUpdateBudgetPreset,
  useDeleteBudgetPreset,
  useApplyBudgetPreset,
} from '../src/hooks/useBudgetPresets';
import { useCategories } from '../src/hooks/useCategories';
import { BudgetPreset, CreateBudgetPresetItemRequest } from '../src/types/api';
import { getApiErrorMessage } from '../src/api/client';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface FormItem {
  category_id: number;
  amount: string;
}

export default function BudgetPresetsScreen() {
  const router = useRouter();
  const { data: presets, isLoading, error, refetch, isRefetching } = useBudgetPresets();
  const { data: categories } = useCategories();

  const createMutation = useCreateBudgetPreset();
  const updateMutation = useUpdateBudgetPreset();
  const deleteMutation = useDeleteBudgetPreset();
  const applyMutation = useApplyBudgetPreset();

  // Create / Edit Modal State
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingPreset, setEditingPreset] = useState<BudgetPreset | null>(null);
  const [formName, setFormName] = useState('');
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [editorError, setEditorError] = useState<string | null>(null);

  // Apply Modal State
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [selectedPresetToApply, setSelectedPresetToApply] = useState<BudgetPreset | null>(null);
  const now = new Date();
  const [applyMonth, setApplyMonth] = useState(now.getMonth() + 1);
  const [applyYear, setApplyYear] = useState(now.getFullYear());
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingPreset(null);
    setFormName('');
    const initialItems = (categories || []).slice(0, 3).map((c) => ({
      category_id: c.id,
      amount: '5000',
    }));
    setFormItems(initialItems);
    setEditorError(null);
    setEditorVisible(true);
  };

  const openEditModal = (preset: BudgetPreset) => {
    setEditingPreset(preset);
    setFormName(preset.name);
    setFormItems(
      preset.items.map((item) => ({
        category_id: item.category_id,
        amount: String(parseFloat(item.amount) || ''),
      }))
    );
    setEditorError(null);
    setEditorVisible(true);
  };

  const handleAddItemRow = () => {
    if (!categories || categories.length === 0) return;
    // Pick first unused category if possible
    const usedCatIds = new Set(formItems.map((it) => it.category_id));
    const available = categories.find((c) => !usedCatIds.has(c.id)) || categories[0];
    setFormItems([...formItems, { category_id: available.id, amount: '1000' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: 'category_id' | 'amount', value: any) => {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormItems(updated);
  };

  const handleSavePreset = async () => {
    setEditorError(null);
    const cleanName = formName.trim();
    if (!cleanName) {
      setEditorError('Please enter a preset name.');
      return;
    }
    if (formItems.length === 0) {
      setEditorError('Please add at least one category limit.');
      return;
    }

    const payloadItems: CreateBudgetPresetItemRequest[] = [];
    const seenCat = new Set<number>();
    for (const item of formItems) {
      if (seenCat.has(item.category_id)) {
        setEditorError('Each category can only be added once in a preset.');
        return;
      }
      seenCat.add(item.category_id);
      const parsedAmount = parseFloat(item.amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setEditorError('Each category limit must be greater than 0.');
        return;
      }
      payloadItems.push({ category_id: item.category_id, amount: parsedAmount });
    }

    try {
      if (editingPreset) {
        await updateMutation.mutateAsync({
          id: editingPreset.id,
          data: { name: cleanName, items: payloadItems },
        });
      } else {
        await createMutation.mutateAsync({
          name: cleanName,
          items: payloadItems,
        });
      }
      setEditorVisible(false);
    } catch (err: unknown) {
      setEditorError(getApiErrorMessage(err));
    }
  };

  const handleDeletePreset = (preset: BudgetPreset) => {
    Alert.alert(
      'Delete Budget Preset',
      `Are you sure you want to delete "${preset.name}"?\n\nThis will NOT modify any monthly budgets previously created from this preset.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(preset.id);
            } catch (err: unknown) {
              Alert.alert('Cannot Delete', getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const openApplyModal = (preset: BudgetPreset) => {
    setSelectedPresetToApply(preset);
    setApplyMonth(now.getMonth() + 1);
    setApplyYear(now.getFullYear());
    setApplySuccessMsg(null);
    setApplyModalVisible(true);
  };

  const handleConfirmApply = async () => {
    if (!selectedPresetToApply) return;
    try {
      await applyMutation.mutateAsync({
        id: selectedPresetToApply.id,
        data: { month: applyMonth, year: applyYear },
      });
      setApplySuccessMsg(
        `Successfully applied "${selectedPresetToApply.name}" to ${MONTH_NAMES[applyMonth - 1]} ${applyYear}!`
      );
      setTimeout(() => {
        setApplyModalVisible(false);
        setApplySuccessMsg(null);
      }, 1200);
    } catch (err: unknown) {
      Alert.alert('Cannot Apply Preset', getApiErrorMessage(err));
    }
  };

  const formatCurrency = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return `₹${num.toLocaleString('en-IN')}`;
  };

  return (
    <ScreenContainer scrollable={false}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Budget Presets</Text>
            <Text style={styles.subtitle}>Reusable monthly category templates</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal} activeOpacity={0.8}>
          <Plus size={18} color={colors.background} strokeWidth={2.5} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Main List Area */}
      {isLoading && !isRefetching ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading presets..." />
        </View>
      ) : error ? (
        <EmptyState
          icon={<Sliders color={colors.danger} size={48} />}
          title="Failed to Load"
          description={getApiErrorMessage(error)}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : !presets || presets.length === 0 ? (
        <EmptyState
          icon={<Sliders color={colors.brandLight} size={48} />}
          title="No Presets Created"
          description="Create reusable budget templates (e.g. 'College Month' or 'Travel Month') and apply them instantly to any month."
          actionLabel="Create Preset"
          onAction={openAddModal}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.brandLight}
              colors={[colors.brandLight]}
            />
          }
        >
          {presets.map((preset) => (
            <Card key={preset.id} style={styles.card}>
              <View style={styles.presetHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetMeta}>
                    {preset.items.length} category limit{preset.items.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    onPress={() => openEditModal(preset)}
                    style={styles.iconButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Edit2 size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeletePreset(preset)}
                    style={[styles.iconButton, { marginLeft: spacing.xs }]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Items Breakdown */}
              <View style={styles.itemsContainer}>
                {preset.items.map((item) => {
                  const catName = item.category?.name || `Category #${item.category_id}`;
                  const catColor = item.category?.color || colors.textMuted;
                  return (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={styles.itemLeft}>
                        <View style={[styles.dot, { backgroundColor: catColor }]} />
                        <Text style={styles.itemCategoryName} numberOfLines={1}>
                          {catName}
                        </Text>
                      </View>
                      <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Apply Action Button */}
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => openApplyModal(preset)}
                activeOpacity={0.8}
              >
                <Send size={14} color={colors.brandLight} style={{ marginRight: 6 }} />
                <Text style={styles.applyButtonText}>Apply to Month</Text>
              </TouchableOpacity>
            </Card>
          ))}
        </ScrollView>
      )}

      {/* Create / Edit Preset Modal */}
      <Modal
        visible={editorVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditorVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPreset ? 'Edit Budget Preset' : 'Create Budget Preset'}
              </Text>
              <TouchableOpacity
                onPress={() => setEditorVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editorError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{editorError}</Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Preset Name</Text>
                <TextInput
                  style={styles.input}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g. College Month"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.formGroup}>
                <View style={styles.itemsHeaderRow}>
                  <Text style={styles.formLabel}>Category Limits</Text>
                  <TouchableOpacity
                    onPress={handleAddItemRow}
                    style={styles.addItemButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Plus size={14} color={colors.brandLight} />
                    <Text style={styles.addItemText}>Add Category</Text>
                  </TouchableOpacity>
                </View>

                {formItems.map((item, idx) => (
                  <View key={idx} style={styles.formItemRow}>
                    <View style={styles.categoryDropdownContainer}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.categoryChipRow}>
                          {(categories || []).map((cat) => {
                            const isSelected = cat.id === item.category_id;
                            return (
                              <TouchableOpacity
                                key={cat.id}
                                style={[
                                  styles.pickerChip,
                                  isSelected && {
                                    backgroundColor: `${cat.color || colors.brandLight}25`,
                                    borderColor: cat.color || colors.brandLight,
                                  },
                                ]}
                                onPress={() => handleItemChange(idx, 'category_id', cat.id)}
                              >
                                <Text
                                  style={[
                                    styles.pickerChipText,
                                    isSelected && { color: cat.color || colors.brandLight },
                                  ]}
                                >
                                  {cat.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                    <View style={styles.amountInputRow}>
                      <Text style={styles.currencyPrefix}>₹</Text>
                      <TextInput
                        style={styles.itemAmountInput}
                        value={item.amount}
                        onChangeText={(txt) => handleItemChange(idx, 'amount', txt)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                      />
                      {formItems.length > 1 && (
                        <TouchableOpacity
                          onPress={() => handleRemoveItemRow(idx)}
                          style={styles.removeItemButton}
                        >
                          <X size={16} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setEditorVisible(false)}
                style={{ flex: 1, marginRight: spacing.sm }}
              />
              <Button
                title={editingPreset ? 'Update Preset' : 'Save Preset'}
                onPress={handleSavePreset}
                loading={createMutation.isPending || updateMutation.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Apply Preset Modal */}
      <Modal
        visible={applyModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setApplyModalVisible(false)}
      >
        <View style={styles.applyModalOverlay}>
          <View style={styles.applyModalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply Budget Preset</Text>
              <TouchableOpacity
                onPress={() => setApplyModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.applySubtitle}>
              Apply "{selectedPresetToApply?.name}" to target monthly budget:
            </Text>

            {applySuccessMsg ? (
              <View style={styles.successBox}>
                <Check size={18} color={colors.brandLight} style={{ marginRight: 6 }} />
                <Text style={styles.successText}>{applySuccessMsg}</Text>
              </View>
            ) : (
              <>
                <View style={styles.monthSelectorBox}>
                  <Text style={styles.monthLabel}>Target Month:</Text>
                  <View style={styles.monthChipsContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {MONTH_NAMES.map((mName, i) => {
                        const mNum = i + 1;
                        const isSel = mNum === applyMonth;
                        return (
                          <TouchableOpacity
                            key={mNum}
                            style={[styles.monthChip, isSel && styles.monthChipActive]}
                            onPress={() => setApplyMonth(mNum)}
                          >
                            <Text
                              style={[
                                styles.monthChipText,
                                isSel && styles.monthChipTextActive,
                              ]}
                            >
                              {mName.slice(0, 3)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.yearRow}>
                  <Text style={styles.monthLabel}>Target Year:</Text>
                  <View style={styles.yearButtons}>
                    {[applyYear - 1, applyYear, applyYear + 1].map((y) => (
                      <TouchableOpacity
                        key={y}
                        style={[styles.yearChip, y === applyYear && styles.yearChipActive]}
                        onPress={() => setApplyYear(y)}
                      >
                        <Text
                          style={[styles.yearChipText, y === applyYear && styles.yearChipTextActive]}
                        >
                          {y}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.applyNoticeBox}>
                  <Text style={styles.applyNoticeText}>
                    Applying will copy category limits into {MONTH_NAMES[applyMonth - 1]} {applyYear}.
                    The monthly budget becomes independent after application.
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => setApplyModalVisible(false)}
                    style={{ flex: 1, marginRight: spacing.sm }}
                  />
                  <Button
                    title="Apply"
                    onPress={handleConfirmApply}
                    loading={applyMutation.isPending}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: spacing.sm,
    padding: spacing.xs,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandLight,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  addButtonText: {
    color: colors.background,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
    marginLeft: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    marginBottom: spacing.md,
  },
  presetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  presetName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  presetMeta: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: spacing.xs,
  },
  itemsContainer: {
    backgroundColor: colors.surfaceHover,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginVertical: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  itemCategoryName: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  itemAmount: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  applyButtonText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.brandLight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceHover,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addItemText: {
    fontSize: fontSizes.xs,
    color: colors.brandLight,
    fontWeight: fontWeights.medium,
    marginLeft: 4,
  },
  formItemRow: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryDropdownContainer: {
    marginBottom: spacing.xs,
  },
  categoryChipRow: {
    flexDirection: 'row',
  },
  pickerChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginRight: 6,
    fontWeight: fontWeights.bold,
  },
  itemAmountInput: {
    flex: 1,
    backgroundColor: colors.surfaceHover,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  removeItemButton: {
    marginLeft: spacing.sm,
    padding: 4,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  applyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  applyModalBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  applySubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  monthSelectorBox: {
    marginBottom: spacing.md,
  },
  monthLabel: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginBottom: 6,
  },
  monthChipsContainer: {
    flexDirection: 'row',
  },
  monthChip: {
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    marginRight: 6,
  },
  monthChipActive: {
    backgroundColor: colors.brandLight,
  },
  monthChipText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  monthChipTextActive: {
    color: colors.background,
    fontWeight: fontWeights.bold,
  },
  yearRow: {
    marginBottom: spacing.md,
  },
  yearButtons: {
    flexDirection: 'row',
  },
  yearChip: {
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    marginRight: 8,
  },
  yearChipActive: {
    backgroundColor: colors.brandLight,
  },
  yearChipText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
  },
  yearChipTextActive: {
    color: colors.background,
    fontWeight: fontWeights.bold,
  },
  applyNoticeBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    padding: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  applyNoticeText: {
    fontSize: 11,
    color: colors.brandLight,
    lineHeight: 16,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: spacing.md,
    borderRadius: radii.md,
    marginVertical: spacing.md,
  },
  successText: {
    color: colors.brandLight,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
});
