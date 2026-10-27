/**
 * Bjet Mobile - Merchant Rules Screen (Phase 10)
 * Dedicated merchant rules management screen supporting:
 * - Listing user rules ordered by priority DESC, created_at DESC
 * - Creating rules
 * - Editing / Replacing rules
 * - Deleting rules with confirmation
 * - Local search by merchant pattern or category name
 * - Categorization hierarchy explanation
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Plus, Search, X, Sparkles, Tag } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { MerchantRuleCard } from '../src/components/rules/MerchantRuleCard';
import { CategoryPickerModal } from '../src/components/transactions/CategoryPickerModal';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../src/components/ui/ErrorMessage';
import { Button } from '../src/components/ui/Button';
import { useMerchantRules, useUncategorizedMerchants } from '../src/hooks/useMerchantRules';
import { useDeleteMerchantRule, useCategorizeMerchantTransactions } from '../src/hooks/useMerchantRuleMutations';
import { UserMerchantRule } from '../src/types/rules';
import { Category } from '../src/types/api';
import { getApiErrorMessage } from '../src/api/client';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

export default function MerchantRulesScreen() {
  const router = useRouter();
  const { data: rules, isLoading, error, refetch, isRefetching } = useMerchantRules();
  const { data: uncategorizedMerchants, refetch: refetchUncategorized } = useUncategorizedMerchants();
  const deleteMutation = useDeleteMerchantRule();
  const categorizeMutation = useCategorizeMerchantTransactions();

  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [selectedUncatMerchant, setSelectedUncatMerchant] = useState<{
    merchant_name: string;
    count: number;
  } | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rules;

    return rules.filter((rule) => {
      const matchPattern = rule.merchant_pattern.toLowerCase().includes(query);
      const matchCategory = rule.category?.name
        ? rule.category.name.toLowerCase().includes(query)
        : false;
      return matchPattern || matchCategory;
    });
  }, [rules, searchQuery]);

  const handleEdit = (rule: UserMerchantRule) => {
    router.push(`/rule/edit/${rule.id}`);
  };

  const handleDelete = (rule: UserMerchantRule) => {
    Alert.alert(
      'Delete this merchant rule?',
      `Are you sure you want to delete the rule for "${rule.merchant_pattern}"?\n\nThis only removes the categorization preference. Existing transactions are not changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(rule.id);
            try {
              await deleteMutation.mutateAsync(rule.id);
            } catch (err: unknown) {
              const errorMessage = getApiErrorMessage(err);
              Alert.alert('Cannot Delete Rule', errorMessage);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleSelectUncatMerchant = (merchant: { merchant_name: string; count: number }) => {
    setSelectedUncatMerchant(merchant);
    setCategoryPickerVisible(true);
  };

  const handleCategorySelected = (category: Category | null) => {
    setCategoryPickerVisible(false);
    if (!category || !selectedUncatMerchant) return;

    const { merchant_name, count } = selectedUncatMerchant;
    Alert.alert(
      `Set Default for "${merchant_name}"`,
      `Apply "${category.name}" to all ${count} existing uncategorized transaction${count === 1 ? '' : 's'}?\n\nThis will also save "${merchant_name}" as your default merchant rule for future transactions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Categorize ${count} Transaction${count === 1 ? '' : 's'}`,
          onPress: async () => {
            try {
              const res = await categorizeMutation.mutateAsync({
                merchantPattern: merchant_name,
                categoryId: category.id,
                saveRule: true,
              });
              Alert.alert(
                'Categorization Saved',
                `Successfully categorized ${res.updatedCount} transaction${res.updatedCount === 1 ? '' : 's'} as "${category.name}" and saved merchant rule.`
              );
            } catch (err) {
              Alert.alert('Error', getApiErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchUncategorized()]);
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
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft color={colors.text} size={24} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Merchant Rules</Text>
            <Text style={styles.subtitle}>Auto-categorization preferences</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.newButton}
          onPress={() => router.push('/rule/create')}
          accessibilityRole="button"
          accessibilityLabel="Create rule"
        >
          <Plus size={16} color="#FFFFFF" style={styles.plusIcon} />
          <Text style={styles.newButtonText}>New Rule</Text>
        </TouchableOpacity>
      </View>

      {/* Explanatory Banner */}
      <View style={styles.explainerBanner}>
        <Text style={styles.explainerText}>
          Transactions matching this merchant will use the selected category by default.
        </Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Search color={colors.textMuted} size={18} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by merchant or category..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X color={colors.textMuted} size={16} />
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content */}
      {isLoading && !rules ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading merchant rules..." />
        </View>
      ) : error && !rules ? (
        <View style={styles.centerContainer}>
          <ErrorMessage
            message={getApiErrorMessage(error)}
            onRetry={() => refetch()}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          {/* Uncategorized Merchants Bulk Workflow */}
          {uncategorizedMerchants && uncategorizedMerchants.length > 0 && !searchQuery.trim() && (
            <View style={styles.uncatSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Sparkles size={16} color={colors.brandLight} style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>
                    Needs Categorization ({uncategorizedMerchants.length})
                  </Text>
                </View>
                <Text style={styles.sectionSubtitle}>Tap to set category</Text>
              </View>

              {uncategorizedMerchants.map((item) => (
                <TouchableOpacity
                  key={`uncat-${item.merchant_name}`}
                  style={styles.uncatCard}
                  onPress={() => handleSelectUncatMerchant(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.uncatInfo}>
                    <Text style={styles.uncatName} numberOfLines={1}>
                      {item.merchant_name}
                    </Text>
                    <Text style={styles.uncatCount}>
                      {item.count} uncategorized transaction{item.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={styles.uncatBadge}>
                    <Tag size={12} color={colors.brandLight} style={{ marginRight: 4 }} />
                    <Text style={styles.uncatBadgeText}>Set Category</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Section Header with Rule Count */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              My Rules {rules && rules.length > 0 && `(${filteredRules.length})`}
            </Text>
          </View>

          {filteredRules.length === 0 ? (
            searchQuery.trim() ? (
              <View style={styles.emptyFiltered}>
                <Text style={styles.emptyFilteredText}>
                  No merchant rules match your search.
                </Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>
                  You haven't created any custom merchant rules yet.
                </Text>
                <Text style={styles.emptySubtitle}>
                  Set a default category for frequent merchants to auto-categorize incoming transactions.
                </Text>
                <Button
                  title="+ Create Merchant Rule"
                  onPress={() => router.push('/rule/create')}
                  variant="outline"
                  style={styles.emptyButton}
                />
              </View>
            )
          ) : (
            filteredRules.map((rule) => (
              <MerchantRuleCard
                key={`rule-${rule.id}`}
                rule={rule}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDeleting={deletingId === rule.id}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Category Picker Modal */}
      <CategoryPickerModal
        visible={categoryPickerVisible}
        selectedCategoryId={null}
        onSelect={handleCategorySelected}
        onClose={() => setCategoryPickerVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
  },
  plusIcon: {
    marginRight: 4,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.sm,
    height: '100%',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  orderLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  explainerBanner: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  explainerText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  uncatSection: {
    marginBottom: spacing.lg,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  uncatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  uncatInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  uncatName: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    marginBottom: 2,
  },
  uncatCount: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  uncatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  uncatBadgeText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  emptyFiltered: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  emptyFilteredText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  emptyBox: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  emptyButton: {
    minWidth: 200,
  },
});
