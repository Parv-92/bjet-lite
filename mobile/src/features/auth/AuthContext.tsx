/**
 * Bjet Mobile - Authentication Context (Phase 13)
 * Manages 4-state authentication lifecycle:
 * AUTH_INITIALIZING -> AUTHENTICATED <-> UNAUTHENTICATED, with SESSION_EXPIRING teardown.
 * Backed by SecureStore persistence, strict query cancellation, cache isolation,
 * in-memory store cleanup, and single-flight 401 error handling.
 */
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from '../../types/api';
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

import { LOCAL_LITE_USER } from './constants';
export { LOCAL_LITE_USER };



export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('AUTHENTICATED');
  const [user, setUser] = useState<User | null>(LOCAL_LITE_USER);
  const [token, setToken] = useState<string | null>('lite_local_session');
  const [sessionError, setSessionError] = useState<string | null>(null);

  const clearSession = useCallback(async () => {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      statementCandidateStore.clearSession();
    } catch (err) {
      console.error('Failed to cleanly reset session:', err);
    } finally {
      setUser(LOCAL_LITE_USER);
      setToken('lite_local_session');
      setSessionError(null);
      setAuthStatus('AUTHENTICATED');
    }
  }, []);

  const restoreSession = useCallback(async () => {
    setUser(LOCAL_LITE_USER);
    setToken('lite_local_session');
    setSessionError(null);
    setAuthStatus('AUTHENTICATED');
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (newToken: string) => {
    setUser(LOCAL_LITE_USER);
    setToken(newToken || 'lite_local_session');
    setSessionError(null);
    setAuthStatus('AUTHENTICATED');
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['rules'] });
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    setUser(LOCAL_LITE_USER);
    setSessionError(null);
  }, []);

  const isAuthenticated = true;
  const isAuthLoading = false;

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

