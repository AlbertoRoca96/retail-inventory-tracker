// apps/mobile/src/components/Button.tsx
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { theme, textA11yProps } from '../theme';
import { useUISettings } from '../lib/uiSettings';

type Variant = 'primary' | 'secondary' | 'success';

export default function Button({
  title,
  onPress,
  variant = 'primary',
  accessibilityLabel,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const { simplifiedMode, largeText, highContrast, targetMinHeight, fontScale } = useUISettings();

  const padV = theme.spacing(simplifiedMode ? 2 : 1.5);
  const padH = theme.spacing(simplifiedMode ? 3 : 2.5);
  const textSize = Math.round(18 * fontScale);

  const styleMap = {
    primary: { backgroundColor: highContrast ? '#1743b3' : theme.colors.blue },
    secondary: { backgroundColor: highContrast ? '#111111' : theme.colors.black },
    success: { backgroundColor: highContrast ? '#0f7a35' : theme.colors.green },
  } as const;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      hitSlop={10}
      android_ripple={{ borderless: false }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { paddingVertical: padV, paddingHorizontal: padH, minHeight: targetMinHeight, opacity: disabled ? 0.5 : 1 },
        styleMap[variant],
        pressed && styles.pressed,
      ]}
    >
      <Text {...textA11yProps} style={[styles.text, { fontSize: textSize }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing(1),
  },
  pressed: { opacity: 0.9 },
  text: { color: '#fff', fontWeight: '600', lineHeight: 24 },
});
