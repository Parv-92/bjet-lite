/**
 * Bjet Lite - Persistent User Profile & Onboarding Service
 *
 * Stores user display name and onboarding status locally.
 * Works across Android, iOS, and Web (with localStorage fallback).
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PROFILE_KEY = 'bjet_lite_user_profile';
const ONBOARDING_KEY = 'bjet_lite_onboarding_completed';

export interface StoredUserProfile {
  full_name: string | null;
  email: string;
}

const DEFAULT_PROFILE: StoredUserProfile = {
  full_name: null,
  email: 'local@bjet.lite',
};

// In-memory fallback
let memoryStorage: Record<string, string> = {};

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return memoryStorage[key] || null;
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn(`[UserProfileService] SecureStore read failed for ${key}:`, err);
    return memoryStorage[key] || null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  memoryStorage[key] = value;

  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
    return;
  }

  try {
    await SecureStore.setItemAsync(key, value);
  } catch (err) {
    console.warn(`[UserProfileService] SecureStore write failed for ${key}:`, err);
  }
}

/**
 * Retrieves the stored user profile.
 */
export async function getStoredUserProfile(): Promise<StoredUserProfile> {
  try {
    const raw = await getItem(PROFILE_KEY);
    if (!raw) {
      return DEFAULT_PROFILE;
    }
    const parsed = JSON.parse(raw);
    return {
      full_name: typeof parsed.full_name === 'string' && parsed.full_name.trim().length > 0
        ? parsed.full_name.trim()
        : null,
      email: parsed.email || 'local@bjet.lite',
    };
  } catch (err) {
    console.warn('[UserProfileService] Error parsing user profile:', err);
    return DEFAULT_PROFILE;
  }
}

/**
 * Persists the user's display name and optional email.
 */
export async function saveStoredUserProfile(profile: { full_name: string; email?: string }): Promise<StoredUserProfile> {
  const trimmed = profile.full_name.trim();
  const updated: StoredUserProfile = {
    full_name: trimmed,
    email: profile.email || 'local@bjet.lite',
  };

  await setItem(PROFILE_KEY, JSON.stringify(updated));
  await setItem(ONBOARDING_KEY, 'true');
  return updated;
}

/**
 * Checks whether the user has completed the first-launch name onboarding.
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const status = await getItem(ONBOARDING_KEY);
    if (status === 'true') {
      const profile = await getStoredUserProfile();
      return !!(profile.full_name && profile.full_name.trim().length > 0);
    }
    return false;
  } catch {
    return false;
  }
}
