/**
 * Bjet Mobile API Client
 * Configured with Axios, SecureStore token persistence, Bearer authorization,
 * trailing slash normalization, robust 401 interceptor, and API error parsing.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { APIError } from '../types/api';

const TOKEN_KEY = 'bjet_auth_token';

/**
 * API Environment Architecture
 *
 * DEVELOPMENT (__DEV__ === true):
 * - Defaults to 'http://localhost:8000/api/v1' for local FastAPI development.
 * - Physical device testing requires USB reverse (adb reverse tcp:8000 tcp:8000).
 *
 * LOCAL RELEASE TESTING (EXPO_PUBLIC_ALLOW_LOCAL_RELEASE === 'true'):
 * - Explicit opt-in for physical device release profiling against a local dev server.
 * - Defaults to 'http://localhost:8000/api/v1'.
 *
 * PRODUCTION (__DEV__ === false):
 * - Requires an explicit EXPO_PUBLIC_API_BASE_URL.
 * - Must use HTTPS protocol.
 * - Rejects localhost and 127.0.0.1.
 * - Never silently falls back to localhost.
 */
export function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const allowLocalRelease = process.env.EXPO_PUBLIC_ALLOW_LOCAL_RELEASE === 'true';

  // 1. Development mode or explicit local release testing
  if (__DEV__ || allowLocalRelease) {
    const devUrl = envUrl || 'http://localhost:8000/api/v1';
    return devUrl.replace(/\/+$/, '');
  }

  // 2. Production mode validation
  if (!envUrl) {
    throw new Error(
      'Production API endpoint is not configured yet. Production builds require an explicit HTTPS EXPO_PUBLIC_API_BASE_URL.'
    );
  }

  const normalized = envUrl.replace(/\/+$/, '');

  if (!normalized.startsWith('https://')) {
    throw new Error(
      `Invalid production API URL "${normalized}": Production API endpoint must use HTTPS protocol.`
    );
  }

  if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
    throw new Error(
      `Invalid production API URL "${normalized}": Production API endpoint cannot point to localhost or loopback in production.`
    );
  }

  return normalized;
}

export const API_BASE_URL = resolveApiBaseUrl();

// In-memory token cache to prevent async JNI bridge races and stale 401 session destruction
let inMemoryToken: string | null = null;

// --- SecureStore Token Helpers ---

export async function getStoredToken(): Promise<string | null> {
  if (inMemoryToken) {
    return inMemoryToken;
  }
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    inMemoryToken = token;
    return token;
  } catch (error) {
    console.error('Error reading token from SecureStore:', error);
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  inMemoryToken = token;
  isSessionExpiring = false;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving token to SecureStore:', error);
    throw error;
  }
}

export async function clearStoredToken(): Promise<void> {
  inMemoryToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error clearing token from SecureStore:', error);
  }
}

// --- Unauthorized (401) Event Handlers ---

type UnauthorizedListener = () => void;
let unauthorizedListeners: UnauthorizedListener[] = [];
let isSessionExpiring = false;

export function resetSessionExpiring(): void {
  isSessionExpiring = false;
}

export function registerUnauthorizedHandler(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.push(listener);
  return () => {
    unauthorizedListeners = unauthorizedListeners.filter((l) => l !== listener);
  };
}

function notifyUnauthorized(): void {
  if (isSessionExpiring) {
    return;
  }
  isSessionExpiring = true;
  unauthorizedListeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('Error in unauthorized listener:', err);
    }
  });
}

/**
 * Extract normalized pathname from URL to robustly determine endpoint.
 */
export function getRequestPathname(url?: string): string {
  if (!url) return '';
  let path = url;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      path = new URL(url).pathname;
    }
  } catch {
    // Fallback if URL constructor fails
  }
  // Remove query parameters and trailing slashes
  return path.split('?')[0].split('#')[0].replace(/\/+$/, '');
}

// --- Axios Client ---

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request Interceptor: Attach Bearer Token & Strip Trailing Slashes
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Strip trailing slash from relative URL if present
    if (config.url && config.url.length > 1 && config.url.endsWith('/')) {
      config.url = config.url.replace(/\/+$/, '');
    }

    const token = await getStoredToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY] Record start time for performance tracking
    (config as any)._perfStartTime = Date.now();

    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// Response Interceptor: Robust 401 handling & Error extraction & [PERF][API] logging
apiClient.interceptors.response.use(
  (response) => {
    // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY] Log API success timing
    const startTime = (response.config as any)?._perfStartTime || Date.now();
    const endTime = Date.now();
    const duration = endTime - startTime;
    const url = response.config.url || '';
    const method = response.config.method?.toUpperCase() || 'GET';
    const status = response.status;
    const dataSize = response.data ? JSON.stringify(response.data).length : 0;
    console.log(
      `[PERF][API]\nEndpoint: ${method} ${url}\nStart: ${new Date(startTime).toISOString()}\nEnd: ${new Date(endTime).toISOString()}\nDuration: ${duration} ms\nStatus: ${status}\nResponse Size: ${dataSize} bytes`
    );

    return response;
  },
  (error: AxiosError<APIError>) => {
    // [DIAGNOSTIC INSTRUMENTATION - TEMPORARY] Log API failure timing
    const startTime = (error.config as any)?._perfStartTime || Date.now();
    const endTime = Date.now();
    const duration = endTime - startTime;
    const url = error.config?.url || '';
    const method = error.config?.method?.toUpperCase() || 'GET';
    const status = error.response?.status || 'ERROR';
    console.log(
      `[PERF][API]\nEndpoint: ${method} ${url}\nStart: ${new Date(startTime).toISOString()}\nEnd: ${new Date(endTime).toISOString()}\nDuration: ${duration} ms\nStatus: ${status} (FAILED)`
    );

    if (error.response?.status === 401) {
      const pathname = getRequestPathname(error.config?.url);
      // Exclude public authentication endpoints (/auth/login, /auth/register)
      // from automatic session-clearing to prevent login redirect loops
      const isPublicAuthEndpoint =
        pathname.endsWith('/auth/login') || pathname.endsWith('/auth/register');

      if (!isPublicAuthEndpoint) {
        // Extract the Bearer token that was actually sent with this failed request
        const rawAuth =
          error.config?.headers?.Authorization ||
          error.config?.headers?.['authorization'] ||
          (typeof error.config?.headers?.get === 'function'
            ? error.config.headers.get('Authorization')
            : undefined);

        const requestToken =
          typeof rawAuth === 'string'
            ? rawAuth.replace(/^Bearer\s+/i, '').trim()
            : undefined;

        // CRITICAL RACE PREVENTION:
        // A 401 error must only invalidate the active session if:
        // 1. The request was actually sent WITH an authentication token.
        // 2. The token on the failed request matches the CURRENT in-memory active token.
        // Stale 401 responses from past sessions or requests sent without tokens must NEVER destroy a new session.
        if (requestToken && inMemoryToken && requestToken === inMemoryToken) {
          notifyUnauthorized();
        } else {
          console.warn('[API] Ignored stale or unauthenticated 401 error from:', pathname);
        }
      }
    }

    return Promise.reject(error);
  }
);

// --- Error Helper ---

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // Network / connectivity failures
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      return 'Unable to connect to the Bjet server. Please check your connection.';
    }
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }

    const data = error.response?.data as APIError | undefined;
    if (data?.detail) {
      if (typeof data.detail === 'string') {
        return data.detail;
      }
      if (Array.isArray(data.detail)) {
        return data.detail.map((err) => err.msg).join(', ');
      }
    }
    if (error.response?.status === 401) {
      return 'Incorrect email or password.';
    }
    if (error.response?.status === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (error.response?.status === 404) {
      return 'Requested resource not found.';
    }
    if (error.response?.status && error.response.status >= 500) {
      return 'Server error occurred. Please try again later.';
    }
    if (error.message) {
      return error.message;
    }
  } else if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

export default apiClient;
