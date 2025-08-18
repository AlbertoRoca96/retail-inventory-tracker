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
  storeSite: string;
  location: string;
  date: string;
  brand?: string;
  storeLocation: string;
  conditions: string;
  pricePerUnit: string;
  shelfSpace: string;
  onShelf: string;
  tags: string;
  notes: string;
};

type PdfPayload = {
  store_site: string;
  date: string;
  brand: string;
  store_location: string;
  location: string;
  conditions: string;
  price_per_unit: string;
  shelf_space: string;
  on_shelf: string;
  tags: string;
  notes: string;
  photo_urls: string[];
};

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';
const DRAFT_KEY = 'rit:new-form-draft:v8';
const todayISO = () => new Date().toISOString().slice(0, 10);

const getDefaultValues = (): FormValues => ({
  storeSite: '',
  location: '',
  date: todayISO(),
  brand: '',
  storeLocation: '',
  conditions: '',
  pricePerUnit: '',
  shelfSpace: '',
  onShelf: '',
  tags: '',
  notes: '',
});

function saveDraftLocal(draft: unknown) {
  try { if (isWeb && hasWindow) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
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
function clearDraftLocal() { try { if (isWeb && hasWindow) window.localStorage.removeItem(DRAFT_KEY); } catch {} }

export default function NewFormScreen() {
  const { session } = useAuth();
  const uid = useMemo(() => session?.user?.id ?? '', [session?.user?.id]);

  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => { if (isWeb) setHydrated(true); }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const formRef = useRef<FormValues>(getDefaultValues());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [nVals, setNVals] = useState<FormValues>(getDefaultValues());
  const [formKey, setFormKey] = useState(0);
  const [pdfReady, setPdfReady] = useState<PdfPayload | null>(null);

  const camInputRef = useRef<HTMLInputElement | null>(null);
  const libInputRef = useRef<HTMLInputElement | null>(null);
  const handleWebFile = useCallback((file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos((p) => [...p, { uri: url, fileName: file.name, mimeType: file.type || 'image/jpeg', width: null, height: null }]);
    setTimeout(scheduleAutosave, 0);
  }, []);

  const loaded = useRef(false);
  useEffect(() => {
    if (!hydrated || loaded.current) return;
    loaded.current = true;
    const draft = loadDraftLocal<Partial<FormValues> & { photos?: Photo[] }>();
    if (draft) {
      const merged: FormValues = { ...getDefaultValues(), ...draft };
      formRef.current = merged;
      setNVals(merged);
      setPhotos(draft.photos ?? []);
      setFormKey((k) => k + 1);
      setBanner({ kind: 'success', text: 'Draft loaded.' });
    }
  }, [hydrated]);

  const getValues = useCallback((): FormValues => (isWeb ? { ...formRef.current } : { ...nVals }), [nVals]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const v = getValues();
      saveDraftLocal({ ...v, photos });
    }, 350);
  }, [getValues, photos]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const removePhotoAt = (idx: number) => {
    setPhotos((prev) => { const next = prev.slice(); next.splice(idx, 1); return next; });
    setTimeout(scheduleAutosave, 0);
  };

  const addFromLibrary = async () => {
    if (isWeb) { libInputRef.current?.click(); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height }]);
      setTimeout(scheduleAutosave, 0);
    }
  };

  const takePhoto = async () => {
    if (isWeb) { camInputRef.current?.click(); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setBanner({ kind: 'error', text: 'Camera permission denied' }); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, width: a.width, height: a.height }]);
      setTimeout(scheduleAutosave, 0);
    }
  };

  const onSave = () => {
    const v = getValues();
    saveDraftLocal({ ...v, photos });
    setBanner({ kind: 'success', text: 'Draft saved locally.' });
  };

  const resetForm = (clearDraft: boolean) => {
    const fresh = getDefaultValues();
    formRef.current = fresh;
    setNVals(fresh);
    setPhotos([]);
    setFormKey((k) => k + 1);
    if (clearDraft) clearDraftLocal();
  };

  const onClearAll = () => {
    resetForm(true);
    saveDraftLocal({ ...getDefaultValues(), photos: [] });
    setBanner({ kind: 'success', text: 'Cleared all saved fields & photos.' });
  };

  const onDownloadPdf = async () => {
    if (!pdfReady) return;
    try {
      // Explicitly import the .web implementation for web
      const mod = await import('../../src/lib/exportPdf.web');
      const fn = (mod as any)?.downloadSubmissionPdf ?? (mod as any)?.default?.downloadSubmissionPdf;
      if (typeof fn !== 'function') throw new Error('PDF export function not found.');
      await fn(pdfReady);
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message || 'PDF export failed' });
      return;
    } finally {
      setPdfReady(null);
    }
  };

  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);
      setBanner({ kind: 'info', text: 'Submitting…' });

      const v = getValues();

      const uploadedUrls = await uploadPhotosAndGetUrls(uid || 'anon', photos);
      const excelPhotoUrls = uploadedUrls.length ? uploadedUrls : photos.map((p) => p.uri);

      let insertError: any = null;
      if (uid) {
        const { error } = await supabase.from('submissions').insert({
          user_id: uid,
          status: 'submitted',
          store_site: v.storeSite || null,
          location: v.location || null,
          brand: v.brand || null,
          date: v.date || null,
          store_location: v.storeLocation || null,
          conditions: v.conditions || null,
          price_per_unit: v.pricePerUnit ? Number(v.pricePerUnit) : null,
          shelf_space: v.shelfSpace || null,
          on_shelf: v.onShelf || null,
          tags: v.tags || null,
          notes: v.notes || null,
          photo1_url: uploadedUrls[0] ?? null,
          photo2_url: uploadedUrls[1] ?? null,
        });
        insertError = error ?? null;
      } else {
        insertError = { message: 'Not authenticated – saved to Excel/PDF only.' };
      }

      await downloadSubmissionExcel({
        store_site: v.storeSite || '',
        date: v.date || '',
        brand: v.brand || '',
        store_location: v.storeLocation || '',
        location: v.location || '',
        conditions: v.conditions || '',
        price_per_unit: v.pricePerUnit || '',
        shelf_space: v.shelfSpace || '',
        on_shelf: v.onShelf || '',
        tags: v.tags || '',
        notes: v.notes || '',
        photo_urls: excelPhotoUrls.filter(Boolean),
      });

      const pdfPayload: PdfPayload = {
        store_site: v.storeSite || '',
        date: v.date || '',
        brand: v.brand || '',
        store_location: v.storeLocation || '',
        location: v.location || '',
        conditions: v.conditions || '',
        price_per_unit: v.pricePerUnit || '',
        shelf_space: v.shelfSpace || '',
        on_shelf: v.onShelf || '',
        tags: v.tags || '',
        notes: v.notes || '',
        photo_urls: excelPhotoUrls.filter(Boolean),
      };

      if (isWeb) {
        setPdfReady(pdfPayload);
        setBanner((b) =>
          b?.kind === 'error'
            ? b
            : { kind: 'info', text: 'Excel downloaded. Tap "Download PDF" below to save the PDF.' }
        );
      } else {
        try {
          const mod = await import('../../src/lib/exportPdf');
          if ((mod as any)?.downloadSubmissionPdf) {
            await (mod as any).downloadSubmissionPdf(pdfPayload);
          }
        } catch {}
      }

      if (insertError) {
        setBanner({ kind: 'error', text: insertError.message ?? 'Row not saved (RLS). Files exported.' });
        return;
      }

      resetForm(true);
      setBanner({ kind: 'success', text: 'Submission Successful' });
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Submit failed' });
    } finally {
      setBusy(false);
    }
  };

  const WebField = ({
    name, label, placeholder, multiline, inputMode,
  }: {
    name: keyof FormValues; label: string; placeholder?: string; multiline?: boolean; inputMode?: 'text' | 'decimal';
  }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      {multiline ? (
        <textarea
          key={`${name}-${formKey}`}
          defaultValue={formRef.current[name] ?? ''}
          onInput={(e) => { (formRef.current as any)[name] = (e.currentTarget.value as any) ?? ''; scheduleAutosave(); }}
          onBlur={scheduleAutosave}
          placeholder={placeholder}
          style={{ width: '100%', backgroundColor: 'white', borderWidth: 1, borderColor: '#111', borderStyle: 'solid', borderRadius: 8, padding: 10, minHeight: 80 } as any}
        />
      ) : (
        <input
          key={`${name}-${formKey}`}
          defaultValue={formRef.current[name] ?? ''}
          onInput={(e) => { (formRef.current as any)[name] = (e.currentTarget.value as any) ?? ''; scheduleAutosave(); }}
          onBlur={scheduleAutosave}
          placeholder={placeholder}
          inputMode={inputMode}
          style={{ width: '100%', backgroundColor: 'white', borderWidth: 1, borderColor: '#111', borderStyle: 'solid', borderRadius: 8, padding: 8, height: 40 } as any}
        />
      )}
    </View>
  );

  const NativeField = ({
    prop, label, placeholder, multiline, keyboardType,
  }: {
    prop: keyof FormValues; label: string; placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'email-address';
  }) => {
    const value = nVals[prop];
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={(s) => { setNVals((prev) => ({ ...prev, [prop]: s ?? '' })); scheduleAutosave(); }}
          placeholder={placeholder}
          multiline={!!multiline}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType={keyboardType}
          style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: multiline ? 10 : 8, minHeight: multiline ? 80 : 40, textAlignVertical: multiline ? 'top' : 'center' }}
        />
      </View>
    );
  };

  const Field = (p: {
    name: keyof FormValues; label: string; placeholder?: string; multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'email-address';
  }) =>
    isWeb ? (
      <WebField name={p.name} label={p.label} placeholder={p.placeholder} multiline={p.multiline} inputMode={p.keyboardType === 'numeric' ? 'decimal' : 'text'} />
    ) : (
      <NativeField prop={p.name} label={p.label} placeholder={p.placeholder} multiline={p.multiline} keyboardType={p.keyboardType} />
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
        <View style={{ backgroundColor: banner.kind === 'success' ? '#16a34a' : banner.kind === 'error' ? '#ef4444' : '#0ea5e9', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <Text style={{ color: 'white', textAlign: 'center' }}>{banner.text}</Text>
        </View>
      ) : null}

      <Field name="storeSite" label="STORE SITE" />
      <Field name="storeLocation" label="STORE LOCATION" />
      <Field name="location" label="LOCATIONS" />

      <Field name="date" label="DATE" placeholder="YYYY-MM-DD" />
      <Field name="brand" label="BRAND" />
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
            <Image source={{ uri: p.uri }} style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: '#111' }} />
            <Pressable
              onPress={() => removePhotoAt(i)}
              accessibilityRole="button"
              style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'white' }}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>×</Text>
            </Pressable>
          </View>
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

      {isWeb && pdfReady ? (
        <View style={{ marginTop: 12, gap: 8 as any }}>
          <Pressable
            onPress={onDownloadPdf}
            style={{ backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1d4ed8' }}
          >
            <Text style={{ color: 'white', fontWeight: '700' }}>Download PDF</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: '#334155', textAlign: 'center' }}>
            Some mobile browsers only allow one automatic download per tap. If the PDF didn’t auto-download, tap this button.
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onClearAll}
          style={{ flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db' }}
        >
          <Text style={{ fontWeight: '700' }}>Clear (wipe saved fields & photos)</Text>
        </Pressable>
      </View>

      {isWeb ? (
        <div style={{ height: 0, overflow: 'hidden' }}>
          <input ref={camInputRef as any} type="file" accept="image/*" capture="environment" onChange={(e) => handleWebFile(e.currentTarget.files?.[0] ?? null)} />
          <input ref={libInputRef as any} type="file" accept="image/*" onChange={(e) => handleWebFile(e.currentTarget.files?.[0] ?? null)} />
        </div>
      ) : null}
    </ScrollView>
  );
}
