// apps/mobile/app/form/new.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { uploadPhotosAndGetUrls } from '../../src/lib/supabaseHelpers';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { downloadSubmissionExcel } from '../../src/lib/exportExcel'; // now uses ExcelJS with images

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
const DRAFT_KEY = 'rit:new-form-draft:v5';
const todayISO = () => new Date().toISOString().slice(0, 10);

// ---- localStorage helpers (NO setState here) ----
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
  const uid = useMemo(() => session?.user?.id ?? '', [session?.user?.id]);

  // Avoid any SSR/hydration oddities
  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  // Controlled field state
  const [date, setDate] = useState<string>(todayISO());
  const [storeLocation, setStoreLocation] = useState<string>('');
  const [conditions, setConditions] = useState<string>('');
  const [pricePerUnit, setPricePerUnit] = useState<string>('');
  const [shelfSpace, setShelfSpace] = useState<string>('');
  const [onShelf, setOnShelf] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [photos, setPhotos] = useState<Photo[]>([]);

  // Load draft ONCE after hydration
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!hydrated || loadedOnce.current) return;
    loadedOnce.current = true;
    const draft = loadDraftLocal<{
      date?: string;
      storeLocation?: string;
      conditions?: string;
      pricePerUnit?: string;
      shelfSpace?: string;
      onShelf?: string;
      tags?: string;
      notes?: string;
      photos?: Photo[];
    }>();
    if (draft) {
      setDate(draft.date ?? todayISO());
      setStoreLocation(draft.storeLocation ?? '');
      setConditions(draft.conditions ?? '');
      setPricePerUnit(draft.pricePerUnit ?? '');
      setShelfSpace(draft.shelfSpace ?? '');
      setOnShelf(draft.onShelf ?? '');
      setTags(draft.tags ?? '');
      setNotes(draft.notes ?? '');
      setPhotos(draft.photos ?? []);
      setBanner({ kind: 'success', text: 'Draft loaded.' });
    }
  }, [hydrated]);

  // Debounced autosave (does not change any React state)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraftLocal({
        date,
        storeLocation,
        conditions,
        pricePerUnit,
        shelfSpace,
        onShelf,
        tags,
        notes,
        photos,
      });
    }, 400);
  }, [date, storeLocation, conditions, pricePerUnit, shelfSpace, onShelf, tags, notes, photos]);

  // Photo pickers
  const addFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [
        ...p,
        { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height },
      ]);
      // autosave on photo changes
      setTimeout(autosave, 0);
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
      setPhotos((p) => [
        ...p,
        { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height },
      ]);
      setTimeout(autosave, 0);
    }
  };

  const onSave = () => {
    saveDraftLocal({ date, storeLocation, conditions, pricePerUnit, shelfSpace, onShelf, tags, notes, photos });
    setBanner({ kind: 'success', text: 'Draft saved locally.' });
  };

  // Submit: upload → try DB insert → ALWAYS export → clear draft on success
  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);
      setBanner({ kind: 'info', text: 'Submitting…' });

      const userId = uid; // anonymous sign‑in yields a UUID; if empty we still export
      const photoUrls = await uploadPhotosAndGetUrls(userId || 'anon', photos);

      let insertError: any = null;
      if (userId) {
        const { error } = await supabase.from('submissions').insert({
          user_id: userId,
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
        insertError = error ?? null;
      } else {
        insertError = { message: 'Not authenticated – saved to Excel only.' };
      }

      // Always export a spreadsheet (with embedded images)
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

  // WebField: native <input>/<textarea> to avoid RNW quirks
  const WebField = ({
    label,
    value,
    onChange,
    placeholder,
    multiline,
    inputMode,
  }: {
    label: string;
    value: string;
    onChange: (s: string) => void;
    placeholder?: string;
    multiline?: boolean;
    inputMode?: 'text' | 'decimal';
  }) => {
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
        {multiline ? (
          <textarea
            defaultValue={value}
            onChange={(e) => {
              onChange(e.currentTarget.value);
              autosave();
            }}
            placeholder={placeholder}
            autoCorrect="off"
            autoCapitalize="none"
            style={{
              width: '100%',
              backgroundColor: 'white',
              borderWidth: 1,
              borderColor: '#111',
              borderStyle: 'solid',
              borderRadius: 8,
              padding: 10,
              minHeight: 80,
            } as any}
          />
        ) : (
          <input
            defaultValue={value}
            onChange={(e) => {
              onChange(e.currentTarget.value);
              autosave();
            }}
            placeholder={placeholder}
            autoCorrect="off"
            autoCapitalize="none"
            inputMode={inputMode}
            style={{
              width: '100%',
              backgroundColor: 'white',
              borderWidth: 1,
              borderColor: '#111',
              borderStyle: 'solid',
              borderRadius: 8,
              padding: 8,
              height: 40,
            } as any}
          />
        )}
      </View>
    );
  };

  // NativeField: React Native TextInput for iOS/Android
  const NativeField = ({
    label,
    value,
    onChange,
    placeholder,
    multiline,
    keyboardType,
  }: {
    label: string;
    value: string;
    onChange: (s: string) => void;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
  }) => {
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={(s) => {
            onChange(s);
            autosave();
          }}
          placeholder={placeholder}
          multiline={!!multiline}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType={keyboardType}
          style={{
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: '#111',
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: multiline ? 10 : 8,
            minHeight: multiline ? 80 : 40,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </View>
    );
  };

  const Field = (p: {
    label: string;
    value: string;
    onChange: (s: string) => void;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
    inputMode?: 'text' | 'decimal';
  }) =>
    isWeb ? (
      <WebField
        label={p.label}
        value={p.value}
        onChange={p.onChange}
        placeholder={p.placeholder}
        multiline={p.multiline}
        inputMode={p.keyboardType === 'numeric' ? 'decimal' : 'text'}
      />
    ) : (
      <NativeField
        label={p.label}
        value={p.value}
        onChange={p.onChange}
        placeholder={p.placeholder}
        multiline={p.multiline}
        keyboardType={p.keyboardType}
      />
    );

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>Create New Form</Text>

      {banner ? (
        <View
          style={{
            backgroundColor: banner.kind === 'success' ? '#16a34a' : banner.kind === 'error' ? '#ef4444' : '#0ea5e9',
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>{banner.text}</Text>
        </View>
      ) : null}

      <Field label="DATE" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
      <Field label="STORE LOCATION" value={storeLocation} onChange={setStoreLocation} />
      <Field label="CONDITIONS" value={conditions} onChange={setConditions} />
      <Field
        label="PRICE PER UNIT"
        value={pricePerUnit}
        onChange={setPricePerUnit}
        placeholder="$"
        keyboardType="numeric"
      />
      <Field label="SHELF SPACE" value={shelfSpace} onChange={setShelfSpace} />
      <Field label="ON SHELF" value={onShelf} onChange={setOnShelf} />
      <Field label="TAGS" value={tags} onChange={setTags} />
      <Field label="NOTES" value={notes} onChange={setNotes} multiline />

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
    </ScrollView>
  );
}
