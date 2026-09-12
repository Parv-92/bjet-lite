/**
 * Bjet Mobile - Authentication Context (Phase 13)
 * Manages 4-state authentication lifecycle:
 * AUTH_INITIALIZING -> AUTHENTICATED <-> UNAUTHENTICATED, with SESSION_EXPIRING teardown.
 * Backed by SecureStore persistence, strict query cancellation, cache isolation,
 * in-memory store cleanup, and single-flight 401 error handling.
 */
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { User } from '../../types/api';
import {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  registerUnauthorizedHandler,
  resetSessionExpiring,
  getApiErrorMessage,
} from '../../api/client';
import { getMeApi } from '../../api/auth';
import { queryClient } from '../../lib/queryClient';
import { statementCandidateStore } from '../../services/receipt/statementCandidateStore';

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
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retrySessionRestore: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('AUTH_INITIALIZING');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Complete session teardown sequence:
  // 1. Mark session as expiring (immediately disables all authenticated queries)
  // 2. Cancel in-flight queries
  // 3. Clear React Query caches
  // 4. Clear in-memory candidate review session
  // 5. Clear stored credentials in SecureStore
  // 6. Reset local user/session state to UNAUTHENTICATED
  const clearSession = useCallback(async () => {
    try {
      setAuthStatus('SESSION_EXPIRING');

      // Cancel all active queries so late network responses cannot repopulate the cache
      await queryClient.cancelQueries();

      // Wipe all user-specific data from React Query
      queryClient.clear();

      // Clear in-memory statement candidate review session
      statementCandidateStore.clearSession();

      // Clear credentials from SecureStore
      await clearStoredToken();
    } catch (err) {
      console.error('Failed to cleanly teardown session:', err);
    } finally {
      setToken(null);
      setUser(null);
      setSessionError(null);
      setAuthStatus('UNAUTHENTICATED');
      resetSessionExpiring();
    }
  }, []);

  // Session restoration on app startup:
  // - 200 -> restore session -> AUTHENTICATED
  // - 401 -> clear token and require login -> UNAUTHENTICATED
  // - Network/timeout/5xx -> preserve stored token, expose recoverable error state
  const restoreSession = useCallback(async () => {
    setAuthStatus('AUTH_INITIALIZING');
    setSessionError(null);

    try {
      const storedToken = await getStoredToken();
      if (!storedToken) {
        setToken(null);
        setUser(null);
        setAuthStatus('UNAUTHENTICATED');
        return;
      }

      setToken(storedToken);

      try {
        const currentUser = await getMeApi();
        setUser(currentUser);
        setAuthStatus('AUTHENTICATED');
        resetSessionExpiring();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          console.warn('Stored token is invalid or expired (401). Clearing session.');
          await clearSession();
        } else {
          console.warn('Network or server error during session restoration. Preserving stored token.');
          const message = getApiErrorMessage(error);
          setSessionError(message);
          setAuthStatus('UNAUTHENTICATED');
        }
      }
    } catch (err) {
      console.error('Failed to read token during session restoration:', err);
      setAuthStatus('UNAUTHENTICATED');
    }
  }, [clearSession]);

  // Initial mount restoration
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Listen for unauthorized 401 events from authenticated requests via callback bridge
  useEffect(() => {
    const unregister = registerUnauthorizedHandler(() => {
      clearSession();
    });
    return unregister;
  }, [clearSession]);

  // Log in user with newly obtained token and hydrate user profile:
  const login = useCallback(async (newToken: string) => {
    try {
      await setStoredToken(newToken);
      setToken(newToken);

      const currentUser = await getMeApi();
      setUser(currentUser);
      setSessionError(null);
      setAuthStatus('AUTHENTICATED');
      resetSessionExpiring();

      // Refetch authoritative backend data for this newly authenticated user
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
    } catch (error) {
      console.error('Failed to hydrate user after token storage. Cleaning up partial session.');
      await clearSession();
      throw error;
    }
  }, [clearSession]);

  // Explicit user logout
  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  // Refresh current user profile
  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await getMeApi();
      setUser(currentUser);
      setSessionError(null);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await clearSession();
      }
      throw error;
    }
  }, [clearSession]);

  const isAuthenticated = authStatus === 'AUTHENTICATED';
  const isAuthLoading = authStatus === 'AUTH_INITIALIZING' || authStatus === 'SESSION_EXPIRING';

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    authStatus,
    isLoading: isAuthLoading,
    isAuthenticated,
    isAuthLoading,
    sessionError,
    login,
    logout,
    refreshUser,
    retrySessionRestore: restoreSession,
  }), [user, token, authStatus, isAuthLoading, isAuthenticated, sessionError, login, logout, refreshUser, restoreSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
