/**
 * Bjet Mobile - Root Layout
 * Provides SafeAreaProvider, QueryClientProvider, AuthProvider,
 * and unified RouteGuard with recoverable offline/network error handling.
 */
import '../src/services/receipt/extractors/domMatrixPolyfill';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/queryClient';
import { AuthProvider } from '../src/features/auth/AuthContext';
import { useAuth } from '../src/hooks/useAuth';
import { colors } from '../src/theme/colors';
import { spacing } from '../src/theme/spacing';
import { fontSizes, fontWeights } from '../src/theme/typography';
import { LoadingSpinner } from '../src/components/ui/LoadingSpinner';
import { Button } from '../src/components/ui/Button';
import { fileLifecycleService } from '../src/services/receipt';
import { initDatabase } from '../src/db';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    // In Bjet Lite, the app is purely local-first and does not require authentication.
    // If navigation inadvertently enters (auth), immediately redirect to main tabs.
    if (inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [segments, router]);

  return <>{children}</>;
}


export default function RootLayout() {
  useEffect(() => {
    // Eagerly initialize Bjet Lite SQLite database (applies migrations and seeds default categories)
    initDatabase().catch(err => {
      console.warn('[SQLite] Startup initialization warning:', err);
    });

    // Startup sanitation sweep for stale Bjet temporary import artifacts (> 30 minutes)
    fileLifecycleService.sanitizeOrphans(30 * 60 * 1000).catch(err => {
      console.warn('[FileLifecycle] Startup sanitation warning:', err);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouteGuard>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="transaction/[id]" />
              <Stack.Screen name="transaction/create" />
              <Stack.Screen name="transaction/edit/[id]" />
              <Stack.Screen name="receipt-review/[id]" />
              <Stack.Screen name="receipt-review/statement" />
              <Stack.Screen name="budget/create" />
              <Stack.Screen name="budget/edit/[categoryId]" />
              <Stack.Screen name="categories" />
              <Stack.Screen name="category/create" />
              <Stack.Screen name="category/edit/[id]" />
              <Stack.Screen name="rules" />
              <Stack.Screen name="rule/create" />
              <Stack.Screen name="rule/edit/[id]" />
            </Stack>
          </RouteGuard>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  retryButton: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  switchButton: {
    width: '100%',
  },
});
