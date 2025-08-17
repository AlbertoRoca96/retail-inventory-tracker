// apps/mobile/app/form/new.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
const DRAFT_KEY = 'rit:new-form-draft:v6';
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- localStorage (no React setState here) ----------
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

type FormValues = {
  date: string;
  storeLocation: string;
  conditions: string;
  pricePerUnit: string;
  shelfSpace: string;
  onShelf: string;
  tags: string;
  notes: string;
};

export default function NewFormScreen() {
  const { session } = useAuth();
  const uid = useMemo(() => session?.user?.id ?? '', [session?.user?.id]);

  // Avoid hydration quirks on static web
  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => { if (isWeb) setHydrated(true); }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);

  // ----- Values: refs for WEB (no per-key stroke setState), state for NATIVE -----
  const formRef = useRef<FormValues>({
    date: todayISO(),
    storeLocation: '',
    conditions: '',
    pricePerUnit: '',
    shelfSpace: '',
    onShelf: '',
    tags: '',
    notes: '',
  });

  // Native (iOS/Android) controlled state
  const [nDate, setNDate] = useState<string>(todayISO());
  const [nStoreLocation, setNStoreLocation] = useState('');
  const [nConditions, setNConditions] = useState('');
  const [nPricePerUnit, setNPricePerUnit] = useState('');
  const [nShelfSpace, setNShelfSpace] = useState('');
  const [nOnShelf, setNOnShelf] = useState('');
  const [nTags, setNTags] = useState('');
  const [nNotes, setNNotes] = useState('');

  // Load draft ONCE after hydration
  const loaded = useRef(false);
  useEffect(() => {
    if (!hydrated || loaded.current) return;
    loaded.current = true;

    const draft = loadDraftLocal<Partial<FormValues> & { photos?: Photo[] }>();
    if (draft) {
      // put into ref (web)
      formRef.current = {
        date: draft.date ?? todayISO(),
        storeLocation: draft.storeLocation ?? '',
        conditions: draft.conditions ?? '',
        pricePerUnit: draft.pricePerUnit ?? '',
        shelfSpace: draft.shelfSpace ?? '',
        onShelf: draft.onShelf ?? '',
        tags: draft.tags ?? '',
        notes: draft.notes ?? '',
      };
      // also reflect in native state so mobile stays in sync
      setNDate(formRef.current.date);
      setNStoreLocation(formRef.current.storeLocation);
      setNConditions(formRef.current.conditions);
      setNPricePerUnit(formRef.current.pricePerUnit);
      setNShelfSpace(formRef.current.shelfSpace);
      setNOnShelf(formRef.current.onShelf);
      setNTags(formRef.current.tags);
      setNNotes(formRef.current.notes);

      setPhotos(draft.photos ?? []);
      setBanner({ kind: 'success', text: 'Draft loaded.' });
    }
  }, [hydrated]);

  // Unified getters (web reads from ref, native reads from state)
  const getValues = useCallback((): FormValues => {
    if (isWeb) return { ...formRef.current };
    return {
      date: nDate, storeLocation: nStoreLocation, conditions: nConditions, pricePerUnit: nPricePerUnit,
      shelfSpace: nShelfSpace, onShelf: nOnShelf, tags: nTags, notes: nNotes,
    };
  }, [nDate, nStoreLocation, nConditions, nPricePerUnit, nShelfSpace, nOnShelf, nTags, nNotes]);

  // Debounced autosave (reads through getValues → ref on web, state on native)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const v = getValues();
      saveDraftLocal({ ...v, photos });
    }, 400);
  }, [getValues, photos]);

  // Photos
  const addFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height }]);
      scheduleAutosave();
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
      scheduleAutosave();
    }
  };

  const onSave = () => {
    const v = getValues();
    saveDraftLocal({ ...v, photos });
    setBanner({ kind: 'success', text: 'Draft saved locally.' });
  };

  // Submit: upload → try DB insert → ALWAYS export → clear draft on success
  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);
      setBanner({ kind: 'info', text: 'Submitting…' });

      const v = getValues();
      const photoUrls = await uploadPhotosAndGetUrls(uid || 'anon', photos);

      let insertError: any = null;
      if (uid) {
        const { error } = await supabase.from('submissions').insert({
          user_id: uid,
          status: 'submitted',
          date: v.date || null,
          store_location: v.storeLocation || null,
          conditions: v.conditions || null,
          price_per_unit: v.pricePerUnit ? Number(v.pricePerUnit) : null,
          shelf_space: v.shelfSpace || null,
          on_shelf: v.onShelf || null,
          tags: v.tags || null,
          notes: v.notes || null,
          photo1_url: photoUrls[0] ?? null,
          photo2_url: photoUrls[1] ?? null,
        });
        insertError = error ?? null;
      } else {
        insertError = { message: 'Not authenticated – saved to Excel only.' };
      }

      // Always export an Excel with embedded photos (side-by-side)
      await downloadSubmissionExcel({
        date: v.date || '',
        store_location: v.storeLocation || '',
        conditions: v.conditions || '',
        price_per_unit: v.pricePerUnit || '',
        shelf_space: v.shelfSpace || '',
        on_shelf: v.onShelf || '',
        tags: v.tags || '',
        notes: v.notes || '',
        photo_urls: photoUrls.filter(Boolean),
      });

      if (insertError) {
        setBanner({ kind: 'error', text: insertError.message ?? 'Row not saved (RLS). Excel exported.' });
        return;
      }

      clearDraftLocal();
      setBanner({ kind: 'success', text: 'Submission Successful' });
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Submit failed' });
    } finally {
      setBusy(false);
    }
  };

  // ---------- Fields ----------
  // WebField: pure DOM, uncontrolled; writes to formRef; never calls setState per keypress
  const WebField = ({
    name, label, placeholder, multiline, inputMode,
  }: {
    name: keyof FormValues;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    inputMode?: 'text' | 'decimal';
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      {multiline ? (
        <textarea
          defaultValue={formRef.current[name] ?? ''}
          onInput={(e) => { formRef.current[name] = (e.currentTarget.value as any) ?? ''; }}
          onBlur={scheduleAutosave}
          placeholder={placeholder}
          style={{
            width: '100%', backgroundColor: 'white',
            borderWidth: 1, borderColor: '#111', borderStyle: 'solid',
            borderRadius: 8, padding: 10, minHeight: 80,
          } as any}
        />
      ) : (
        <input
          defaultValue={formRef.current[name] ?? ''}
          onInput={(e) => { formRef.current[name] = (e.currentTarget.value as any) ?? ''; }}
          onBlur={scheduleAutosave}
          placeholder={placeholder}
          inputMode={inputMode}
          style={{
            width: '100%', backgroundColor: 'white',
            borderWidth: 1, borderColor: '#111', borderStyle: 'solid',
            borderRadius: 8, padding: 8, height: 40,
          } as any}
        />
      )}
    </View>
  );

  // NativeField: controlled TextInput for phones
  const NativeField = ({
    label, value, onChange, placeholder, multiline, keyboardType,
  }: {
    label: string; value: string; onChange: (s: string) => void;
    placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'email-address';
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(s) => { onChange(s); scheduleAutosave(); }}
        placeholder={placeholder}
        multiline={!!multiline}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType={keyboardType}
        style={{
          backgroundColor: 'white', borderWidth: 1, borderColor: '#111',
          borderRadius: 8, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 8,
          minHeight: multiline ? 80 : 40, textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );

  const Field = (p: {
    name?: keyof FormValues; // for web
    label: string;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
  }) => {
    if (isWeb) {
      return (
        <WebField
          name={p.name!}
          label={p.label}
          placeholder={p.placeholder}
          multiline={p.multiline}
          inputMode={p.keyboardType === 'numeric' ? 'decimal' : 'text'}
        />
      );
    }
    // Native
    switch (p.name) {
      case 'date':          return <NativeField label={p.label} value={nDate} onChange={setNDate} placeholder={p.placeholder} />;
      case 'storeLocation': return <NativeField label={p.label} value={nStoreLocation} onChange={setNStoreLocation} placeholder={p.placeholder} />;
      case 'conditions':    return <NativeField label={p.label} value={nConditions} onChange={setNConditions} placeholder={p.placeholder} />;
      case 'pricePerUnit':  return <NativeField label={p.label} value={nPricePerUnit} onChange={setNPricePerUnit} placeholder={p.placeholder} keyboardType="numeric" />;
      case 'shelfSpace':    return <NativeField label={p.label} value={nShelfSpace} onChange={setNShelfSpace} placeholder={p.placeholder} />;
      case 'onShelf':       return <NativeField label={p.label} value={nOnShelf} onChange={setNOnShelf} placeholder={p.placeholder} />;
      case 'tags':          return <NativeField label={p.label} value={nTags} onChange={setNTags} placeholder={p.placeholder} />;
      case 'notes':         return <NativeField label={p.label} value={nNotes} onChange={setNNotes} placeholder={p.placeholder} multiline />;
      default:              return null;
    }
  };

  if (!hydrated) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>Create New Form</Text>

      {banner ? (
        <View style={{
          backgroundColor: banner.kind === 'success' ? '#16a34a' : banner.kind === 'error' ? '#ef4444' : '#0ea5e9',
          padding: 10, borderRadius: 8, marginBottom: 12,
        }}>
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
          <Image key={`${p.uri}-${i}`} source={{ uri: p.uri }} style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: '#111' }} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <Pressable onPress={takePhoto} style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>Take Photo</Text>
        </Pressable>
        <Pressable onPress={addFromLibrary} style={{ flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>Add from Library</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable onPress={onSave} style={{ flex: 1, backgroundColor: '#e5e7eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700' }}>Save</Text>
        </Pressable>

        <Pressable onPress={onSubmit} disabled={busy} style={{ flex: 1, backgroundColor: busy ? '#94a3b8' : '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: '700' }}>{busy ? 'Submitting…' : 'Submit'}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={{ flex: 1, backgroundColor: '#e5e7eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700' }}>Exit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
