/**
 * Bjet Mobile - UPI Statement Import Screen (Phase 6 Simplification)
 * Offers solely UPI Monthly Statement Import via local PDF text extraction.
 * No camera, gallery, cloud upload, or OCR dependencies.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  FileText,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Upload,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { LoadingSpinner } from '../../src/components/ui/LoadingSpinner';
import {
  ReceiptFile,
  validateReceiptFile,
} from '../../src/types/receipt';
import {
  ReceiptExtractionService,
  ExtractionProgress,
  CancellationToken,
  ReceiptInterpretationService,
  statementCandidateStore,
  fileLifecycleService,
} from '../../src/services/receipt';
import { useMerchantRules } from '../../src/hooks/useMerchantRules';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useFriends } from '../../src/hooks/useFriends';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

export default function ScanScreen() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<ReceiptFile | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [cancellationToken, setCancellationTokenState] = useState<CancellationToken | null>(null);

  const { data: rules } = useMerchantRules();
  const { data: categories } = useCategories();
  const { data: existingTransactions } = useTransactions();
  const { data: friends } = useFriends();

  const handleSelectFile = (file: ReceiptFile) => {
    const validation = validateReceiptFile(file);
    if (!validation.isValid) {
      setValidationError(validation.error || 'Invalid file selected.');
      return;
    }
    fileLifecycleService.registerSourceFile(file.uri).catch(() => {});
    setValidationError(null);
    setSelectedFile(file);
  };

  const handleDocumentPick = async () => {
    try {
      setValidationError(null);
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const fileName = asset.name || `statement_${Date.now()}.pdf`;

        if (!fileName.toLowerCase().endsWith('.pdf')) {
          setValidationError('Please select a valid PDF statement file.');
          return;
        }

        const file: ReceiptFile = {
          uri: asset.uri,
          name: fileName,
          mimeType: 'application/pdf',
          size: asset.size,
          source: 'document',
        };
        handleSelectFile(file);
      }
    } catch (err) {
      console.error('Document picker error:', err);
      setValidationError('Failed to select document.');
    }
  };

  const handleImportAndReview = async () => {
    if (!selectedFile) return;

    setValidationError(null);
    setIsExtracting(true);
    fileLifecycleService.setProcessing(true);
    setExtractionProgress({ step: 'preparing', message: 'Reading statement...' });

    const token: CancellationToken = { aborted: false };
    setCancellationTokenState(token);

    try {
      const extractionService = new ReceiptExtractionService();
      const result = await extractionService.extract(
        selectedFile,
        (progress) => setExtractionProgress(progress),
        token
      );

      if (!result.rawText || result.rawText.trim().length === 0) {
        throw new Error('No readable text found in the PDF. Please ensure the PDF is not password-protected.');
      }

      setExtractionProgress({ step: 'classifying', message: 'Identifying transactions...' });

      const interpretationService = new ReceiptInterpretationService();
      const parsed = await interpretationService.interpret(result, {
        rules,
        categories,
        existingTransactions,
        friends,
      });

      if (parsed.candidates.length > 0) {
        statementCandidateStore.setSession(
          parsed.candidates,
          parsed.statementMetadata,
          parsed.warnings,
          selectedFile.uri
        );
        setSelectedFile(null);
        router.push('/receipt-review/statement' as any);
      } else {
        await fileLifecycleService.cleanupActiveSourceFile().catch(() => {});
        Alert.alert(
          'No Transactions Detected',
          'Could not find supported UPI transaction patterns in this PDF. Please verify this is an official statement from Google Pay, Paytm, or PhonePe.'
        );
      }
    } catch (err: any) {
      if (token.aborted || /cancelled/i.test(err?.message || '')) {
        setValidationError('Statement import cancelled.');
      } else {
        setValidationError(err?.message || 'Failed to process statement PDF.');
      }
    } finally {
      setIsExtracting(false);
      fileLifecycleService.setProcessing(false);
      setExtractionProgress(null);
      setCancellationTokenState(null);
    }
  };

  const handleCancelExtraction = () => {
    if (cancellationToken) {
      cancellationToken.aborted = true;
    }
    setIsExtracting(false);
    setExtractionProgress(null);
  };

  const handleReset = () => {
    if (cancellationToken) {
      cancellationToken.aborted = true;
    }
    fileLifecycleService.cleanupActiveSourceFile().catch(() => {});
    setSelectedFile(null);
    setValidationError(null);
    setIsExtracting(false);
    setExtractionProgress(null);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScreenContainer scrollable>
      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.title}>UPI Statement Import</Text>
        <Text style={styles.subtitle}>
          Import statements from Google Pay, Paytm, or PhonePe.
        </Text>
      </View>

      {/* Validation Error Banner */}
      {validationError && (
        <ErrorMessage
          message={validationError}
          style={styles.errorBanner}
        />
      )}

      {selectedFile ? (
        /* Selected File Ready State */
        <Card style={styles.selectedCard}>
          <View style={styles.fileIconCircle}>
            <FileText color={colors.brandLight} size={36} />
          </View>
          <Text style={styles.fileName} numberOfLines={2}>
            {selectedFile.name}
          </Text>
          <Text style={styles.fileMeta}>
            PDF ({formatFileSize(selectedFile.size)})
          </Text>

          {isExtracting ? (
            <View style={styles.extractingContainer}>
              <LoadingSpinner
                size="large"
                label={extractionProgress?.message || 'Parsing statement...'}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={handleCancelExtraction}
                style={styles.cancelExtractButton}
              />
            </View>
          ) : (
            <View style={styles.actionGroup}>
              <Button
                title="Import & Review Transactions"
                icon={<ArrowRight color={colors.background} size={18} />}
                onPress={handleImportAndReview}
                variant="primary"
                style={styles.primaryActionButton}
              />
              <Button
                title="Choose Another PDF"
                icon={<RotateCcw color={colors.textSecondary} size={16} />}
                onPress={handleReset}
                variant="outline"
                style={styles.secondaryActionButton}
              />
            </View>
          )}
        </Card>
      ) : (
        /* Document Picker Entry State */
        <View style={styles.mainContainer}>
          <Card style={styles.heroCard}>
            <View style={styles.heroIconCircle}>
              <Upload color={colors.brand} size={36} />
            </View>
            <Text style={styles.heroTitle}>Select statement</Text>
            <Text style={styles.heroDescription}>
              Select a statement PDF to extract transactions.
            </Text>

            <Button
              title="Select statement PDF"
              icon={<FileText color={colors.background} size={18} />}
              onPress={handleDocumentPick}
              style={styles.selectButton}
            />
          </Card>

          {/* Supported Providers Card */}
          <Card style={styles.providersCard}>
            <Text style={styles.sectionHeading}>Supported formats</Text>

            <View style={styles.providerRow}>
              <CheckCircle2 color={colors.brandLight} size={18} style={styles.checkIcon} />
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>Google Pay</Text>
                <Text style={styles.providerDesc}>Monthly statement</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.providerRow}>
              <CheckCircle2 color={colors.brandLight} size={18} style={styles.checkIcon} />
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>Paytm</Text>
                <Text style={styles.providerDesc}>Transaction statement</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.providerRow}>
              <CheckCircle2 color={colors.brandLight} size={18} style={styles.checkIcon} />
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>PhonePe</Text>
                <Text style={styles.providerDesc}>Account statement</Text>
              </View>
            </View>
          </Card>

          {/* Privacy & Offline Guarantee Card */}
          <Card style={styles.privacyCard}>
            <View style={styles.privacyHeader}>
              <ShieldCheck color={colors.brandLight} size={20} style={{ marginRight: spacing.xs }} />
              <Text style={styles.privacyTitle}>Local processing</Text>
            </View>
            <Text style={styles.privacyText}>
              Statements are processed directly on this device. Financial records are never uploaded to external servers.
            </Text>
          </Card>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: 4,
    lineHeight: 20,
  },
  errorBanner: {
    marginBottom: spacing.md,
  },
  mainContainer: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  heroIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
    maxWidth: 300,
  },
  selectButton: {
    minWidth: 220,
  },
  providersCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sectionHeading: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    marginBottom: spacing.sm,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  checkIcon: {
    marginRight: spacing.sm,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  providerDesc: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginVertical: spacing.xs,
  },
  privacyCard: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    padding: spacing.md,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  privacyTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  privacyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
  selectedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  fileIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(20, 184, 166, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  fileName: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: 4,
  },
  fileMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginBottom: spacing.xl,
  },
  actionGroup: {
    width: '100%',
    gap: spacing.sm,
  },
  primaryActionButton: {
    width: '100%',
  },
  secondaryActionButton: {
    width: '100%',
    borderColor: colors.border,
  },
  extractingContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cancelExtractButton: {
    marginTop: spacing.md,
  },
});
