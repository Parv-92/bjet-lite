/**
 * Bjet Mobile - Login Screen
 * Real authentication against POST /api/v1/auth/login.
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
import { loginApi } from '../../src/api/auth';
import { getApiErrorMessage } from '../../src/api/client';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { fontSizes, fontWeights } from '../../src/theme/typography';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email address is required')
    .email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setApiError(null);
    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const response = await loginApi({
        email: normalizedEmail,
        password: values.password,
      });

      // Hydrate session and fetch current user profile
      await login(response.access_token);
      router.replace('/(tabs)');
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
        <Text style={styles.title}>Welcome to Bjet</Text>
        <Text style={styles.subtitle}>
          Sign in to manage your budget, track expenses, and scan receipts.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Sign In</Text>

        {apiError && (
          <ErrorMessage
            message={apiError}
            onRetry={() => setApiError(null)}
            style={styles.errorBanner}
          />
        )}

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
              placeholder="••••••••"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              secureTextEntry
              editable={!isSubmitting}
            />
          )}
        />

        <Button
          title="Sign In"
          onPress={handleSubmit(onSubmit)}
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
        />

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            disabled={isSubmitting}
          >
            <Text style={styles.linkText}>Create Account</Text>
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
