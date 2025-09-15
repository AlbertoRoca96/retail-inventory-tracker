import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type UISettings = {
  simplifiedMode: boolean;
  setSimplifiedMode: (v: boolean) => void;
};

const UISettingsContext = createContext<UISettings | null>(null);

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';
const KEY = 'rit:ui:v1:simplified';

async function saveSimplified(v: boolean) {
  const val = v ? '1' : '0';
  if (isWeb && hasWindow) {
    window.localStorage.setItem(KEY, val);
  } else {
    await SecureStore.setItemAsync(KEY, val);
  }
}

async function loadSimplified(): Promise<boolean> {
  let raw: string | null = null;
  if (isWeb && hasWindow) raw = window.localStorage.getItem(KEY);
  else raw = await SecureStore.getItemAsync(KEY);
  return raw === '1';
}

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [simplifiedMode, setSimplifiedModeState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await loadSimplified();
      if (!cancelled) setSimplifiedModeState(v);
    })();
    return () => { cancelled = true; };
  }, []);

  const setSimplifiedMode = (v: boolean) => {
    setSimplifiedModeState(v);
    saveSimplified(v).catch(() => {});
  };

  const value = useMemo(() => ({ simplifiedMode, setSimplifiedMode }), [simplifiedMode]);
  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings() {
  const ctx = useContext(UISettingsContext);
  if (!ctx) throw new Error('useUISettings must be used within UISettingsProvider');
  return ctx;
}
