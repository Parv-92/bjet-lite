/**
 * Bjet Mobile - Authentication & Local Profile Context
 * Manages local user profile, display name persistence, and first-launch onboarding status.
 */
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '../../types/api';
import { queryClient } from '../../lib/queryClient';
import { statementCandidateStore } from '../../services/receipt/statementCandidateStore';
import {
  getStoredUserProfile,
  saveStoredUserProfile,
  hasCompletedOnboarding,
} from '../../services/userProfile';

export { useAuth } from '../../hooks/useAuth';

export type AuthStatus =
  | 'AUTH_INITIALIZING'
  | 'AUTHENTICATED'
  | 'SESSION_EXPIRING'
  | 'UNAUTHENTICATED';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  authStatus: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  sessionError: string | null;
  onboardingCompleted: boolean;
  setDisplayName: (name: string) => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retrySessionRestore: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

import { LOCAL_LITE_USER } from './constants';
export { LOCAL_LITE_USER };

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('AUTHENTICATED');
  const [user, setUser] = useState<User | null>(LOCAL_LITE_USER);
  const [token, setToken] = useState<string | null>('lite_local_session');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(true);

  const restoreSession = useCallback(async () => {
    try {
      const profile = await getStoredUserProfile();
      const completed = await hasCompletedOnboarding();
      setOnboardingCompleted(completed);

      setUser({
        ...LOCAL_LITE_USER,
        full_name: profile.full_name || 'Bjet User',
        email: profile.email || LOCAL_LITE_USER.email,
      });
    } catch {
      setUser(LOCAL_LITE_USER);
      setOnboardingCompleted(true);
    }
    setToken('lite_local_session');
    setSessionError(null);
    setAuthStatus('AUTHENTICATED');
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const setDisplayName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Name cannot be empty.');
    }
    const updated = await saveStoredUserProfile({ full_name: trimmed });
    setUser((prev) => (prev ? { ...prev, full_name: updated.full_name || trimmed } : { ...LOCAL_LITE_USER, full_name: trimmed }));
    setOnboardingCompleted(true);
  }, []);

  const clearSession = useCallback(async () => {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      statementCandidateStore.clearSession();
    } catch (err) {
      console.error('Failed to cleanly reset session:', err);
    } finally {
      await restoreSession();
    }
  }, [restoreSession]);

  const login = useCallback(async (newToken: string) => {
    await restoreSession();
    if (newToken) setToken(newToken);
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['rules'] });
  }, [restoreSession]);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    await restoreSession();
  }, [restoreSession]);

  const isAuthenticated = true;
  const isAuthLoading = false;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      authStatus,
      isLoading: isAuthLoading,
      isAuthenticated,
      isAuthLoading,
      sessionError,
      onboardingCompleted,
      setDisplayName,
      login,
      logout,
      refreshUser,
      retrySessionRestore: restoreSession,
    }),
    [
      user,
      token,
      authStatus,
      isAuthLoading,
      isAuthenticated,
      sessionError,
      onboardingCompleted,
      setDisplayName,
      login,
      logout,
      refreshUser,
      restoreSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
