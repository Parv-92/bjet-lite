/**
 * Bjet Mobile - Help & How It Works Modal (Phase 9)
 * 100% offline, interactive visual guide explaining:
 * 1. Merchant Rules & Historical Categorization
 * 2. Friends & Reimbursements
 * 3. I Paid for Someone Else
 * 4. Importing Monthly UPI Statements
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import {
  X,
  Sliders,
  Users,
  Receipt,
  FileText,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react-native';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

interface HelpGuidesModalProps {
  visible: boolean;
  initialGuide?: number;
  onClose: () => void;
}

interface GuideContent {
  id: number;
  title: string;
  subtitle: string;
  icon: typeof Sliders;
  iconBg: string;
  iconColor: string;
}

const guidesList: GuideContent[] = [
  {
    id: 1,
    title: 'Merchant Rules',
    subtitle: 'Auto-categorization & bulk rules',
    icon: Sliders,
    iconBg: 'rgba(139, 92, 246, 0.12)',
    iconColor: '#8B5CF6',
  },
  {
    id: 2,
    title: 'Friends & Reimbursements',
    subtitle: 'Auto-recognize incoming repayments',
    icon: Users,
    iconBg: 'rgba(56, 189, 248, 0.12)',
    iconColor: '#38BDF8',
  },
  {
    id: 3,
    title: 'I Paid for Someone Else',
    subtitle: 'Split bills & personal spending calculations',
    icon: Receipt,
    iconBg: 'rgba(245, 158, 11, 0.12)',
    iconColor: '#F59E0B',
  },
  {
    id: 4,
    title: 'Importing UPI Statements',
    subtitle: 'Monthly PDFs, duplicate detection & review',
    icon: FileText,
    iconBg: 'rgba(16, 185, 129, 0.12)',
    iconColor: colors.brandLight,
  },
];

export const HelpGuidesModal: React.FC<HelpGuidesModalProps> = ({
  visible,
  initialGuide = 1,
  onClose,
}) => {
  const [activeGuideId, setActiveGuideId] = useState<number>(initialGuide);

  const renderGuideContent = () => {
    switch (activeGuideId) {
      case 1:
        return (
          <View style={styles.guideContainer}>
            <Text style={styles.guideHeadline}>Merchant Rules</Text>
            <Text style={styles.guideSummary}>
              Define default categories for your frequent merchants so future and existing transactions categorize automatically.
            </Text>

            {/* Step 1 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>What is a Merchant Pattern?</Text>
                <Text style={styles.stepText}>
                  A keyword, merchant name, or UPI VPA (e.g. <Text style={styles.codeText}>JIO</Text>, <Text style={styles.codeText}>SWIGGY</Text>, <Text style={styles.codeText}>UBER</Text>). Bjet performs case-insensitive matching against transaction descriptions.
                </Text>
              </View>
            </View>

            {/* Step 2 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Set Default Category</Text>
                <Text style={styles.stepText}>
                  Select your target category (e.g. Utility & Bills). Any incoming transaction matching this pattern will automatically inherit this category.
                </Text>
              </View>
            </View>

            {/* Step 3 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Categorize Existing Uncategorized</Text>
                <Text style={styles.stepText}>
                  When you have uncategorized transactions for a merchant, you can apply the rule to all existing uncategorized items with one tap. Already categorized transactions are never overwritten.
                </Text>
              </View>
            </View>

            {/* Example Card */}
            <Card style={styles.exampleCard}>
              <View style={styles.exampleHeader}>
                <Sparkles size={16} color={colors.brandLight} style={{ marginRight: 6 }} />
                <Text style={styles.exampleTitle}>Realistic Example</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Merchant:</Text>
                <Text style={styles.exampleValue}>JIO</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Default Category:</Text>
                <Text style={styles.exampleValueHighlight}>Utility & Bills</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>One-Tap Action:</Text>
                <Text style={styles.exampleValue}>Categorize 17 past transactions + auto-apply to all future JIO bills.</Text>
              </View>
            </Card>
          </View>
        );

      case 2:
        return (
          <View style={styles.guideContainer}>
            <Text style={styles.guideHeadline}>Friends & Reimbursements</Text>
            <Text style={styles.guideSummary}>
              Track money received back from friends and automatically offset your personal spending.
            </Text>

            {/* Step 1 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Friend Name / Pattern</Text>
                <Text style={styles.stepText}>
                  Add your friend's name (e.g. <Text style={styles.codeText}>Rahul</Text>). Bjet detects incoming UPI transfers containing this name.
                </Text>
              </View>
            </View>

            {/* Step 2 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Automatic Reimbursement Direction</Text>
                <Text style={styles.stepText}>
                  Incoming transfers are tagged with <ArrowDownLeft size={14} color={colors.brandLight} /> and marked as reimbursements, not income.
                </Text>
              </View>
            </View>

            {/* Step 3 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Spending Reduction</Text>
                <Text style={styles.stepText}>
                  Reimbursements directly reduce your personal net spending for that month and category, keeping your budget utilization accurate.
                </Text>
              </View>
            </View>

            {/* Example Card */}
            <Card style={styles.exampleCard}>
              <View style={styles.exampleHeader}>
                <CheckCircle2 size={16} color={colors.brandLight} style={{ marginRight: 6 }} />
                <Text style={styles.exampleTitle}>Realistic Example</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Friend:</Text>
                <Text style={styles.exampleValue}>Rahul</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>You Paid at Dinner:</Text>
                <Text style={styles.exampleValue}>₹1,200 (Food & Dining)</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Rahul UPI Transfer:</Text>
                <Text style={styles.exampleValueHighlight}>+₹600 (Reimbursement)</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Your Net Spending:</Text>
                <Text style={styles.exampleValueHighlight}>₹600 (True personal cost)</Text>
              </View>
            </Card>
          </View>
        );

      case 3:
        return (
          <View style={styles.guideContainer}>
            <Text style={styles.guideHeadline}>I Paid for Someone Else</Text>
            <Text style={styles.guideSummary}>
              Accurately record group expenses where you paid upfront on behalf of others.
            </Text>

            {/* Step 1 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Enter Paid-for-Others Amount</Text>
                <Text style={styles.stepText}>
                  When entering or editing a transaction, specify how much of the total payment was for someone else.
                </Text>
              </View>
            </View>

            {/* Step 2 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Excluded from Personal Spending</Text>
                <Text style={styles.stepText}>
                  Under Bjet's accounting rules, the amount paid on behalf of someone else is NOT counted as your personal expense. Only your share counts toward your budget limits.
                </Text>
              </View>
            </View>

            {/* Example Card */}
            <Card style={styles.exampleCard}>
              <View style={styles.exampleHeader}>
                <Receipt size={16} color={colors.warning} style={{ marginRight: 6 }} />
                <Text style={styles.exampleTitle}>Accounting Calculation</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Total Payment:</Text>
                <Text style={styles.exampleValue}>₹1,000</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Paid for a friend:</Text>
                <Text style={styles.exampleValue}>₹300</Text>
              </View>
              <View style={styles.exampleRow}>
                <Text style={styles.exampleLabel}>Personal spending:</Text>
                <Text style={styles.exampleValueHighlight}>₹700</Text>
              </View>
              <Text style={styles.accountingNote}>
                Even though ₹1,000 left your account, only ₹700 is counted toward your monthly personal budget.
              </Text>
            </Card>
          </View>
        );

      case 4:
        return (
          <View style={styles.guideContainer}>
            <Text style={styles.guideHeadline}>Importing Monthly UPI Statements</Text>
            <Text style={styles.guideSummary}>
              Import hundreds of UPI transactions in seconds directly from your official bank or UPI app PDF statements.
            </Text>

            {/* Step 1 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>1</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Select Monthly PDF Statement</Text>
                <Text style={styles.stepText}>
                  Download a monthly statement from Google Pay, Paytm, or PhonePe and select it in the Import tab.
                </Text>
              </View>
            </View>

            {/* Step 2 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>2</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>100% Client-Side PDF Parsing</Text>
                <Text style={styles.stepText}>
                  Bjet uses a local JavaScript PDF engine to extract text directly on your device. No cloud upload, no camera permissions, and no server transmission.
                </Text>
              </View>
            </View>

            {/* Step 3 */}
            <View style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>3</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>Duplicate Detection & Review</Text>
                <Text style={styles.stepText}>
                  Every transaction is compared against your existing local database. Existing transactions are flagged as duplicates so you can review before confirming.
                </Text>
              </View>
            </View>

            {/* Card Note */}
            <Card style={styles.exampleCard}>
              <View style={styles.exampleHeader}>
                <FileText size={16} color={colors.brandLight} style={{ marginRight: 6 }} />
                <Text style={styles.exampleTitle}>Important Tips</Text>
              </View>
              <Text style={styles.accountingNote}>
                • Ensure PDFs are not password-protected (remove password before importing).{'\n'}
                • Supported apps: Google Pay, Paytm, PhonePe.{'\n'}
                • All rules and friend patterns are applied automatically during import!
              </Text>
            </Card>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Help & How It Works</Text>
              <Text style={styles.modalSubtitle}>Offline user guides & examples</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeButton}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Guide Selector Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBar}
          >
            {guidesList.map((guide) => {
              const isActive = guide.id === activeGuideId;
              const IconComp = guide.icon;
              return (
                <TouchableOpacity
                  key={`guide-tab-${guide.id}`}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => setActiveGuideId(guide.id)}
                  activeOpacity={0.7}
                >
                  <IconComp
                    size={16}
                    color={isActive ? colors.brandLight : colors.textMuted}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      isActive && styles.tabButtonTextActive,
                    ]}
                  >
                    {guide.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Guide Body */}
          <ScrollView
            style={styles.guideScroll}
            contentContainerStyle={styles.guideScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {renderGuideContent()}

            <Button
              title="Close Guide"
              variant="outline"
              onPress={onClose}
              style={styles.bottomCloseButton}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '90%',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  closeButton: {
    padding: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tabBar: {
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tabButtonActive: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  tabButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  tabButtonTextActive: {
    color: colors.brandLight,
    fontWeight: fontWeights.bold,
  },
  guideScroll: {
    flexShrink: 1,
  },
  guideScrollContent: {
    paddingBottom: spacing.xxl,
  },
  guideContainer: {
    gap: spacing.md,
  },
  guideHeadline: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  guideSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: colors.brand,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  stepBadgeText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    marginBottom: 2,
  },
  stepText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  codeText: {
    color: colors.brandLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: fontWeights.semibold,
  },
  exampleCard: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  exampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  exampleTitle: {
    color: colors.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  exampleLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  exampleValue: {
    color: colors.text,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  exampleValueHighlight: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  accountingNote: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  bottomCloseButton: {
    marginTop: spacing.lg,
    borderColor: colors.border,
  },
});
