import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../theme';

export default function Input({
  label, value, onChangeText, keyboardType='default', placeholder
}: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: any; placeholder?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
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
    padding: theme.spacing(1),
    backgroundColor: theme.colors.white
  }
});
