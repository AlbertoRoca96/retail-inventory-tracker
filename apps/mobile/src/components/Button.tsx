// apps/mobile/src/components/Button.tsx
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

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
  return (
    <TouchableOpacity style={[styles.base, styleMap[variant]]} onPress={onPress}>
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: theme.spacing(2),
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    marginVertical: theme.spacing(1)
  },
  primary: { backgroundColor: theme.colors.blue },
  secondary: { backgroundColor: theme.colors.black },
  success: { backgroundColor: theme.colors.green },
  text: { color: '#fff', fontWeight: '600' }
});
