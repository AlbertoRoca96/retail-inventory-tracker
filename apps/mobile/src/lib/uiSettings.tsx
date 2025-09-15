// apps/mobile/src/lib/uiSettings.ts
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type UISettings = {
  simplifiedMode: boolean;
  setSimplifiedMode: (v: boolean | ((x: boolean) => boolean)) => void;
  largeText: boolean;
  setLargeText: (v: boolean | ((x: boolean) => boolean)) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean | ((x: boolean) => boolean)) => void;

  // Derived helpers
  fontScale: number;         // how much to scale base font sizes
  targetMinHeight: number;   // recommended min tap target height
};

const DEFAULTS: UISettings = {
  simplifiedMode: false,
  setSimplifiedMode: () => {},
  largeText: false,
  setLargeText: () => {},
  highContrast: false,
  setHighContrast: () => {},
  fontScale: 1,
  targetMinHeight: 48,
};

const CTX = createContext<UISettings>(DEFAULTS);
const STORAGE_KEY = 'display_prefs/v1';

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load once
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const j = JSON.parse(raw);
          if (typeof j.simplifiedMode === 'boolean') setSimplifiedMode(j.simplifiedMode);
          if (typeof j.largeText === 'boolean') setLargeText(j.largeText);
          if (typeof j.highContrast === 'boolean') setHighContrast(j.highContrast);
        }
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ simplifiedMode, largeText, highContrast })
    ).catch(() => {});
  }, [simplifiedMode, largeText, highContrast, hydrated]);

  // Derive simple global multipliers
  const fontScale = 1 * (simplifiedMode ? 1.10 : 1) * (largeText ? 1.18 : 1);
  const targetMinHeight = Math.round((48) * (simplifiedMode ? 1.15 : 1)); // ≈56 when simplified

  const value = useMemo<UISettings>(
    () => ({
      simplifiedMode,
      setSimplifiedMode,
      largeText,
      setLargeText,
      highContrast,
      setHighContrast,
      fontScale,
      targetMinHeight,
    }),
    [simplifiedMode, largeText, highContrast, fontScale, targetMinHeight]
  );

  return <CTX.Provider value={value}>{children}</CTX.Provider>;
}

export function useUISettings() {
  return useContext(CTX);
}
