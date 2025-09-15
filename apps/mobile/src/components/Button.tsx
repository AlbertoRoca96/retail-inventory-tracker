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
  const { simplifiedMode } = useUISettings();
  const padV = simplifiedMode ? theme.spacing(2) : theme.spacing(1.5);
  const padH = simplifiedMode ? theme.spacing(3) : theme.spacing(2.5);
  const textSize = simplifiedMode ? 18 : 17;

  const styleMap = {
    primary: styles.primary,
    secondary: styles.secondary,
    success: styles.success,
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
        { paddingVertical: padV, paddingHorizontal: padH, opacity: disabled ? 0.5 : 1 },
        styleMap[variant],
        pressed && styles.pressed,
      ]}
    >
      <Text
        {...textA11yProps}
        style={[styles.text, { fontSize: textSize }]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48, // >=44pt iOS / >=48dp Android
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: theme.spacing(1),
  },
  pressed: { opacity: 0.9 },
  primary: { backgroundColor: theme.colors.blue },
  secondary: { backgroundColor: theme.colors.black },
  success: { backgroundColor: theme.colors.green },
  text: {
    color: '#fff',
    fontWeight: '600',
    lineHeight: 24,
  },
});
