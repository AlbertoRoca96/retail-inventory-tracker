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

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';

/** Bump this key when the local-draft format changes to avoid loading stale drafts */
const DRAFT_KEY = 'rit:new-form-draft:v7';
const todayISO = () => new Date().toISOString().slice(0, 10);
const getDefaultValues = (): FormValues => ({
  date: todayISO(),
  storeLocation: '',
  conditions: '',
  pricePerUnit: '',
  shelfSpace: '',
  onShelf: '',
  tags: '',
  notes: '',
});

// ---------- localStorage helpers (no React setState inside) ----------
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

  // Avoid hydration quirks for static web
  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  // ---------------- Values store ----------------
  // Web: keep values in a ref (no per-keystroke React state) and render HTML inputs
  // Native: standard controlled TextInputs
  const formRef = useRef<FormValues>(getDefaultValues());
  const [photos, setPhotos] = useState<Photo[]>([]);

  // Native mirrored state (so phones behave naturally)
  const [nVals, setNVals] = useState<FormValues>(getDefaultValues());

  // When we need web inputs to re-mount with new defaultValue (after Clear/Load), bump this key.
  const [formKey, setFormKey] = useState(0);

  // ---- NEW (minimal): web camera/library fallbacks ----
  const camInputRef = useRef<HTMLInputElement | null>(null);
  const libInputRef = useRef<HTMLInputElement | null>(null);
  const handleWebFile = useCallback((file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos((p) => [
      ...p,
      {
        uri: url,
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        width: null,
        height: null,
      },
    ]);
    // persist to draft
    setTimeout(scheduleAutosave, 0);
  }, []); // scheduleAutosave is defined later; referenced lazily via setTimeout

  // Load draft once after hydration
  const loaded = useRef(false);
  useEffect(() => {
    if (!hydrated || loaded.current) return;
    loaded.current = true;
    const draft = loadDraftLocal<Partial<FormValues> & { photos?: Photo[] }>();
    if (draft) {
      const merged: FormValues = { ...getDefaultValues(), ...draft };
      formRef.current = merged;
      setNVals(merged); // keep native in sync
      setPhotos(draft.photos ?? []);
      // re-mount web inputs with loaded defaults
      setFormKey((k) => k + 1);
      setBanner({ kind: 'success', text: 'Draft loaded.' });
    }
  }, [hydrated]);

  // Unified getter (returns the latest values regardless of platform)
  const getValues = useCallback((): FormValues => {
    return isWeb ? { ...formRef.current } : { ...nVals };
  }, [nVals]);

  // Debounced autosave (reads latest state/refs and writes to localStorage only)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const v = getValues();
      saveDraftLocal({ ...v, photos });
    }, 350);
  }, [getValues, photos]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ---------------- Photos ----------------
  const removePhotoAt = (idx: number) => {
    setPhotos((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
    // persist removal
    setTimeout(scheduleAutosave, 0);
  };

  const addFromLibrary = async () => {
    if (isWeb) {
      libInputRef.current?.click();
      return;
    }
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
      setTimeout(scheduleAutosave, 0);
    }
  };

  const takePhoto = async () => {
    if (isWeb) {
      camInputRef.current?.click(); // HTML file input with capture attr
      return;
    }
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
      setTimeout(scheduleAutosave, 0);
    }
  };

  // ---------------- Actions ----------------
  const onSave = () => {
    const v = getValues();
    saveDraftLocal({ ...v, photos });
    setBanner({ kind: 'success', text: 'Draft saved locally.' });
  };

  /** Reset everything to a clean form (optionally clear local draft). */
  const resetForm = (clearDraft: boolean) => {
    const fresh = getDefaultValues();
    formRef.current = fresh;
    setNVals(fresh);
    setPhotos([]);
    // cause web inputs to re-mount with empty/default values
    setFormKey((k) => k + 1);
    if (clearDraft) clearDraftLocal();
  };

  const onClearAll = () => {
    resetForm(true);
    // persist that the draft is now empty (helps if the tab stays open)
    saveDraftLocal({ ...getDefaultValues(), photos: [] });
    setBanner({ kind: 'success', text: 'Cleared all saved fields & photos.' });
  };

  // Submit: upload → try DB insert → ALWAYS export → clear draft & reset on success
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

      // Always export a spreadsheet (side-by-side photos handled in exportExcel.ts)
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

      // New, clean form after successful submit
      resetForm(true); // clears local draft too
      setBanner({ kind: 'success', text: 'Submission Successful' });
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Submit failed' });
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Field components ----------------
  // WebField: pure DOM, uncontrolled; writes into formRef and debounced-saves
  const WebField = ({
    name,
    label,
    placeholder,
    multiline,
    inputMode,
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
          key={`${name}-${formKey}`}
          defaultValue={formRef.current[name] ?? ''}
          onInput={(e) => {
            formRef.current[name] = (e.currentTarget.value as any) ?? '';
            scheduleAutosave();
          }}
          onBlur={scheduleAutosave}
          placeholder={placeholder}
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
          key={`${name}-${formKey}`}
          defaultValue={formRef.current[name] ?? ''}
          onInput={(e) => {
            formRef.current[name] = (e.currentTarget.value as any) ?? '';
            scheduleAutosave();
          }}
          onBlur={scheduleAutosave}
          placeholder={placeholder}
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

  // NativeField: standard controlled TextInput for iOS/Android
  const NativeField = ({
    prop,
    label,
    placeholder,
    multiline,
    keyboardType,
  }: {
    prop: keyof FormValues;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
  }) => {
    const value = nVals[prop];
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={(s) => {
            setNVals((prev) => ({ ...prev, [prop]: s ?? '' }));
            scheduleAutosave();
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
    name: keyof FormValues;
    label: string;
    placeholder?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address';
  }) =>
    isWeb ? (
      <WebField
        name={p.name}
        label={p.label}
        placeholder={p.placeholder}
        multiline={p.multiline}
        inputMode={p.keyboardType === 'numeric' ? 'decimal' : 'text'}
      />
    ) : (
      <NativeField
        prop={p.name}
        label={p.label}
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
      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>
        Create New Form
      </Text>

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
          <View key={`${p.uri}-${i}`} style={{ position: 'relative' }}>
            <Image
              source={{ uri: p.uri }}
              style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: '#111' }}
            />
            <Pressable
              onPress={() => removePhotoAt(i)}
              accessibilityRole="button"
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                backgroundColor: '#ef4444',
                borderRadius: 12,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: 'white',
              }}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>×</Text>
            </Pressable>
          </View>
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

      <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onClearAll}
          style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db' }}
        >
          <Text style={{ fontWeight: '700' }}>Clear (wipe saved fields & photos)</Text>
        </Pressable>
      </View>

      {/* Hidden web inputs for camera/library (no effect on native) */}
      {isWeb ? (
        <div style={{ height: 0, overflow: 'hidden' }}>
          <input
            ref={camInputRef as any}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleWebFile(e.currentTarget.files?.[0] ?? null)}
          />
          <input
            ref={libInputRef as any}
            type="file"
            accept="image/*"
            onChange={(e) => handleWebFile(e.currentTarget.files?.[0] ?? null)}
          />
        </div>
      ) : null}
    </ScrollView>
  );
}
