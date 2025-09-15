import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { useUISettings } from '../lib/uiSettings';

export default function Input({
  label, value, onChangeText, keyboardType='default', placeholder
}: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: any; placeholder?: string }) {
  const { simplifiedMode } = useUISettings();
  const labelSize = simplifiedMode ? 16 : 14;
  const inputPad = simplifiedMode ? theme.spacing(2) : theme.spacing(1);
  const inputHeight = simplifiedMode ? 52 : 44;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { fontSize: labelSize }]}>{label}</Text>
      <TextInput
        style={[styles.input, { padding: inputPad, height: inputHeight }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#999"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: theme.spacing(1) },
  label: { marginBottom: 4, color: theme.colors.black },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.black,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.white
  }
});
