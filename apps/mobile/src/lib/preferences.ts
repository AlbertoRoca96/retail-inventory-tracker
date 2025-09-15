import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';

export type UserDefaults = {
  storeSite?: string;
  storeLocation?: string;
  brand?: string;
};

// Keyed by user and optionally team, so different teams can have different defaults
function keyFor(uid: string | null | undefined, teamId: string | null | undefined) {
  const u = uid || 'anon';
  const t = teamId || 'no-team';
  return `rit:user-defaults:v1:${u}:${t}`;
}

export async function saveUserDefaults(
  uid: string | null | undefined,
  teamId: string | null | undefined,
  prefs: UserDefaults
): Promise<void> {
  const key = keyFor(uid, teamId);
  const value = JSON.stringify(prefs);
  if (isWeb && hasWindow) {
    window.localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function loadUserDefaults(
  uid: string | null | undefined,
  teamId: string | null | undefined
): Promise<UserDefaults | null> {
  const key = keyFor(uid, teamId);
  let raw: string | null = null;
  if (isWeb && hasWindow) {
    raw = window.localStorage.getItem(key);
  } else {
    raw = await SecureStore.getItemAsync(key);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserDefaults;
  } catch {
    return null;
  }
}

export async function clearUserDefaults(
  uid: string | null | undefined,
  teamId: string | null | undefined
): Promise<void> {
  const key = keyFor(uid, teamId);
  if (isWeb && hasWindow) {
    window.localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}
