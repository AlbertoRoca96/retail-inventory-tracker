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
const DRAFT_KEY = 'rit:new-form-draft:v4';
const todayISO = () => new Date().toISOString().slice(0, 10);

// localStorage helpers (no setState in here)
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

  const [hydrated, setHydrated] = useState(!isWeb); // avoid SSR/hydration mismatches
  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // controlled fields (stable, no remount)
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

  // Debounced autosave: runs AFTER state changes; won’t remount inputs
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraftLocal({ date, storeLocation, conditions, pricePerUnit, shelfSpace, onShelf, tags, notes, photos });
    }, 400);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [date, storeLocation, conditions, pricePerUnit, shelfSpace, onShelf, tags, notes, photos]);

  const markDirty = () => setDirty(true);

  const addFromLibrary = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
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

  const onSave = () => {
    saveDraftLocal({ date, storeLocation, conditions, pricePerUnit, shelfSpace, onShelf, tags, notes, photos });
    setDirty(false);
    setBanner({ kind: 'success', text: 'Draft saved locally.' });
  };

  // Submit: upload → try DB insert → ALWAYS export → clear draft on success
  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);
      setBanner({ kind: 'info', text: 'Submitting…' });

      const userId = uid; // with anonymous sign-in this is a real uuid
      const photoUrls = await uploadPhotosAndGetUrls(userId, photos);

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
        // No session yet (very edge-case) – skip DB but still export
        insertError = { message: 'Not authenticated – saved to Excel only.' };
      }

      // ALWAYS give the spreadsheet so field teams don’t lose work
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
      setDirty(false);
      setBanner({ kind: 'success', text: 'Submission Successful' });
    } catch (e: any) {
      // even here, try to give feedback
      setBanner({ kind: 'error', text: e?.message ?? 'Submit failed' });
    } finally {
      setBusy(false);
    }
  };

  function Field(props: {
    label: string;
    value: string;
    onChangeText: (s: string) => void;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
  }) {
    const { label, value, onChangeText, placeholder, multiline, keyboardType } = props;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={(s) => {
            onChangeText(s);
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

  if (!hydrated) {
    // avoid SSR hydration quirks on web
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></View>;
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

      <Field label="DATE" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Field label="STORE LOCATION" value={storeLocation} onChangeText={setStoreLocation} />
      <Field label="CONDITIONS" value={conditions} onChangeText={setConditions} />
      <Field label="PRICE PER UNIT" value={pricePerUnit} onChangeText={setPricePerUnit} placeholder="$" keyboardType="numeric" />
      <Field label="SHELF SPACE" value={shelfSpace} onChangeText={setShelfSpace} />
      <Field label="ON SHELF" value={onShelf} onChangeText={setOnShelf} />
      <Field label="TAGS" value={tags} onChangeText={setTags} />
      <Field label="NOTES" value={notes} onChangeText={setNotes} multiline />

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

      <Text style={{ marginTop: 10, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
        {dirty ? 'Unsaved changes' : 'All changes saved'}
      </Text>
    </ScrollView>
  );
}
