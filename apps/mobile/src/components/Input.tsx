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
  const { simplifiedMode } = useUISettings();
  const labelSize = simplifiedMode ? 16 : 15;
  const inputPadV = simplifiedMode ? theme.spacing(1.75) : theme.spacing(1.5);
  const inputPadH = simplifiedMode ? theme.spacing(2) : theme.spacing(2);
  const minHeight = multiline ? 80 : 56;

  return (
    <View style={styles.wrap}>
      <Text
        {...textA11yProps}
        style={[styles.label, { fontSize: labelSize }]}
      >
        {label}
      </Text>
      <TextInput
        {...textA11yProps}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
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
            minHeight,
            textAlignVertical: multiline ? 'top' : 'center',
            fontSize: typography.body.fontSize,
            lineHeight: typography.body.lineHeight,
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
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.xl,
  },
});
