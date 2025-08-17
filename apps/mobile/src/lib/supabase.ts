import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const storage = {
  getItem: (k: string) =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(k)) : SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) =>
    Platform.OS === 'web' ? (localStorage.setItem(k, v), Promise.resolve()) : SecureStore.setItemAsync(k, v),
  removeItem: (k: string) =>
    Platform.OS === 'web' ? (localStorage.removeItem(k), Promise.resolve()) : SecureStore.deleteItemAsync(k),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
