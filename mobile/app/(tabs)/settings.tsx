/**
 * Bjet Mobile - Settings Screen
 * Displays authenticated user profile, app metadata, category management link, and logout trigger.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderTree, ChevronRight, Sliders, Users, BookmarkCheck } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { useAuth } from '../../src/hooks/useAuth';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Account details and personal preferences
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Account Profile</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Full Name</Text>
          <Text style={styles.value}>{user?.full_name || 'Not provided'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Email Address</Text>
          <Text style={styles.value}>{user?.email || 'N/A'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>User ID</Text>
          <Text style={styles.value}>{user?.id ? `#${user.id}` : 'N/A'}</Text>
        </View>
      </Card>

      {/* Preferences & Data Management */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Preferences & Data</Text>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/categories')}
          accessibilityRole="button"
          accessibilityLabel="Manage categories"
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={styles.settingIconWrapper}>
              <FolderTree size={20} color={colors.brandLight} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Categories</Text>
              <Text style={styles.settingDescription}>
                Manage custom categories & view system defaults
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, styles.settingRowDivider]}
          onPress={() => router.push('/rules')}
          accessibilityRole="button"
          accessibilityLabel="Manage merchant rules"
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, styles.ruleIconWrapper]}>
              <Sliders size={20} color="#8B5CF6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Merchant Rules</Text>
              <Text style={styles.settingDescription}>
                Auto-categorization preferences by merchant pattern
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, styles.settingRowDivider]}
          onPress={() => router.push('/friends')}
          accessibilityRole="button"
          accessibilityLabel="Manage friends and reimbursements"
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, styles.friendIconWrapper]}>
              <Users size={20} color="#38BDF8" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Friends & Reimbursements</Text>
              <Text style={styles.settingDescription}>
                Auto-recognize incoming payments from friends
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, styles.settingRowDivider]}
          onPress={() => router.push('/budget-presets')}
          accessibilityRole="button"
          accessibilityLabel="Manage budget presets"
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, styles.presetIconWrapper]}>
              <BookmarkCheck size={20} color="#F59E0B" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Budget Presets</Text>
              <Text style={styles.settingDescription}>
                Reusable monthly budget templates and category limits
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Application Info</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Application</Text>
          <Text style={styles.value}>Bjet Mobile</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0 (API v0.3.0)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Design Theme</Text>
          <Text style={styles.value}>Dark Slate & Emerald</Text>
        </View>
      </Card>

      <Button
        title="Log Out"
        onPress={handleLogout}
        variant="danger"
        loading={isLoggingOut}
        disabled={isLoggingOut}
        style={styles.logoutButton}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  card: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.md,
  },
  infoRow: {
    marginBottom: spacing.md,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  value: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  settingIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
  },
  settingDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  settingRowDivider: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  ruleIconWrapper: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  friendIconWrapper: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  presetIconWrapper: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  logoutButton: {
    marginTop: spacing.lg,
  },
});
