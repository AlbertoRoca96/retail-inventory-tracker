// apps/mobile/src/components/Button.tsx
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { useUISettings } from '../lib/uiSettings';

export default function Button({
  title,
  onPress,
  variant = 'primary'
}: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'success' }) {
  const styleMap = {
    primary: styles.primary,
    secondary: styles.secondary,
    success: styles.success,
  } as const;
  const { simplifiedMode } = useUISettings();
  const basePad = simplifiedMode ? theme.spacing(3) : theme.spacing(2);
  const textSize = simplifiedMode ? 18 : 16;

  return (
    <Pressable
      style={({ hovered }) => [
        styles.base,
        { padding: basePad },
        styleMap[variant],
        hovered ? styles.hovered : null,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.text, { fontSize: textSize }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    marginVertical: theme.spacing(1)
  },
  hovered: { opacity: 0.9 },
  primary: { backgroundColor: theme.colors.blue },
  secondary: { backgroundColor: theme.colors.black },
  success: { backgroundColor: theme.colors.green },
  text: { color: '#fff', fontWeight: '600' }
});
