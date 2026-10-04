/**
 * Bjet Mobile - Register Screen
 * Real registration against POST /api/v1/auth/register followed by
 * seamless session establishment via POST /api/v1/auth/login.
 * Implemented with React Hook Form, Zod validation, and Bjet dark theme.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ScreenContainer } from '../../src/components/common/ScreenContainer';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { ErrorMessage } from '../../src/components/ui/ErrorMessage';
import { useAuth } from '../../src/hooks/useAuth';
import { registerApi, loginApi } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/client';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

const registerSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .optional()
      .or(z.literal('')),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Email address is required')
      .email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const router = useRouter();
  const { login, logout } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      confirm_password: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setApiError(null);
    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      // 1. Create account with backend
      await registerApi({
        email: normalizedEmail,
        password: values.password,
        full_name: values.full_name?.trim() ? values.full_name.trim() : undefined,
      });

      // 2. Seamless auto-login to establish session
      try {
        const loginRes = await loginApi({
          email: normalizedEmail,
          password: values.password,
        });

        // 3. Hydrate session and obtain user profile
        await login(loginRes.access_token);
        router.replace('/(tabs)');
      } catch (loginErr) {
        // If auto-login or getMe failed, ensure partial session is cleaned up
        console.warn('Auto-login failed after registration. Cleaning up partial session.');
        await logout();
        // Redirect to login screen so user can authenticate manually
        router.replace('/(auth)/login');
      }
    } catch (error) {
      const message = getApiErrorMessage(error);
      setApiError(message);
    }
  };

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>BJET MOBILE</Text>
        </View>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Start tracking your personal finances and receipts with Bjet.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Sign Up</Text>

        {apiError && (
          <ErrorMessage
            message={apiError}
            onRetry={() => setApiError(null)}
            style={styles.errorBanner}
          />
        )}

        <Controller
          control={control}
          name="full_name"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Full Name (Optional)"
              placeholder="Jane Doe"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.full_name?.message}
              autoCapitalize="words"
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Email Address"
              placeholder="user@example.com"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Password"
              placeholder="At least 6 characters"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              secureTextEntry
              editable={!isSubmitting}
            />
          )}
        />

        <Controller
          control={control}
          name="confirm_password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Confirm Password"
              placeholder="••••••••"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.confirm_password?.message}
              secureTextEntry
              editable={!isSubmitting}
            />
          )}
        />

        <Button
          title="Create Account"
          onPress={handleSubmit(onSubmit)}
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
        />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/login')}
            disabled={isSubmitting}
          >
            <Text style={styles.linkText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  badge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: colors.brand,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 9999,
    marginBottom: spacing.md,
  },
  badgeText: {
    color: colors.brandLight,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  card: {
    padding: spacing.xl,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.lg,
  },
  errorBanner: {
    marginBottom: spacing.lg,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  linkText: {
    color: colors.brandLight,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
});
