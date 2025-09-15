// apps/mobile/src/components/Input.tsx
import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme, typography, textA11yProps } from '../theme';
import { useUISettings } from '../lib/uiSettings';

export default function Input({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  placeholder,
  secureTextEntry,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: any;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  const { simplifiedMode, highContrast, fontScale, targetMinHeight } = useUISettings();
  const labelSize = Math.round(15 * (simplifiedMode ? 1.05 : 1) * fontScale);
  const inputPadV = theme.spacing(simplifiedMode ? 1.75 : 1.5);
  const inputPadH = theme.spacing(2);

  return (
    <View style={styles.wrap}>
      <Text {...textA11yProps} style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
      <TextInput
        {...textA11yProps}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={highContrast ? '#4b5563' : '#6b7280'}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          {
            paddingVertical: inputPadV,
            paddingHorizontal: inputPadH,
            minHeight: multiline ? Math.max(80, targetMinHeight) : targetMinHeight,
            textAlignVertical: multiline ? 'top' : 'center',
            fontSize: Math.round(typography.body.fontSize * fontScale),
            lineHeight: Math.round(typography.body.lineHeight * fontScale),
            borderColor: highContrast ? '#111111' : theme.colors.black,
            backgroundColor: theme.colors.white,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: theme.spacing(1) },
  label: { marginBottom: 6, color: theme.colors.black, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.xl,
  },
});
