/**
 * Bjet Mobile - Settings Screen
 * Displays authenticated user profile, app metadata, category management link, and logout trigger.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderTree, ChevronRight, Sliders, Users, BookmarkCheck, ShieldCheck, BookOpen, Receipt, FileText } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { HelpGuidesModal } from '../../src/components/settings/HelpGuidesModal';
import { useAuth } from '../../src/hooks/useAuth';
import { performBackup, getLatestBackup, type BackupFileEntry } from '../../src/services/backup';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [latestBackup, setLatestBackup] = useState<BackupFileEntry | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [selectedGuideId, setSelectedGuideId] = useState(1);

  const openGuide = (id: number) => {
    setSelectedGuideId(id);
    setHelpModalVisible(true);
  };

  useEffect(() => {
    getLatestBackup().then((b) => setLatestBackup(b)).catch(() => {});
  }, []);

  const handleManualBackup = async () => {
    setIsBackingUp(true);
    setBackupMessage(null);
    try {
      const res = await performBackup();
      if (res.success && res.filename) {
        setBackupMessage(`Saved: ${res.filename}`);
        const updated = await getLatestBackup();
        setLatestBackup(updated);
      } else {
        setBackupMessage(res.error || 'Backup could not be completed');
      }
    } catch (e: any) {
      setBackupMessage(e?.message || 'Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleResetCache = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('Failed to reset cache:', error);
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
          <Text style={styles.value}>{user?.full_name || 'Bjet Lite User'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Email Address</Text>
          <Text style={styles.value}>{user?.email || 'local@bjet.lite'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>User ID</Text>
          <Text style={styles.value}>Local (#1)</Text>
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

      {/* Data Safety & Backups */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithIcon}>
          <ShieldCheck size={20} color={colors.brandLight} style={{ marginRight: spacing.xs }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Local Data Backups</Text>
        </View>

        <View style={[styles.infoRow, { marginTop: spacing.md }]}>
          <Text style={styles.label}>Automatic Backup</Text>
          <Text style={[styles.value, { color: colors.brandLight }]}>
            Active (Auto-saves on transaction & budget updates)
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Latest Local Backup</Text>
          <Text style={styles.value}>
            {latestBackup
              ? `${latestBackup.filename} (${(latestBackup.size / 1024).toFixed(1)} KB)`
              : 'Auto-created on next transaction or budget update'}
          </Text>
        </View>

        {backupMessage && (
          <Text
            style={[
              styles.backupFeedback,
              backupMessage.startsWith('Saved') ? styles.backupSuccess : styles.backupError,
            ]}
          >
            {backupMessage}
          </Text>
        )}

        <Button
          title={isBackingUp ? 'Creating Backup...' : 'Create Backup Now'}
          onPress={handleManualBackup}
          variant="outline"
          loading={isBackingUp}
          disabled={isBackingUp}
          style={{ marginTop: spacing.xs }}
        />
      </Card>

      {/* Help & How It Works */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithIcon}>
          <BookOpen size={20} color={colors.brandLight} style={{ marginRight: spacing.xs }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Help & How It Works</Text>
        </View>
        <Text style={styles.sectionSubtitleText}>
          Offline visual guides explaining core features and calculations
        </Text>

        <TouchableOpacity
          style={[styles.settingRow, { marginTop: spacing.md }]}
          onPress={() => openGuide(1)}
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, styles.ruleIconWrapper]}>
              <Sliders size={20} color="#8B5CF6" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Merchant Rules</Text>
              <Text style={styles.settingDescription}>
                What a pattern is & bulk uncategorized rules
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, styles.settingRowDivider]}
          onPress={() => openGuide(2)}
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, styles.friendIconWrapper]}>
              <Users size={20} color="#38BDF8" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Friends & Reimbursements</Text>
              <Text style={styles.settingDescription}>
                Matching incoming transfers to offset personal spending
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, styles.settingRowDivider]}
          onPress={() => openGuide(3)}
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, styles.presetIconWrapper]}>
              <Receipt size={20} color="#F59E0B" />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>I Paid for Someone Else</Text>
              <Text style={styles.settingDescription}>
                Splitting expenses & personal spending exclusion
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingRow, styles.settingRowDivider]}
          onPress={() => openGuide(4)}
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <View style={[styles.settingIconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
              <FileText size={20} color={colors.brandLight} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Importing UPI Statements</Text>
              <Text style={styles.settingDescription}>
                Selecting monthly PDFs & duplicate detection
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
          <Text style={styles.value}>Bjet Lite</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0 (Offline-First)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Design Theme</Text>
          <Text style={styles.value}>Dark Slate & Emerald</Text>
        </View>
      </Card>

      <Button
        title="Reset Application Cache"
        onPress={handleResetCache}
        variant="secondary"
        loading={isLoggingOut}
        disabled={isLoggingOut}
        style={styles.logoutButton}
      />

      {/* Help Guides Modal */}
      <HelpGuidesModal
        visible={helpModalVisible}
        initialGuide={selectedGuideId}
        onClose={() => setHelpModalVisible(false)}
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
  sectionSubtitleText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
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
  cardHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backupFeedback: {
    fontSize: fontSizes.xs,
    marginBottom: spacing.sm,
    fontWeight: fontWeights.medium,
  },
  backupSuccess: {
    color: colors.brandLight,
  },
  backupError: {
    color: colors.danger,
  },
  logoutButton: {
    marginTop: spacing.lg,
  },
});
