/**
 * Bjet Lite - First-Launch Name Onboarding Modal
 *
 * Prompts user for their display name on first launch if not yet set.
 * Validates, trims, and persists through AuthContext & UserProfileService.
 */
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Sparkles, User as UserIcon } from 'lucide-react-native';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useAuth } from '../../features/auth/AuthContext';
import { colors } from '../../theme/colors';
import { spacing, radii } from '../../theme/spacing';
import { fontSizes, fontWeights } from '../../theme/typography';

export const FirstLaunchOnboardingModal: React.FC = () => {
  const { onboardingCompleted, setDisplayName } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If onboarding is completed, do not render modal
  if (onboardingCompleted) {
    return null;
  }

  const handleContinue = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name to continue.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await setDisplayName(trimmed);
    } catch (err: any) {
      setError(err?.message || 'Failed to save name. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={!onboardingCompleted}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <View style={styles.brandBadge}>
            <Sparkles size={16} color={colors.brandLight} style={{ marginRight: 6 }} />
            <Text style={styles.brandBadgeText}>BJET LITE</Text>
          </View>

          <Text style={styles.title}>What should we call you?</Text>
          <Text style={styles.subtitle}>
            Enter your name to personalize your budget experience. All data stays 100% private on this device.
          </Text>

          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError(null);
            }}
            placeholder="e.g. Parv"
            error={error || undefined}
            autoCapitalize="words"
            autoFocus={true}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
            containerStyle={styles.inputContainer}
          />

          <Button
            title="Continue"
            onPress={handleContinue}
            loading={isSubmitting}
            disabled={!name.trim() || isSubmitting}
            style={styles.continueButton}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    marginBottom: spacing.md,
  },
  brandBadgeText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  inputContainer: {
    width: '100%',
    marginBottom: spacing.md,
  },
  continueButton: {
    width: '100%',
    marginTop: spacing.xs,
  },
});
