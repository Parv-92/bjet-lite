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
import { ChevronLeft, Plus, Search, X } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { MerchantRuleCard } from '../src/components/rules/MerchantRuleCard';
import { RuleExplanation } from '../src/components/rules/RuleExplanation';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../src/components/ui/ErrorMessage';
import { Button } from '../src/components/ui/Button';
import { useMerchantRules } from '../src/hooks/useMerchantRules';
import { useDeleteMerchantRule } from '../src/hooks/useMerchantRuleMutations';
import { UserMerchantRule } from '../src/types/rules';
import { getApiErrorMessage } from '../src/api/client';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

export default function MerchantRulesScreen() {
  const router = useRouter();
  const { data: rules, isLoading, error, refetch, isRefetching } = useMerchantRules();
  const deleteMutation = useDeleteMerchantRule();

  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
              onRefresh={refetch}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          {/* Collapsible Hierarchy Explanation */}
          <RuleExplanation collapsible />

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
                  Bjet uses these rules to automatically suggest your preferred category when the same merchant or UPI ID appears again.
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
