import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';

const storage = {
  getItem: (k: string) =>
    isWeb && hasWindow ? Promise.resolve(window.localStorage.getItem(k)) : SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) =>
    isWeb && hasWindow ? (window.localStorage.setItem(k, v), Promise.resolve()) : SecureStore.setItemAsync(k, v),
  removeItem: (k: string) =>
    isWeb && hasWindow ? (window.localStorage.removeItem(k), Promise.resolve()) : SecureStore.deleteItemAsync(k)
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
