import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type UIDensity = 'comfortable' | 'cozy' | 'compact';
export type UISettings = {
  simplifiedMode: boolean;
  setSimplifiedMode: (v: boolean) => void;
  density: UIDensity;
  setDensity: (d: UIDensity) => void;
};

const UISettingsContext = createContext<UISettings | null>(null);

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';
const KEY = 'rit:ui:v1:simplified';
const DENSITY_KEY = 'rit:ui:v1:density';

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

async function saveDensity(d: UIDensity) {
  if (isWeb && hasWindow) window.localStorage.setItem(DENSITY_KEY, d);
  else await SecureStore.setItemAsync(DENSITY_KEY, d);
}
async function loadDensity(): Promise<UIDensity> {
  let raw: string | null = null;
  if (isWeb && hasWindow) raw = window.localStorage.getItem(DENSITY_KEY);
  else raw = await SecureStore.getItemAsync(DENSITY_KEY);
  if (raw === 'compact' || raw === 'cozy' || raw === 'comfortable') return raw;
  return 'cozy';
}

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [simplifiedMode, setSimplifiedModeState] = useState(false);
  const [density, setDensityState] = useState<UIDensity>('cozy');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await loadSimplified();
      const d = await loadDensity();
      if (!cancelled) {
        setSimplifiedModeState(v);
        setDensityState(d);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setSimplifiedMode = (v: boolean) => {
    setSimplifiedModeState(v);
    saveSimplified(v).catch(() => {});
  };
  const setDensity = (d: UIDensity) => {
    setDensityState(d);
    saveDensity(d).catch(() => {});
  };

  const value = useMemo(() => ({ simplifiedMode, setSimplifiedMode, density, setDensity }), [simplifiedMode, density]);
  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings() {
  const ctx = useContext(UISettingsContext);
  if (!ctx) throw new Error('useUISettings must be used within UISettingsProvider');
  return ctx;
}
