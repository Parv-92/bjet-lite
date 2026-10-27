/**
 * Bjet Mobile - Settings & Preferences Screen
 * Root Stack Screen with back navigation, display name editing,
 * preferences routing, and durable JSON Backup & Restore.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  ArrowLeft,
  FolderTree,
  ChevronRight,
  Sliders,
  Users,
  BookmarkCheck,
  ShieldCheck,
  BookOpen,
  Download,
  Upload,
  User as UserIcon,
  Check,
  Edit2,
  FileText,
  RefreshCw,
} from 'lucide-react-native';
import { ScreenContainer } from '../src/components/common/ScreenContainer';
import { Card } from '../src/components/ui/Card';
import { Button } from '../src/components/ui/Button';
import { HelpGuidesModal } from '../src/components/settings/HelpGuidesModal';
import { useAuth } from '../src/features/auth/AuthContext';
import {
  exportBackupFile,
  validateBackupContent,
  restoreBackupData,
  BackupSummary,
} from '../src/services/backup/JsonBackupService';
import { getLatestBackup, performBackup, type BackupFileEntry } from '../src/services/backup';
import { colors } from '../src/theme/colors';
import { spacing, radii } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, setDisplayName } = useAuth();

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.full_name || '');
  const [nameSaveError, setNameSaveError] = useState<string | null>(null);

  // Backup & Restore states
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [latestLocalBackup, setLatestLocalBackup] = useState<BackupFileEntry | null>(null);

  // Help modal
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [selectedGuideId, setSelectedGuideId] = useState(1);

  useEffect(() => {
    getLatestBackup().then((b) => setLatestLocalBackup(b)).catch(() => {});
    if (user?.full_name) {
      setEditedName(user.full_name);
    }
  }, [user?.full_name]);

  const handleSaveName = async () => {
    const trimmed = editedName.trim();
    if (!trimmed) {
      setNameSaveError('Name cannot be empty.');
      return;
    }
    setNameSaveError(null);
    try {
      await setDisplayName(trimmed);
      setIsEditingName(false);
    } catch (err: any) {
      setNameSaveError(err?.message || 'Could not save name.');
    }
  };

  const handleCreateJsonBackup = async () => {
    setIsExporting(true);
    setBackupMessage(null);
    try {
      const res = await exportBackupFile();
      if (res.success) {
        setBackupMessage(`Backup saved: ${res.filename}`);
        Alert.alert(
          'Backup Created',
          `Your durable backup has been saved as:\n\n${res.filename}\n\nKeep this file safe outside the app to survive any future reinstallation.`
        );
        const updated = await getLatestBackup();
        setLatestLocalBackup(updated);
      } else {
        setBackupMessage(res.error || 'Backup creation failed.');
        Alert.alert('Backup Error', res.error || 'Could not export backup.');
      }
    } catch (err: any) {
      setBackupMessage(err?.message || 'Backup export failed.');
      Alert.alert('Error', err?.message || 'Unexpected backup failure.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreJsonBackup = async (forceLegacy: boolean = false) => {
    try {
      setBackupMessage(null);
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const fileAsset = pickerResult.assets[0];
      let fileContent: string;

      if (Platform.OS === 'web') {
        const file = (fileAsset as any).file as File | undefined;
        if (file) {
          fileContent = await file.text();
        } else {
          const res = await fetch(fileAsset.uri);
          fileContent = await res.text();
        }
      } else {
        fileContent = await FileSystem.readAsStringAsync(fileAsset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(fileContent);
      } catch {
        Alert.alert('Invalid File', 'The selected file is not valid JSON.');
        return;
      }

      const validation = validateBackupContent(parsed);
      if (!validation.isValid) {
        Alert.alert('Unsupported Backup', validation.error || 'Unrecognized backup structure.');
        return;
      }

      const summary = validation.summary!;
      const promptTitle = validation.isLegacy || forceLegacy
        ? 'Import Legacy Bjet Data'
        : 'Restore Backup';

      const promptMessage =
        `Found in backup file:\n` +
        `• ${summary.transactionsCount} Transactions\n` +
        `• ${summary.categoriesCount} Categories\n` +
        `• ${summary.budgetsCount} Budgets\n` +
        `• ${summary.friendsCount} Friends & Reimbursements\n` +
        `• ${summary.rulesCount} Merchant Rules\n\n` +
        `Merge this data into your current Bjet Lite database? Existing records and duplicate transactions will be safely preserved.`;

      Alert.alert(promptTitle, promptMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge Data',
          style: 'default',
          onPress: async () => {
            setIsRestoring(true);
            try {
              const res = await restoreBackupData(validation.data, validation.isLegacy || forceLegacy);
              if (res.success) {
                const s = res.imported;
                Alert.alert(
                  'Restore Successful',
                  `Successfully imported:\n` +
                  `• ${s.transactionsCount} Transactions\n` +
                  `• ${s.categoriesCount} Categories\n` +
                  `• ${s.budgetsCount} Budgets\n` +
                  `• ${s.friendsCount} Friends\n\n` +
                  `${res.skippedDuplicates} duplicate/unsupported records were safely skipped.`
                );
                setBackupMessage(`Restored ${s.transactionsCount} transactions safely.`);
              } else {
                Alert.alert('Restore Failed', res.error || 'Import failed. Your existing data was not modified.');
              }
            } catch (err: any) {
              Alert.alert('Restore Error', err?.message || 'Restore failed unexpectedly.');
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]);
    } catch (err: any) {
      Alert.alert('Selection Error', err?.message || 'Could not read selected file.');
    }
  };

  const openGuide = (id: number) => {
    setSelectedGuideId(id);
    setHelpModalVisible(true);
  };

  return (
    <ScreenContainer scrollable>
      {/* Top Header with Back Navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Account profile, preferences, and backups</Text>
        </View>
      </View>

      {/* Account Profile Card */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithIcon}>
          <UserIcon size={20} color={colors.brandLight} style={{ marginRight: spacing.xs }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Account Profile</Text>
        </View>

        <View style={[styles.infoRow, { marginTop: spacing.md }]}>
          <Text style={styles.label}>Display Name</Text>
          {!isEditingName ? (
            <View style={styles.nameDisplayRow}>
              <Text style={styles.value}>{user?.full_name || 'Bjet User'}</Text>
              <TouchableOpacity
                style={styles.editNameButton}
                onPress={() => {
                  setEditedName(user?.full_name || '');
                  setIsEditingName(true);
                }}
                activeOpacity={0.7}
                accessibilityLabel="Edit display name"
              >
                <Edit2 size={15} color={colors.brandLight} />
                <Text style={styles.editNameButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.nameEditContainer}>
              <View style={styles.nameInputRow}>
                <TextInput
                  style={styles.nameInput}
                  value={editedName}
                  onChangeText={(text) => {
                    setEditedName(text);
                    if (nameSaveError) setNameSaveError(null);
                  }}
                  placeholder="Your Name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus={true}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity
                  style={styles.saveNameButton}
                  onPress={handleSaveName}
                  activeOpacity={0.8}
                >
                  <Check size={16} color={colors.background} />
                </TouchableOpacity>
              </View>
              {nameSaveError && <Text style={styles.nameErrorText}>{nameSaveError}</Text>}
            </View>
          )}
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Email Address</Text>
          <Text style={styles.value}>{user?.email || 'local@bjet.lite'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Account Mode</Text>
          <Text style={styles.value}>Offline Local (#1)</Text>
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

      {/* Durable Local Backup & Restore */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithIcon}>
          <ShieldCheck size={20} color={colors.brandLight} style={{ marginRight: spacing.xs }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Durable Local Backups</Text>
        </View>
        <Text style={styles.sectionSubtitleText}>
          Export portable JSON backups outside app-private storage so your financial records survive app uninstalls.
        </Text>

        <View style={[styles.infoRow, { marginTop: spacing.md }]}>
          <Text style={styles.label}>Auto Snapshots</Text>
          <Text style={[styles.value, { color: colors.brandLight }]}>
            Active (Saves on transactions & budgets)
          </Text>
        </View>

        {backupMessage && (
          <Text
            style={[
              styles.backupFeedback,
              backupMessage.startsWith('Backup saved') || backupMessage.startsWith('Restored')
                ? styles.backupSuccess
                : styles.backupError,
            ]}
          >
            {backupMessage}
          </Text>
        )}

        <View style={styles.backupActionsGrid}>
          <Button
            title={isExporting ? 'Exporting...' : 'Create Backup'}
            onPress={handleCreateJsonBackup}
            variant="primary"
            loading={isExporting}
            disabled={isExporting || isRestoring}
            icon={<Download size={16} color={colors.background} />}
            style={styles.backupActionButton}
          />

          <Button
            title={isRestoring ? 'Restoring...' : 'Restore Backup'}
            onPress={() => handleRestoreJsonBackup(false)}
            variant="outline"
            loading={isRestoring}
            disabled={isExporting || isRestoring}
            icon={<Upload size={16} color={colors.brandLight} />}
            style={styles.backupActionButton}
          />
        </View>

        <TouchableOpacity
          style={styles.legacyImportButton}
          onPress={() => handleRestoreJsonBackup(true)}
          disabled={isExporting || isRestoring}
          activeOpacity={0.7}
        >
          <RefreshCw size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
          <Text style={styles.legacyImportButtonText}>Import data from older Bjet version</Text>
        </TouchableOpacity>
      </Card>

      {/* Help & Visual Guides */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithIcon}>
          <BookOpen size={20} color={colors.brandLight} style={{ marginRight: spacing.xs }} />
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Help & How It Works</Text>
        </View>
        <Text style={styles.sectionSubtitleText}>
          Offline visual guides explaining financial formulas and categorization
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
              <Text style={styles.settingTitle}>Merchant Rules Guide</Text>
              <Text style={styles.settingDescription}>
                How automatic pattern matching maps transactions
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
              <Text style={styles.settingTitle}>Friends & Reimbursements Guide</Text>
              <Text style={styles.settingDescription}>
                How split expenses and incoming repayments work
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
            <View style={[styles.settingIconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <ShieldCheck size={20} color={colors.brandLight} />
            </View>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Data Safety & Privacy Guide</Text>
              <Text style={styles.settingDescription}>
                100% offline-first local SQLite architecture
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </Card>

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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerTitles: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  card: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  cardHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
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
    marginTop: 4,
    lineHeight: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  value: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  nameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editNameButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  editNameButtonText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    marginLeft: 4,
  },
  nameEditContainer: {
    flex: 1,
    maxWidth: 200,
    alignItems: 'flex-end',
  },
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameInput: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    minWidth: 140,
  },
  saveNameButton: {
    backgroundColor: colors.brand,
    padding: 6,
    borderRadius: radii.sm,
    marginLeft: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameErrorText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  settingRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  ruleIconWrapper: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  friendIconWrapper: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  presetIconWrapper: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    marginBottom: 2,
  },
  settingDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  backupActionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  backupActionButton: {
    flex: 1,
  },
  backupFeedback: {
    fontSize: fontSizes.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    marginTop: spacing.sm,
  },
  backupSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: colors.brandLight,
  },
  backupError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: colors.danger,
  },
  legacyImportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
  },
  legacyImportButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
});
