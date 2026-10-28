/**
 * Bjet Lite - Category Filter Selection Page
 *
 * Dedicated page for selecting a category filter for the Transactions screen.
 * Requirements:
 * - Provide a clearly visible Uncategorized option.
 * - Dedicated selection page displaying all available categories.
 * - Allow users to select a category and return to Transactions screen with filter applied.
 * - Correctly handle null or uncategorized in existing data model.
 * - Use existing category repository methods without hardcoding names or IDs.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Search,
  X,
  Check,
  Layers,
  HelpCircle,
} from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { useCategories } from '../src/hooks/useCategories';
import { Category } from '../src/types/api';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

export default function CategoryFilterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    selectedCategoryFilter?: string;
  }>();

  const [searchQuery, setSearchQuery] = useState('');
  const { data: categories, isLoading, error } = useCategories();

  const activeFilter = params.selectedCategoryFilter || 'all';

  // Filter categories by search input
  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    // Filter out duplicate Uncategorized category if one already exists in DB so we don't display it twice
    const realCategories = categories.filter(
      (c) => c.name.trim().toLowerCase() !== 'uncategorized'
    );
    if (!searchQuery.trim()) return realCategories;
    const q = searchQuery.toLowerCase().trim();
    return realCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  const handleSelectAll = () => {
    router.replace({
      pathname: '/(tabs)/transactions',
      params: {
        categoryFilter: 'all',
        categoryName: 'All Categories',
      },
    });
  };

  const handleSelectUncategorized = () => {
    router.replace({
      pathname: '/(tabs)/transactions',
      params: {
        categoryFilter: 'uncategorized',
        categoryName: 'Uncategorized',
      },
    });
  };

  const handleSelectCategory = (category: Category) => {
    router.replace({
      pathname: '/(tabs)/transactions',
      params: {
        categoryFilter: String(category.id),
        categoryName: category.name,
      },
    });
  };

  return (
    <ScreenContainer scrollable={false}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.7}
        >
          <ArrowLeft color={colors.text} size={20} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Filter by Category</Text>
          <Text style={styles.headerSubtitle}>
            Select a category to view its transactions
          </Text>
        </View>

        <View style={styles.placeholderRight} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Search color={colors.textMuted} size={16} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search categories..."
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

      {/* Categories List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading categories..." />
        </View>
      ) : (
        <FlatList
          data={filteredCategories}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {/* Option 1: All Categories (Clear Filter) */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  activeFilter === 'all' && styles.optionCardActive,
                ]}
                onPress={handleSelectAll}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="All Categories, show all transactions"
              >
                <View style={styles.optionLeft}>
                  <View style={[styles.iconBox, styles.allIconBox]}>
                    <Layers size={16} color={colors.brandLight} />
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.optionTitle,
                        activeFilter === 'all' && styles.optionTitleActive,
                      ]}
                    >
                      All Categories
                    </Text>
                    <Text style={styles.optionSubtitle}>
                      Show all transactions across all categories
                    </Text>
                  </View>
                </View>
                {activeFilter === 'all' && (
                  <Check size={18} color={colors.brandLight} />
                )}
              </TouchableOpacity>

              {/* Option 2: Dedicated Uncategorized Option */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  activeFilter === 'uncategorized' && styles.optionCardActive,
                ]}
                onPress={handleSelectUncategorized}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Uncategorized, transactions with no category"
              >
                <View style={styles.optionLeft}>
                  <View style={[styles.iconBox, styles.uncatIconBox]}>
                    <HelpCircle size={16} color="#9E9E9E" />
                  </View>
                  <View>
                    <Text
                      style={[
                        styles.optionTitle,
                        activeFilter === 'uncategorized' && styles.optionTitleActive,
                      ]}
                    >
                      Uncategorized
                    </Text>
                    <Text style={styles.optionSubtitle}>
                      Transactions with null or unassigned category
                    </Text>
                  </View>
                </View>
                {activeFilter === 'uncategorized' && (
                  <Check size={18} color={colors.brandLight} />
                )}
              </TouchableOpacity>

              <View style={styles.sectionDivider}>
                <Text style={styles.sectionDividerText}>ALL CATEGORIES</Text>
              </View>
            </>
          }
          renderItem={({ item }) => {
            const isSelected = activeFilter === String(item.id);
            const itemColor = item.color || colors.brand;

            return (
              <TouchableOpacity
                style={[
                  styles.categoryRow,
                  isSelected && styles.categoryRowActive,
                ]}
                onPress={() => handleSelectCategory(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} category`}
              >
                <View style={styles.categoryLeft}>
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: itemColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.categoryName,
                      isSelected && styles.categoryNameActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </View>
                {isSelected && <Check size={18} color={colors.brandLight} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No matching categories found</Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  placeholderRight: {
    width: 36,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    height: 42,
    marginVertical: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.sm,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionCardActive: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    marginRight: spacing.sm,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allIconBox: {
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
  },
  uncatIconBox: {
    backgroundColor: 'rgba(158, 158, 158, 0.15)',
  },
  optionTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  optionTitleActive: {
    color: colors.brandLight,
  },
  optionSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  sectionDivider: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  sectionDividerText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.semibold,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: 6,
  },
  categoryRowActive: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(20, 184, 166, 0.08)',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryName: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  categoryNameActive: {
    color: colors.brandLight,
    fontWeight: fontWeights.semibold,
  },
  centerContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
});
