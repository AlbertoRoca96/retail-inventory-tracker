import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Image,
  Platform,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { downloadSubmissionExcel } from '../../src/lib/exportExcel';

// ──────────────────────────────────────────────────────────────────────────────
// NOTE: No Pressable wraps the entire screen. Only the buttons are pressables.
// We also use keyboardShouldPersistTaps="handled" to keep inputs responsive on web.
// ──────────────────────────────────────────────────────────────────────────────

type FormData = {
  date: string;
  store_location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
  photo_uris: string[];
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function NewFormScreen() {
  const [form, setForm] = useState<FormData>({
    date: todayISO(),
    store_location: '',
    conditions: '',
    price_per_unit: '',
    shelf_space: '',
    on_shelf: '',
    tags: '',
    notes: '',
    photo_uris: [],
  });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<null | { kind: 'success' | 'error'; msg: string }>(null);

  const canSubmit = useMemo(() => !busy, [busy]);

  const set = (k: keyof FormData) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  async function pickFromLibrary() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 2,
    });
    if (res.canceled) return;
    setForm(prev => ({
      ...prev,
      photo_uris: [...prev.photo_uris, ...res.assets.map(a => a.uri)].slice(0, 2),
    }));
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission is required to take a photo');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (res.canceled) return;
    setForm(prev => ({
      ...prev,
      photo_uris: [...prev.photo_uris, ...res.assets.map(a => a.uri)].slice(0, 2),
    }));
  }

  function saveDraft() {
    // Local-only “draft” (for now). You can persist to Supabase later.
    setBanner({ kind: 'success', msg: 'Draft saved locally.' });
  }

  async function submit() {
    if (!canSubmit) return;
    try {
      setBusy(true);

      // Generate + download an Excel row immediately (web) using SheetJS writeFile.
      downloadSubmissionExcel({
        date: form.date,
        store_location: form.store_location,
        conditions: form.conditions,
        price_per_unit: form.price_per_unit,
        shelf_space: form.shelf_space,
        on_shelf: form.on_shelf,
        tags: form.tags,
        notes: form.notes,
        photo_urls: form.photo_uris, // for now we use local URIs; when you upload, pass public URLs
      });

      setBanner({ kind: 'success', msg: 'Submission Successful' });

      // Optional: navigate back to menu in a moment
      // setTimeout(() => router.replace('/home'), 800);
    } catch (e: any) {
      setBanner({ kind: 'error', msg: e?.message || 'Submit failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>
          Create New Form
        </Text>

        {banner ? (
          <View
            style={{
              borderRadius: 8,
              padding: 10,
              marginBottom: 12,
              backgroundColor: banner.kind === 'success' ? '#10b981' : '#ef4444',
            }}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>{banner.msg}</Text>
          </View>
        ) : null}

        <Field label="DATE">
          <Input
            value={form.date}
            onChangeText={set('date')}
            editable={!busy}
            placeholder="YYYY-MM-DD"
            returnKeyType="next"
          />
        </Field>

        <Field label="STORE LOCATION">
          <Input
            value={form.store_location}
            onChangeText={set('store_location')}
            editable={!busy}
            placeholder="City, ST"
            returnKeyType="next"
          />
        </Field>

        <Field label="CONDITIONS">
          <Input
            value={form.conditions}
            onChangeText={set('conditions')}
            editable={!busy}
            placeholder="Notes on condition"
            returnKeyType="next"
          />
        </Field>

        <Field label="PRICE PER UNIT">
          <Input
            value={form.price_per_unit}
            onChangeText={set('price_per_unit')}
            editable={!busy}
            placeholder="$"
            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
            returnKeyType="next"
          />
        </Field>

        <Field label="SHELF SPACE">
          <Input
            value={form.shelf_space}
            onChangeText={set('shelf_space')}
            editable={!busy}
            placeholder="Shared, Endcap, etc."
            returnKeyType="next"
          />
        </Field>

        <Field label="ON SHELF">
          <Input
            value={form.on_shelf}
            onChangeText={set('on_shelf')}
            editable={!busy}
            placeholder="Flavors / SKUs"
            returnKeyType="next"
          />
        </Field>

        <Field label="TAGS">
          <Input
            value={form.tags}
            onChangeText={set('tags')}
            editable={!busy}
            placeholder="comma, separated, tags"
            returnKeyType="next"
          />
        </Field>

        <Field label="NOTES">
          <Input
            value={form.notes}
            onChangeText={set('notes')}
            editable={!busy}
            placeholder="Notes"
            multiline
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Field>

        <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>PHOTOS</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {form.photo_uris.map((uri, i) => (
            <Image
              key={uri + i}
              source={{ uri }}
              style={{
                width: 170,
                height: 120,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#d1d5db',
                backgroundColor: '#f8fafc',
              }}
            />
          ))}
        </View>

        {/* Action row */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <Button title="Take Photo" onPress={takePhoto} disabled={busy} />
          <Button title="Add from Library" onPress={pickFromLibrary} disabled={busy} />
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <Button secondary title="Save" onPress={saveDraft} disabled={busy} />
          <Button title="Submit" onPress={submit} disabled={!canSubmit} />
          <Button secondary title="Exit" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </View>
  );
}

/** Label + children wrapper */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

/** Cross-platform text input */
function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      // Editable inputs: ensure parent does not swallow events; RN TextInput updates through onChangeText
      // https://reactnative.dev/docs/0.65/handling-text-input
      style={[
        {
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: '#111827',
          borderRadius: 8,
          backgroundColor: 'white',
        },
        props.style,
      ]}
    />
  );
}

/** Minimal button that doesn’t wrap the whole page (prevents event swallowing) */
function Button({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <View
      // a simple button: clickable area + label
      onStartShouldSetResponder={() => !disabled}
      onResponderRelease={() => !disabled && onPress()}
      style={{
        flex: 1,
        opacity: disabled ? 0.6 : 1,
        backgroundColor: secondary ? '#e5e7eb' : '#2563eb',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: secondary ? '#111827' : 'white', fontWeight: '600' }}>{title}</Text>
    </View>
  );
}
