import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { type ProductDraft } from '../lib/reportProducts';
export type { ProductDraft } from '../lib/reportProducts';

type Props = {
  rows: ProductDraft[];
  onChange: (rows: ProductDraft[]) => void;
  errors?: Record<string, string>;
};

function newRow(): ProductDraft {
  return {
    id: `product-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    product: '',
    quantity: '',
    expiryDate: '',
  };
}

export default function ProductRowsEditor({ rows, onChange, errors = {} }: Props) {
  const update = (id: string, patch: Partial<ProductDraft>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>PRODUCT COUNTS & EXPIRY DATES</Text>
      <Text style={styles.help}>
        Add a line for each product so quantities and dates do not get buried in notes.
      </Text>

      {rows.map((row, index) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle}>Product {index + 1}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}
              style={styles.remove}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
          <TextInput
            value={row.product}
            onChangeText={(product) => update(row.id, { product })}
            accessibilityLabel={`Product ${index + 1} name`}
            placeholder="Product"
            style={styles.input}
          />
          <View style={styles.inline}>
            <TextInput
              value={row.quantity}
              onChangeText={(quantity) => update(row.id, { quantity })}
              accessibilityLabel={`Product ${index + 1} quantity`}
              placeholder="Quantity (optional)"
              keyboardType="decimal-pad"
              inputMode="decimal"
              style={[styles.input, styles.flex]}
            />
            <TextInput
              value={row.expiryDate}
              onChangeText={(expiryDate) => update(row.id, { expiryDate })}
              accessibilityLabel={`Product ${index + 1} expiry date`}
              placeholder="Expiry YYYY-MM-DD"
              autoCapitalize="none"
              style={[styles.input, styles.flex]}
            />
          </View>
          {errors[row.id] ? <Text accessibilityRole="alert" style={styles.removeText}>{errors[row.id]}</Text> : null}
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => onChange([...rows, newRow()])}
        style={styles.add}
      >
        <Text style={styles.addText}>+ Add Product</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  heading: { fontWeight: '800', marginBottom: 4 },
  help: { color: '#4b5563', marginBottom: 10, lineHeight: 20 },
  card: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
    padding: 12,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontWeight: '700' },
  remove: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  removeText: { color: '#b91c1c', fontWeight: '700' },
  inline: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  input: {
    minHeight: 46,
    backgroundColor: '#ffffff',
    borderColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  add: {
    alignItems: 'center',
    backgroundColor: '#e0e7ff',
    borderColor: '#1d4ed8',
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: 'center',
  },
  addText: { color: '#1d4ed8', fontWeight: '800' },
});
