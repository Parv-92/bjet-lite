/**
 * Bjet Mobile - Categories Screen (Phase 9)
 * Dedicated category management screen supporting:
 * - List accessible categories
 * - Distinguish system-default vs user-owned categories
 * - Create user-owned categories
 * - Edit user-owned categories
 * - Delete user-owned categories with dependency protection
 * - Search by name / icon
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
import { ChevronLeft, Plus, Search, X, FolderTree, AlertCircle } from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { CategoryCard } from '../src/components/categories/CategoryCard';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { ErrorMessage } from '../src/components/ui/ErrorMessage';
import { Button } from '../src/components/ui/Button';
import { EmptyState } from '../src/components/common/EmptyState';
import { useCategories } from '../src/hooks/useCategories';
import { useDeleteCategory } from '../src/hooks/useCategoryMutations';
import { Category } from '../src/types/api';
import { getApiErrorMessage } from '../src/api/client';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

export default function CategoriesScreen() {
  const router = useRouter();
  const { data: categories, isLoading, error, refetch, isRefetching } = useCategories();
  const deleteMutation = useDeleteCategory();

  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Group categories into Custom and System
  const { userCategories, systemCategories } = useMemo(() => {
    if (!categories) return { userCategories: [], systemCategories: [] };

    const userCats: Category[] = [];
    const sysCats: Category[] = [];

    const query = searchQuery.trim().toLowerCase();

    for (const cat of categories) {
      // Primary match: category name. Optional secondary match: icon identifier
      const matchesName = cat.name.toLowerCase().includes(query);
      const matchesIcon = cat.icon ? cat.icon.toLowerCase().includes(query) : false;

      if (!query || matchesName || matchesIcon) {
        if (cat.is_system_default) {
          sysCats.push(cat);
        } else {
          userCats.push(cat);
        }
      }
    }

    return { userCategories: userCats, systemCategories: sysCats };
  }, [categories, searchQuery]);

  const handleEdit = (category: Category) => {
    if (category.is_system_default) {
      Alert.alert('Protected Category', 'System default categories cannot be modified.');
      return;
    }
    router.push(`/category/edit/${category.id}`);
  };

  const handleDelete = (category: Category) => {
    if (category.is_system_default) {
      Alert.alert('Protected Category', 'System default categories cannot be deleted.');
      return;
    }

    Alert.alert(
      'Delete this category?',
      `Are you sure you want to delete "${category.name}"?\n\nAny monthly budget limits for this category will also be removed. Categories referenced by transactions, presets, rules, or friends cannot be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(category.id);
            try {
              await deleteMutation.mutateAsync(category.id);
            } catch (err: unknown) {
              const errorMessage = getApiErrorMessage(err);
              Alert.alert('Cannot Delete Category', errorMessage);
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
            <Text style={styles.title}>Categories</Text>
            <Text style={styles.subtitle}>Manage custom & system categories</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.newButton}
          onPress={() => router.push('/category/create')}
          accessibilityRole="button"
          accessibilityLabel="Create category"
        >
          <Plus size={16} color="#FFFFFF" style={styles.plusIcon} />
          <Text style={styles.newButtonText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Search color={colors.textMuted} size={18} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search categories by name..."
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

      {/* Main Content Area */}
      {isLoading && !categories ? (
        <View style={styles.centerContainer}>
          <LoadingSpinner size="large" label="Loading categories..." />
        </View>
      ) : error && !categories ? (
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
          {/* Section 1: My Categories (User-owned) */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              My Categories {userCategories.length > 0 && `(${userCategories.length})`}
            </Text>
          </View>

          {userCategories.length === 0 ? (
            searchQuery.trim() ? (
              <View style={styles.emptyFiltered}>
                <Text style={styles.emptyFilteredText}>No custom categories match your search.</Text>
              </View>
            ) : (
              <View style={styles.emptyCustomBox}>
                <Text style={styles.emptyCustomTitle}>
                  You haven't created any custom categories yet.
                </Text>
                <Text style={styles.emptyCustomSubtitle}>
                  Create custom categories to organize personal spending that isn't covered by system defaults.
                </Text>
                <Button
                  title="+ Create Custom Category"
                  onPress={() => router.push('/category/create')}
                  variant="outline"
                  style={styles.emptyCustomButton}
                />
              </View>
            )
          ) : (
            userCategories.map((cat) => (
              <CategoryCard
                key={`user-cat-${cat.id}`}
                category={cat}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isDeleting={deletingId === cat.id}
              />
            ))
          )}

          {/* Section 2: System Categories */}
          <View style={[styles.sectionHeader, styles.systemSectionHeader]}>
            <Text style={styles.sectionTitle}>
              System Categories {systemCategories.length > 0 && `(${systemCategories.length})`}
            </Text>
            <Text style={styles.sectionSubtitle}>Standard defaults available to all users</Text>
          </View>

          {systemCategories.length === 0 ? (
            <View style={styles.emptyFiltered}>
              <Text style={styles.emptyFilteredText}>No system categories match your search.</Text>
            </View>
          ) : (
            systemCategories.map((cat) => (
              <CategoryCard
                key={`sys-cat-${cat.id}`}
                category={cat}
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
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  systemSectionHeader: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  emptyFiltered: {
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderMuted,
    borderWidth: 1,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  emptyFilteredText: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  emptyCustomBox: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyCustomTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptyCustomSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  emptyCustomButton: {
    minWidth: 200,
  },
});
