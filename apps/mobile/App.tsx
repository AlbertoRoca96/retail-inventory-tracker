// apps/mobile/App.tsx
import React, { useEffect } from 'react';
import { Slot } from 'expo-router';
import { Text, TextInput, Platform } from 'react-native';
import { UISettingsProvider, useUISettings } from './src/lib/uiSettings';

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
