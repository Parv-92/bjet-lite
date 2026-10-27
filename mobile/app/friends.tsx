/**
 * Bjet Mobile - Friends Management Screen (Phase 14)
 * Allows users to configure friends for automatic incoming reimbursement recognition.
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
import { ChevronLeft, Plus, Users, Trash2, Edit2, X, Tag } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { EmptyState } from '../src/components/common/EmptyState';
import { CategoryPickerModal } from '../src/components/transactions/CategoryPickerModal';
import { useFriends, useCreateFriend, useUpdateFriend, useDeleteFriend } from '../src/hooks/useFriends';
import { useCategories } from '../src/hooks/useCategories';
import { Friend } from '../src/types/api';
import { getApiErrorMessage } from '../src/api/client';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

export default function FriendsScreen() {
  const router = useRouter();
  const { data: friends, isLoading, error, refetch, isRefetching } = useFriends();
  const { data: categories } = useCategories();

  const createMutation = useCreateFriend();
  const updateMutation = useUpdateFriend();
  const deleteMutation = useDeleteFriend();

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [formNamePattern, setFormNamePattern] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingFriend(null);
    setFormNamePattern('');
    setSelectedCategoryId(categories && categories.length > 0 ? categories[0].id : null);
    setModalError(null);
    setModalVisible(true);
  };

  const openEditModal = (friend: Friend) => {
    setEditingFriend(friend);
    setFormNamePattern(friend.name || friend.recognized_name);
    setSelectedCategoryId(friend.category_id);
    setModalError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    setModalError(null);
    const cleanName = formNamePattern.trim();
    const cleanPattern = cleanName.toUpperCase();

    if (!cleanName) {
      setModalError('Please enter a friend name / pattern.');
      return;
    }
    if (!selectedCategoryId) {
      setModalError('Please select a default reimbursement category.');
      return;
    }

    try {
      if (editingFriend) {
        await updateMutation.mutateAsync({
          id: editingFriend.id,
          data: {
            name: cleanName,
            recognized_name: cleanPattern,
            category_id: selectedCategoryId,
          },
        });
      } else {
        await createMutation.mutateAsync({
          name: cleanName,
          recognized_name: cleanPattern,
          category_id: selectedCategoryId,
        });
      }
      setModalVisible(false);
    } catch (err: unknown) {
      setModalError(getApiErrorMessage(err));
    }
  };

  const handleDelete = (friend: Friend) => {
    Alert.alert(
      'Delete Friend Configuration',
      `Are you sure you want to remove "${friend.name}" (${friend.recognized_name})?\n\nThis will not delete any existing transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(friend.id);
            } catch (err: unknown) {
              Alert.alert('Cannot Delete', getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

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
            <Text style={styles.title}>Friends</Text>
            <Text style={styles.subtitle}>Automatic reimbursement recognition</Text>
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
          <LoadingSpinner size="large" label="Loading friends..." />
        </View>
      ) : error ? (
        <EmptyState
          icon={<Users color={colors.danger} size={48} />}
          title="Failed to Load"
          description={getApiErrorMessage(error)}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : !friends || friends.length === 0 ? (
        <EmptyState
          icon={<Users color={colors.brandLight} size={48} />}
          title="No Friends Configured"
          description="Add friends with their transaction sender names (e.g. SOURAV) to automatically offset spending categories when receiving money."
          actionLabel="Add Friend"
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
          {friends.map((friend) => {
            const catName = friend.category?.name || 'Uncategorized';
            const catColor = friend.category?.color || colors.textMuted;

            return (
              <Card key={friend.id} style={styles.card}>
                <View style={styles.cardContent}>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    <View style={styles.patternRow}>
                      <Text style={styles.patternLabel}>Pattern:</Text>
                      <View style={styles.patternChip}>
                        <Text style={styles.patternText}>{friend.recognized_name}</Text>
                      </View>
                    </View>
                    <View style={styles.categoryRow}>
                      <Text style={styles.categoryLabel}>Category:</Text>
                      <View style={[styles.categoryChip, { backgroundColor: `${catColor}15` }]}>
                        <Tag size={12} color={catColor} style={{ marginRight: 4 }} />
                        <Text style={[styles.categoryText, { color: catColor }]}>{catName}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={() => openEditModal(friend)}
                      style={styles.iconButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Edit2 size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(friend)}
                      style={[styles.iconButton, { marginLeft: spacing.xs }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Trash2 size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}

      {/* Add / Edit Friend Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingFriend ? 'Edit Friend' : 'Add Friend'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {modalError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{modalError}</Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Friend Name / Pattern</Text>
                <TextInput
                  style={styles.input}
                  value={formNamePattern}
                  onChangeText={setFormNamePattern}
                  placeholder="e.g. Rahul"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.helpText}>
                  Use the name that appears in transactions to identify reimbursements.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Reimbursement Category</Text>
                <TouchableOpacity
                  style={styles.categoryPickerButton}
                  onPress={() => setShowCategoryPicker(true)}
                >
                  <Text
                    style={[
                      styles.categoryPickerText,
                      selectedCategory && { color: selectedCategory.color || colors.brandLight },
                    ]}
                  >
                    {selectedCategory?.name || 'Select Category'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => setModalVisible(false)}
                  style={{ flex: 1, marginRight: spacing.sm }}
                />
                <Button
                  title={editingFriend ? 'Update' : 'Save'}
                  onPress={handleSave}
                  loading={createMutation.isPending || updateMutation.isPending}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        <CategoryPickerModal
          visible={showCategoryPicker}
          selectedCategoryId={selectedCategoryId}
          onSelect={(cat) => {
            if (cat) {
              setSelectedCategoryId(cat.id);
            }
            setShowCategoryPicker(false);
          }}
          onClose={() => setShowCategoryPicker(false)}
        />
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
    marginBottom: spacing.sm,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.text,
    marginBottom: 4,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  patternLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginRight: 6,
  },
  patternChip: {
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  patternText: {
    fontSize: fontSizes.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.brandLight,
    fontWeight: fontWeights.medium,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  categoryLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginRight: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  categoryText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: spacing.xs,
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
    maxHeight: '88%',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalScrollView: {
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
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
  helpText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  categoryPickerButton: {
    backgroundColor: colors.surfaceHover,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPickerText: {
    fontSize: fontSizes.sm,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
});
