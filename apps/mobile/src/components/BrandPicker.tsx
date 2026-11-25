import { Pressable, StyleSheet, Text, View } from 'react-native';

export const FALLBACK_REPORT_BRANDS = [
  'Richlands',
  'Billy Pie',
  'Ninja Kombucha',
] as const;

type Props = {
  options: string[];
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

export default function BrandPicker({ options, value, error, onChange }: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>BRAND *</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  label: { fontWeight: '700', marginBottom: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  optionSelected: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  optionText: { color: '#111827', fontWeight: '700' },
  optionTextSelected: { color: '#ffffff' },
  error: { color: '#dc2626', marginTop: 6 },
});
