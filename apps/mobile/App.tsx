// apps/mobile/App.tsx
import React, { useEffect } from 'react';
import { Slot } from 'expo-router';
import { Text, TextInput } from 'react-native';
import { Buffer } from 'buffer';
import { UISettingsProvider, useUISettings } from './src/lib/uiSettings';

// Polyfills for production iOS builds (TestFlight) where some globals are missing.
// If Buffer is missing, code that writes binary files as base64 will explode.
// Keep this in App.tsx so it's guaranteed to run before any screen logic.
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
}

function GlobalTypographyController() {
  const { fontScale } = useUISettings();

  useEffect(() => {
    // Apply global defaults for ALL Text/TextInput (keeps allowFontScaling on,
    // and bumps the max multiplier to honor larger accessibility sizes).
    Text.defaultProps = {
      ...(Text.defaultProps || {}),
      allowFontScaling: true,
      maxFontSizeMultiplier: Math.max(1.2, Math.min(2.0, fontScale * 1.2)),
    };
    TextInput.defaultProps = {
      ...(TextInput.defaultProps || {}),
      allowFontScaling: true,
      maxFontSizeMultiplier: Math.max(1.2, Math.min(2.0, fontScale * 1.2)),
    };
  }, [fontScale]);

  return null;
}

export default function App() {
  return (
    <UISettingsProvider>
      <GlobalTypographyController />
      <Slot />
    </UISettingsProvider>
  );
}
