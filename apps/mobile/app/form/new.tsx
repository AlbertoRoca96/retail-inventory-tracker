import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Platform, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import * as XLSX from 'xlsx';

type FormValues = {
  date: string;
  store_location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
};

const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

export default function NewFormScreen() {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      date: todayISO,
      store_location: '',
      conditions: '',
      price_per_unit: '',
      shelf_space: '',
      on_shelf: '',
      tags: '',
      notes: '',
    },
  });

  const exportXLSX = (data: FormValues) => {
    // Create a single-row sheet from the form
    const rows = [{ ...data, created_at: new Date().toISOString() }];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Submissions');

    const wbout =
      XLSX.write(wb, { type: Platform.OS === 'web' ? 'array' : 'base64', bookType: 'xlsx' });

    if (Platform.OS === 'web') {
      const blob = new Blob([wbout as ArrayBuffer], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `submission-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('Export created', 'Implement native file save/share here.');
    }
  };

  const onSave = (values: FormValues) => {
    exportXLSX({ ...values, }); // same as submit for now
  };

  const onSubmit = (values: FormValues) => {
    exportXLSX(values);
    reset({ ...values, notes: '' }); // example reset behavior
  };

  const Field = ({
    label,
    name,
    placeholder,
    keyboardType,
    multiline = false,
  }: {
    label: string;
    name: keyof FormValues;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric' | 'email-address';
    multiline?: boolean;
  }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { value, onChange, onBlur } }) => (
          <TextInput
            value={value ?? ''}                 // always a string
            onChangeText={onChange}             // <-- critical for RN
            onBlur={onBlur}
            placeholder={placeholder}
            keyboardType={keyboardType ?? 'default'}
            editable={!isSubmitting}
            multiline={multiline}
            style={{
              backgroundColor: 'white',
              paddingHorizontal: 12,
              paddingVertical: multiline ? 12 : 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#d1d5db',
              minHeight: multiline ? 96 : undefined,
            }}
          />
        )}
      />
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"  // don't steal focus
    >
      <Text style={{ fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>
        Create New Form
      </Text>

      <Field label="DATE" name="date" placeholder="YYYY-MM-DD" keyboardType="default" />
      <Field label="STORE LOCATION" name="store_location" placeholder="City, ST" />
      <Field label="CONDITIONS" name="conditions" placeholder="Notes on condition" />
      <Field label="PRICE PER UNIT" name="price_per_unit" placeholder="$" keyboardType="numeric" />
      <Field label="SHELF SPACE" name="shelf_space" placeholder="Shared, Endcap, etc." />
      <Field label="ON SHELF" name="on_shelf" placeholder="Flavors / SKUs" />
      <Field label="TAGS" name="tags" placeholder="comma, separated, tags" />
      <Field label="NOTES" name="notes" placeholder="Notes" multiline />

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
        <Pressable
          onPress={handleSubmit(onSave)}
          disabled={isSubmitting}
          style={{
            flex: 1,
            backgroundColor: '#e5e7eb',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontWeight: '600' }}>Save</Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          style={{
            flex: 1,
            backgroundColor: '#2563eb',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Submit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
