/**
 * Bjet Mobile - Receipt Scan Tab Screen
 * Phase 5 implementation: Camera, Gallery, and Document Receipt Input.
 * Validates files client-side, previews metadata, and streams to POST /api/v1/transactions/scan-receipt.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { cleanupPdfPageImage } from 'expo-pdf-page-renderer';
import {
  Camera,
  Images,
  FileText,
  ScanLine,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  ReceiptText,
} from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { Button } from '../../src/components/ui/Button';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { ReceiptPreview } from '../../src/components/receipt/ReceiptPreview';
import { CameraCaptureModal } from '../../src/components/receipt/CameraCaptureModal';
import { ExtractionResultModal } from '../../src/components/receipt/ExtractionResultModal';
import {
  ReceiptFile,
  validateReceiptFile,
} from '../../src/types/receipt';
import {
  ReceiptExtractionService,
  ReceiptExtractionResult,
  ExtractionProgress,
  CancellationToken,
  ReceiptInterpretationService,
  statementCandidateStore,
} from '../../src/services/receipt';
import { useReceiptUpload } from '../../src/hooks/useReceiptUpload';
import { useMerchantRules } from '../../src/hooks/useMerchantRules';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useFriends } from '../../src/hooks/useFriends';
import { getApiErrorMessage } from '../../src/api/client';
import { ReceiptScanResponse } from '../../src/types/api';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';
// [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
import { useRenderDiagnostic } from '../../src/utils/perfDiagnostic';

export default function ScanScreen() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<ReceiptFile | null>(null);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successResponse, setSuccessResponse] = useState<ReceiptScanResponse | null>(null);

  // Phase 6: Text extraction state
  const [extractionResult, setExtractionResult] = useState<ReceiptExtractionResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [cancellationToken, setCancellationTokenState] = useState<CancellationToken | null>(null);
  const [extractionModalVisible, setExtractionModalVisible] = useState(false);

  // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
  useRenderDiagnostic('ScanScreen', {
    hasFile: !!selectedFile,
    isExtracting,
    extractionStep: extractionProgress?.step,
    modalVisible: extractionModalVisible,
  });

  const { data: rules } = useMerchantRules();
  const { data: categories } = useCategories();
  const { data: existingTransactions } = useTransactions();
  const { data: friends } = useFriends();

  const {
    uploadReceipt,
    isUploading,
    uploadProgress,
    reset: resetUploadMutation,
  } = useReceiptUpload();

  const handleSelectFile = (file: ReceiptFile) => {
    setServerError(null);
    const validation = validateReceiptFile(file);
    if (!validation.isValid) {
      setValidationError(validation.error || 'Invalid file selected.');
      return;
    }
    // Clean up previous temporary DocumentPicker cached file if replaced
    if (
      selectedFile &&
      selectedFile.uri !== file.uri &&
      selectedFile.source === 'document' &&
      selectedFile.uri.includes('DocumentPicker')
    ) {
      cleanupPdfPageImage(selectedFile.uri).catch(() => {});
    }
    setValidationError(null);
    setSelectedFile(file);
  };

  // 1. Camera Input
  const handleCameraCapture = () => {
    setCameraModalVisible(true);
  };

  // 2. Gallery Input
  const handleGalleryPick = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        setValidationError(
          'Photo library access is required to select receipt images. Please enable permissions in device settings.'
        );
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const file: ReceiptFile = {
          uri: asset.uri,
          name: asset.fileName || `receipt_gallery_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
          source: 'gallery',
          width: asset.width,
          height: asset.height,
        };
        handleSelectFile(file);
      }
    } catch (err) {
      console.error('Gallery picker error:', err);
      setValidationError('Failed to access photo library.');
    }
  };

  // 3. Document / PDF Input
  const handleDocumentPick = async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const fileName = asset.name || `receipt_doc_${Date.now()}`;
        const isPdf = fileName.toLowerCase().endsWith('.pdf');

        const file: ReceiptFile = {
          uri: asset.uri,
          name: fileName,
          mimeType: asset.mimeType || (isPdf ? 'application/pdf' : 'image/jpeg'),
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

  // 4. Upload submission
  const handleUpload = async () => {
    if (!selectedFile) return;

    setServerError(null);
    try {
      const response = await uploadReceipt(selectedFile);
      setSuccessResponse(response);
      setSelectedFile(null);
    } catch (err: any) {
      const message = getApiErrorMessage(err);
      setServerError(message);
    }
  };

  // 5. Phase 6 Text Extraction
  const handleExtractText = async () => {
    if (!selectedFile) return;

    setServerError(null);
    setValidationError(null);
    setIsExtracting(true);
    setExtractionProgress({ step: 'preparing', message: 'Starting extraction...' });

    const token: CancellationToken = { aborted: false };
    setCancellationTokenState(token);

    try {
      const service = new ReceiptExtractionService();
      let lastReportedPage = -1;
      let lastReportedStep = '';

      const result = await service.extract(
        selectedFile,
        progress => {
          // Throttle progress updates to avoid excessive re-renders during multi-page OCR
          if (
            progress.step !== lastReportedStep ||
            (progress.currentPage !== undefined && progress.currentPage !== lastReportedPage)
          ) {
            lastReportedStep = progress.step;
            lastReportedPage = progress.currentPage ?? -1;
            setExtractionProgress(progress);
          }
        },
        token
      );

      setExtractionResult(result);
      setExtractionModalVisible(true);
    } catch (err: any) {
      if (token.aborted || /cancelled/i.test(err?.message || '')) {
        setValidationError('Text extraction cancelled.');
      } else {
        setValidationError(err?.message || 'Failed to extract text from document.');
      }
    } finally {
      setIsExtracting(false);
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

  const handleInterpretAndReview = async (resultToInterpret?: ReceiptExtractionResult | null) => {
    const res = resultToInterpret || extractionResult;
    if (!res || !res.rawText) return;

    try {
      const interpretationService = new ReceiptInterpretationService();
      const parsed = await interpretationService.interpret(res, {
        rules,
        categories,
        existingTransactions,
        friends,
      });

      if (parsed.candidates.length > 0) {
        statementCandidateStore.setSession(
          parsed.candidates,
          parsed.statementMetadata,
          parsed.warnings
        );
        setExtractionModalVisible(false);
        router.push('/receipt-review/statement' as any);
      } else {
        Alert.alert(
          'No Candidates Detected',
          'Could not segment individual transaction candidates from the document text.'
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Interpretation Error',
        err?.message || 'Failed to interpret transaction candidates.'
      );
    }
  };

  const handleReset = () => {
    if (cancellationToken) {
      cancellationToken.aborted = true;
    }
    if (
      selectedFile &&
      selectedFile.source === 'document' &&
      selectedFile.uri.includes('DocumentPicker')
    ) {
      cleanupPdfPageImage(selectedFile.uri).catch(() => {});
    }
    setSelectedFile(null);
    setValidationError(null);
    setServerError(null);
    setSuccessResponse(null);
    setExtractionResult(null);
    setIsExtracting(false);
    setExtractionProgress(null);
    resetUploadMutation();
  };

  return (
    <ScreenContainer scrollable>
      {/* Screen Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Scan Receipt</Text>
        <Text style={styles.subtitle}>
          Capture UPI payment screenshots or upload receipts for automated processing.
        </Text>
      </View>

      {/* Validation Error Banner */}
      {validationError && (
        <ErrorMessage
          message={validationError}
          style={styles.errorBanner}
        />
      )}

      {/* Backend API Error Banner (preserves session, stays on screen) */}
      {serverError && (
        <ErrorMessage
          message={serverError}
          style={styles.errorBanner}
        />
      )}

      {/* SUCCESS STATE */}
      {successResponse ? (
        <Card style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <CheckCircle2 color={colors.brandLight} size={48} />
          </View>
          <Text style={styles.successTitle}>Receipt Uploaded Successfully</Text>
          <Text style={styles.successSubtitle}>
            A draft transaction #{successResponse.transaction.id} has been created with status{' '}
            <Text style={styles.pendingHighlight}>Pending Review</Text>.
          </Text>

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Transaction ID</Text>
              <Text style={styles.summaryValue}>#{successResponse.transaction.id}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Merchant</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {successResponse.transaction.merchant?.clean_name ||
                  successResponse.transaction.merchant_raw_name ||
                  'Draft Receipt'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Status</Text>
              <Text style={styles.summaryValue}>{successResponse.transaction.status}</Text>
            </View>
          </View>

          <View style={styles.successActions}>
            <Button
              title="Review & Confirm Receipt"
              icon={<ArrowRight color={colors.background} size={18} />}
              onPress={() => router.push(`/receipt-review/${successResponse.transaction.id}` as any)}
              variant="primary"
              style={styles.actionButton}
            />
            <Button
              title="View Transaction Details"
              onPress={() => router.push(`/transaction/${successResponse.transaction.id}` as any)}
              variant="secondary"
              style={styles.actionButton}
            />
            <Button
              title="Scan Another Receipt"
              icon={<RotateCcw color={colors.textSecondary} size={16} />}
              onPress={handleReset}
              variant="ghost"
              style={styles.actionButton}
            />
          </View>
        </Card>
      ) : selectedFile ? (
        /* PREVIEW STATE */
        <ReceiptPreview
          file={selectedFile}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          onUpload={handleUpload}
          onReplace={handleReset}
          onCancel={handleReset}
          onExtractText={handleExtractText}
          isExtracting={isExtracting}
          extractionProgress={extractionProgress}
          onCancelExtraction={handleCancelExtraction}
        />
      ) : (
        /* INPUT SELECTION STATE */
        <View style={styles.optionsContainer}>
          <Card style={styles.heroCard}>
            <View style={styles.heroIconCircle}>
              <ScanLine color={colors.brand} size={36} />
            </View>
            <Text style={styles.heroTitle}>Select Receipt Source</Text>
            <Text style={styles.heroDescription}>
              Supported formats: JPEG, PNG, WebP images, or PDF receipts (max 10 MB).
            </Text>
          </Card>

          {/* Option 1: Take Photo */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleCameraCapture}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIconCircle, styles.cameraBg]}>
              <Camera color={colors.brandLight} size={24} />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Take Photo</Text>
              <Text style={styles.optionSubtitle}>
                Use camera to capture physical receipt or screen
              </Text>
            </View>
            <ArrowRight color={colors.textMuted} size={18} />
          </TouchableOpacity>

          {/* Option 2: Photo Library */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleGalleryPick}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIconCircle, styles.galleryBg]}>
              <Images color={colors.info} size={24} />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Choose from Photos</Text>
              <Text style={styles.optionSubtitle}>
                Select UPI screenshots from your photo library
              </Text>
            </View>
            <ArrowRight color={colors.textMuted} size={18} />
          </TouchableOpacity>

          {/* Option 3: Document / PDF */}
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleDocumentPick}
            activeOpacity={0.8}
          >
            <View style={[styles.optionIconCircle, styles.documentBg]}>
              <FileText color={colors.warning} size={24} />
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Choose PDF / Document</Text>
              <Text style={styles.optionSubtitle}>
                Select digital payment receipts or invoices
              </Text>
            </View>
            <ArrowRight color={colors.textMuted} size={18} />
          </TouchableOpacity>
        </View>
      )}

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        visible={cameraModalVisible}
        onCapture={handleSelectFile}
        onClose={() => setCameraModalVisible(false)}
      />

      {/* Phase 6 & 7 Extraction & Review Modal */}
      <ExtractionResultModal
        visible={extractionModalVisible}
        result={extractionResult}
        onClose={() => setExtractionModalVisible(false)}
        onReviewCandidates={() => handleInterpretAndReview(extractionResult)}
      />
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
    fontSize: fontSizes.xxxl,
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
  optionsContainer: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  heroIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    marginBottom: 4,
  },
  heroDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    textAlign: 'center',
    maxWidth: 280,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
  },
  optionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cameraBg: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  galleryBg: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  documentBg: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  optionContent: {
    flex: 1,
    marginRight: spacing.sm,
  },
  optionTitle: {
    color: colors.text,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    marginBottom: 2,
  },
  optionSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 16,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  successTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  successSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  pendingHighlight: {
    color: colors.warning,
    fontWeight: fontWeights.bold,
  },
  summaryBox: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    width: '100%',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  summaryValue: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    maxWidth: '60%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
  },
  successActions: {
    width: '100%',
    gap: spacing.sm,
  },
  actionButton: {
    width: '100%',
  },
});
