// apps/mobile/app/form/new.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { uploadPhotosAndGetUrls } from '../../src/lib/supabaseHelpers';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { downloadSubmissionExcel } from '../../src/lib/exportExcel';

type Banner =
  | { kind: 'info'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | null;

type Photo = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
};

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';
const DRAFT_KEY = 'rit:new-form-draft:v3';
const todayISO = () => new Date().toISOString().slice(0, 10);

// -------- localStorage helpers (no React setState here) --------
function saveDraftLocal(draft: unknown) {
  try {
    if (isWeb && hasWindow) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}
function loadDraftLocal<T>(): T | null {
  try {
    if (isWeb && hasWindow) {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    }
  } catch {}
  return null;
}
function clearDraftLocal() {
  try {
    if (isWeb && hasWindow) window.localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export default function NewFormScreen() {
  const { session } = useAuth();
  const uid = useMemo(() => session?.user?.id || 'dev-user', [session?.user?.id]);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);

  // All field values live in refs; inputs are UNCONTROLLED (defaultValue only)
  const refs = useRef({
    date: todayISO(),
    storeLocation: '',
    conditions: '',
    pricePerUnit: '',
    shelfSpace: '',
    onShelf: '',
    tags: '',
    notes: '',
  });

  // When we load a draft, we need inputs to re‑mount to apply new defaultValue.
  const [inputVersion, setInputVersion] = useState(0);

  // Load draft ONCE, then force a tiny remount of inputs to apply defaultValue
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;

    const draft = loadDraftLocal<typeof refs.current & { photos?: Photo[] }>();
    if (draft) {
      refs.current = {
        date: draft.date || todayISO(),
        storeLocation: draft.storeLocation || '',
        conditions: draft.conditions || '',
        pricePerUnit: draft.pricePerUnit || '',
        shelfSpace: draft.shelfSpace || '',
        onShelf: draft.onShelf || '',
        tags: draft.tags || '',
        notes: draft.notes || '',
      };
      setPhotos(draft.photos || []);
      setInputVersion((v) => v + 1); // re-mount inputs with new defaultValue
      setBanner({ kind: 'success', text: 'Draft loaded.' });
      setDirty(false);
    }
  }, []);

  // Debounced autosave reads ONLY from refs + photos (never writes to inputs)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraftLocal({ ...refs.current, photos });
    }, 400);
  };

  const markDirty = () => {
    if (!dirty) setDirty(true);
    scheduleAutosave();
  };

  // Photo pickers
  const addFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height }]);
      markDirty();
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setBanner({ kind: 'error', text: 'Camera permission denied' });
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height }]);
      markDirty();
    }
  };

  // Manual save just writes refs to local storage
  const onSave = () => {
    saveDraftLocal({ ...refs.current, photos });
    setDirty(false);
    setBanner({ kind: 'success', text: 'Draft saved locally.' });
  };

  // Submit: upload photos -> insert row -> optional Excel -> clear draft
  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);
      setBanner({ kind: 'info', text: 'Submitting…' });

      const { date, storeLocation, conditions, pricePerUnit, shelfSpace, onShelf, tags, notes } = refs.current;
      const photoUrls = await uploadPhotosAndGetUrls(uid, photos);

      const { error } = await supabase.from('submissions').insert({
        user_id: uid,
        status: 'submitted',
        date: date || null,
        store_location: storeLocation || null,
        conditions: conditions || null,
        price_per_unit: pricePerUnit ? Number(pricePerUnit) : null,
        shelf_space: shelfSpace || null,
        on_shelf: onShelf || null,
        tags: tags || null,
        notes: notes || null,
        photo1_url: photoUrls[0] ?? null,
        photo2_url: photoUrls[1] ?? null,
      });
      if (error) throw error;

      // Optional Excel export
      try {
        await downloadSubmissionExcel({
          date: date || '',
          store_location: storeLocation || '',
          conditions: conditions || '',
          price_per_unit: pricePerUnit || '',
          shelf_space: shelfSpace || '',
          on_shelf: onShelf || '',
          tags: tags || '',
          notes: notes || '',
          photo_urls: photoUrls.filter(Boolean),
        });
      } catch {}

      clearDraftLocal();
      setDirty(false);
      setBanner({ kind: 'success', text: 'Submission Successful' });
    } catch (e: any) {
      console.error(e);
      setBanner({ kind: 'error', text: e?.message ?? 'Upload failed' });
    } finally {
      setBusy(false);
    }
  };

  // Uncontrolled field (defaultValue, no value prop). We keep the latest text in refs.
  function Field(props: {
    name:
      | 'date'
      | 'storeLocation'
      | 'conditions'
      | 'pricePerUnit'
      | 'shelfSpace'
      | 'onShelf'
      | 'tags'
      | 'notes';
    label: string;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
  }) {
    const { name, label, placeholder, multiline, keyboardType } = props;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
        <TextInput
          // IMPORTANT: uncontrolled input
          key={`${name}-${inputVersion}`}
          defaultValue={(refs.current as any)[name] ?? ''}
          onChangeText={(s) => {
            (refs.current as any)[name] = s ?? '';
            markDirty();
          }}
          placeholder={placeholder}
          multiline={!!multiline}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType={keyboardType}
          inputMode={keyboardType === 'numeric' ? 'decimal' : undefined}
          style={{
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: '#111',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: multiline ? 10 : 8,
            minHeight: multiline ? 80 : 40,
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>Create New Form</Text>

      {banner ? (
        <View
          style={{
            backgroundColor:
              banner.kind === 'success' ? '#16a34a' : banner.kind === 'error' ? '#ef4444' : '#0ea5e9',
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>{banner.text}</Text>
        </View>
      ) : null}

      <Field name="date" label="DATE" placeholder="YYYY-MM-DD" />
      <Field name="storeLocation" label="STORE LOCATION" />
      <Field name="conditions" label="CONDITIONS" />
      <Field name="pricePerUnit" label="PRICE PER UNIT" placeholder="$" keyboardType="numeric" />
      <Field name="shelfSpace" label="SHELF SPACE" />
      <Field name="onShelf" label="ON SHELF" />
      <Field name="tags" label="TAGS" />
      <Field name="notes" label="NOTES" multiline />

      <Text style={{ fontWeight: '700', marginBottom: 8 }}>PHOTOS</Text>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {photos.map((p, i) => (
          <Image
            key={`${p.uri}-${i}`}
            source={{ uri: p.uri }}
            style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: '#111' }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <Pressable
          onPress={takePhoto}
          style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Take Photo</Text>
        </Pressable>
        <Pressable
          onPress={addFromLibrary}
          style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Add from Library</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onSave}
          style={{ flex: 1, backgroundColor: '#e5e7eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '700' }}>Save</Text>
        </Pressable>

        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={{
            flex: 1,
            backgroundColor: busy ? '#94a3b8' : '#2563eb',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>{busy ? 'Submitting…' : 'Submit'}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{ flex: 1, backgroundColor: '#e5e7eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '700' }}>Exit</Text>
        </Pressable>
      </View>

      <Text style={{ marginTop: 10, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
        {dirty ? 'Unsaved changes' : 'All changes saved'}
      </Text>
    </ScrollView>
  );
}
