// apps/mobile/app/form/new.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { uploadPhotosAndGetUrls } from '../../src/lib/supabaseHelpers';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { downloadSubmissionExcel } from '../../src/lib/exportExcel';
// PDF export is loaded dynamically inside onSubmit / onDownloadPdf to avoid hard coupling.

// -----------------------------
// NEW: Types & helpers (added)
// -----------------------------
type ValidationErrors = Partial<{
  storeSite: string;
  storeLocation: string;
  location: string;
  date: string;
  brand: string;
  pricePerUnit: string;
  onShelf: string;
}>;

const isWeb = Platform.OS === 'web';
const hasWindow = typeof window !== 'undefined';
const nowISO = () => new Date().toISOString();
const safeNumber = (s?: string) => {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const looksLikeISODate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// NEW: queue storage keys
const QUEUE_KEY = 'rit:submission-queue:v1';

// NEW: queued item shape
type QueuedSubmission = {
  id: string; // client-side id
  createdAt: string;
  payload: any; // DB row payload
};

// -----------------------------
// Original code continues
// -----------------------------

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
  // NEW fields
  storeSite: string;     // e.g., "WHOLE FOODS"
  location: string;      // e.g., "Middle Shelf"

  // Existing fields (+ NEW brand below)
  date: string;
  brand?: string;        // NEW: under DATE in the sheet & PDF
  storeLocation: string;
  conditions: string;
  pricePerUnit: string;
  shelfSpace: string;
  onShelf: string;
  tags: string;
  notes: string;
};

// Local type for the PDF call so we don't statically import the module on web
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

/** Bump this key when the local-draft format changes to avoid loading stale drafts */
const DRAFT_KEY = 'rit:new-form-draft:v8';
const todayISO = () => new Date().toISOString().slice(0, 10);

const getDefaultValues = (): FormValues => ({
  storeSite: '',          // NEW
  location: '',           // NEW
  date: todayISO(),
  brand: '',              // NEW
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

// ---------- NEW: queue helpers ----------
function readQueue(): QueuedSubmission[] {
  try {
    if (isWeb && hasWindow) {
      const raw = window.localStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedSubmission[]) : [];
    }
  } catch {}
  return [];
}
function writeQueue(items: QueuedSubmission[]) {
  try {
    if (isWeb && hasWindow) window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {}
}
function enqueueSubmission(payload: any) {
  const items = readQueue();
  items.push({ id: cryptoRandomId(), createdAt: nowISO(), payload });
  writeQueue(items);
}
function dequeueSubmission(): QueuedSubmission | null {
  const items = readQueue();
  if (!items.length) return null;
  const first = items.shift()!;
  writeQueue(items);
  return first;
}
function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint8Array(12);
    (crypto as any).getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2);
}

export default function NewFormScreen() {
  const { session } = useAuth();
  const uid = useMemo(() => session?.user?.id ?? '', [session?.user?.id]);

  // NEW: cache the user’s team once; use it on submit
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  // NEW: support multiple teams (picker)
  const [teamOptions, setTeamOptions] = useState<{ team_id: string; name?: string | null }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // NEW: online/offline & queue status
  const [isOnline, setIsOnline] = useState(() => (isWeb && hasWindow ? navigator.onLine : true));
  const [queuedCount, setQueuedCount] = useState<number>(() => readQueue().length);
  const [autoQueueWhenOffline, setAutoQueueWhenOffline] = useState(true);

  // Avoid hydration quirks for static web
  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  // NEW: validation/touched/debug
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormValues, boolean>>({
    storeSite: false, location: false, date: false, brand: false,
    storeLocation: false, conditions: false, pricePerUnit: false,
    shelfSpace: false, onShelf: false, tags: false, notes: false,
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // ---------------- Values store ----------------
  const formRef = useRef<FormValues>(getDefaultValues());
  const [photos, setPhotos] = useState<Photo[]>([]);

  // Native mirrored state
  const [nVals, setNVals] = useState<FormValues>(getDefaultValues());

  // When we need web inputs to re-mount with new defaultValue (after Clear/Load), bump this key.
  const [formKey, setFormKey] = useState(0);

  // NEW: when set on web, shows a one-tap PDF download button (to satisfy user gesture)
  const [pdfReady, setPdfReady] = useState<PdfPayload | null>(null);

  // ---- web camera/library fallbacks ----
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
    setTimeout(scheduleAutosave, 0);
  }, []);

  // NEW: unsaved-guard on web
  useEffect(() => {
    if (!isWeb) return;
    const handler = (e: BeforeUnloadEvent) => {
      const draft = loadDraftLocal<any>();
      const hasDraft = !!draft && JSON.stringify(draft) !== JSON.stringify(getDefaultValues());
      if (hasDraft) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (hasWindow) window.addEventListener('beforeunload', handler);
    return () => { if (hasWindow) window.removeEventListener('beforeunload', handler); };
  }, []);

  // NEW: online/offline listeners (web)
  useEffect(() => {
    if (!(isWeb && hasWindow)) return;
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // Load draft once after hydration
  const loaded = useRef(false);
  useEffect(() => {
    if (!hydrated || loaded.current) return;
    loaded.current = true;
    // ✅ fixed extra ">" that broke the build
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

  // NEW: prefetch team once user is known
  useEffect(() => {
    let cancelled = false;
    const fetchTeam = async () => {
      if (!uid) { setTeamId(null); setTeamOptions([]); setSelectedTeamId(null); return; }
      setTeamLoading(true);

      // Fetch teams for user (with names)
      const { data: rows, error } = await supabase
        .from('team_members')
        .select('team_id, teams(name)')
        .eq('user_id', uid);

      const one = rows?.[0]?.team_id ?? null;
      if (!cancelled) {
        if (error) {
          setTeamId(null);
          setTeamOptions([]);
          setSelectedTeamId(null);
        } else {
          const opts = (rows ?? []).map((r: any) => ({ team_id: r.team_id, name: r.teams?.name ?? null }));
          setTeamOptions(opts);
          setTeamId(one);
          setSelectedTeamId(one);
        }
        setTeamLoading(false);
      }
    };
    fetchTeam();
    return () => { cancelled = true; };
  }, [uid]);

  const getValues = useCallback((): FormValues => {
    return isWeb ? { ...formRef.current } : { ...nVals };
  }, [nVals]);

  // ---------------- NEW: validation ----------------
  const validate = useCallback((v: FormValues): ValidationErrors => {
    const e: ValidationErrors = {};
    if (!v.storeSite?.trim()) e.storeSite = 'Required';
    if (!v.storeLocation?.trim()) e.storeLocation = 'Required';
    if (!looksLikeISODate(v.date)) e.date = 'Use YYYY-MM-DD';
    const p = safeNumber(v.pricePerUnit);
    if (v.pricePerUnit && p === null) e.pricePerUnit = 'Invalid number';
    const s = safeNumber(v.onShelf);
    if (v.onShelf && s === null) e.onShelf = 'Invalid number';
    return e;
  }, []);

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const v = getValues();
      saveDraftLocal({ ...v, photos });
      setLastSavedAt(new Date().toLocaleTimeString());
    }, 350);
  }, [getValues, photos]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // NEW: flush queue when we come online + authenticated
  useEffect(() => {
    const tryFlush = async () => {
      if (!isOnline || !uid) return;
      let popped: QueuedSubmission | null;
      let flushed = 0;
      while ((popped = dequeueSubmission())) {
        const { payload } = popped;
        const { error } = await supabase.from('submissions').insert(payload);
        if (error) {
          // put it back to the front
          const remaining = readQueue();
          writeQueue([{ ...popped }, ...remaining]);
          break;
        }
        flushed += 1;
      }
      if (flushed > 0) {
        setQueuedCount(readQueue().length);
        setBanner({ kind: 'success', text: `Synced ${flushed} queued submission${flushed > 1 ? 's' : ''}.` });
      } else {
        setQueuedCount(readQueue().length);
      }
    };
    tryFlush();
  }, [isOnline, uid]);

  // ---------------- Photos ----------------
  const removePhotoAt = (idx: number) => {
    setPhotos((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
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
      camInputRef.current?.click();
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

  const resetForm = (clearDraft: boolean) => {
    const fresh = getDefaultValues();
    formRef.current = fresh;
    setNVals(fresh);
    setPhotos([]);
    setFormKey((k) => k + 1);
    if (clearDraft) clearDraftLocal();
    // Note: intentionally do NOT clear pdfReady here so the user can still tap "Download PDF"
    // after a successful submission/reset if needed.
  };

  const onClearAll = () => {
    resetForm(true);
    saveDraftLocal({ ...getDefaultValues(), photos: [] });
    setBanner({ kind: 'success', text: 'Cleared all saved fields & photos.' });
  };

  // Web-only: one-tap PDF download (satisfies user gesture)
  const onDownloadPdf = async () => {
    if (!pdfReady) return;
    try {
      // Explicitly resolve the .web variant for GH Pages / Metro web.
      const mod = await import('../../src/lib/exportPdf.web');
      const fn = (mod as any)?.downloadSubmissionPdf ?? (mod as any)?.default?.downloadSubmissionPdf;
      if (typeof fn !== 'function') {
        throw new Error('PDF export function not found.');
      }
      await fn(pdfReady);
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message || 'PDF export failed' });
      return;
    } finally {
      // Hide the button only after we’ve tried.
      setPdfReady(null);
    }
  };

  // NEW: central mapping to DB row (keeps insert + queue consistent)
  const buildSubmissionRow = useCallback((v: FormValues, effectiveTeamId: string, uploadedUrls: string[]) => {
    return {
      // server will still enforce auth via RLS/trigger, but we send explicit values
      created_by: uid || null,
      team_id: effectiveTeamId,

      store_site: v.storeSite || null,
      location: v.location || null,
      brand: v.brand || null,

      date: v.date || null,
      store_location: v.storeLocation || null,
      conditions: v.conditions || null,
      price_per_unit: safeNumber(v.pricePerUnit),
      shelf_space: v.shelfSpace || null,
      on_shelf: safeNumber(v.onShelf),
      tags: v.tags ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      notes: v.notes || null,

      photo1_url: uploadedUrls[0] ?? null,
      photo2_url: uploadedUrls[1] ?? null,
    };
  }, [uid]);

  // Submit: upload → DB insert (optional) → ALWAYS export (Excel) → PDF
  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);

      const v = getValues();

      // Validate early (only show required errors now)
      const e = validate(v);
      setErrors(e);
      if (Object.keys(e).length) {
        setBanner({ kind: 'error', text: 'Please fix the highlighted fields.' });
        return;
      }

      // Informative steps
      setBanner({ kind: 'info', text: 'Uploading photos…' });

      // 1) Upload photos (if signed out, we'll still export with local URIs)
      const uploadedUrls = await uploadPhotosAndGetUrls(uid || 'anon', photos);
      const excelPhotoUrls = uploadedUrls.length ? uploadedUrls : photos.map((p) => p.uri);

      // 2) Optional DB insert
      let insertError: any = null;
      let effectiveTeamId: string | null = null;

      if (uid) {
        setBanner({ kind: 'info', text: 'Preparing database insert…' });

        // ✅ find or reuse the user's chosen team_id (required by RLS)
        effectiveTeamId = selectedTeamId || teamId;
        if (!effectiveTeamId && !teamLoading) {
          const { data: tm, error: tmErr } = await supabase
            .from('team_members')
            .select('team_id')
            .eq('user_id', uid)
            .limit(1)
            .maybeSingle();
          if (tmErr) throw tmErr;
          effectiveTeamId = tm?.team_id ?? null;
        }
        if (!effectiveTeamId) {
          throw new Error('No team found for this user. Ask an admin to add you to a team.');
        }

        const row = buildSubmissionRow(v, effectiveTeamId, uploadedUrls);

        // If offline (web) and auto-queue is on: push to queue and skip live insert
        if (!isOnline && autoQueueWhenOffline) {
          enqueueSubmission(row);
          setQueuedCount(readQueue().length);
          insertError = null; // not an error; queued instead
        } else {
          setBanner({ kind: 'info', text: 'Saving to database…' });
          const { error } = await supabase.from('submissions').insert(row);
          insertError = error ?? null;

          // If network rejected, queue it (best-effort)
          if (insertError && String(insertError.message || '').toLowerCase().includes('network')) {
            enqueueSubmission(row);
            setQueuedCount(readQueue().length);
            insertError = null;
            setBanner({ kind: 'info', text: 'Offline detected. Submission queued locally.' });
          }
        }
      } else {
        // Not signed in => skip DB, continue exports
        insertError = { message: 'Not authenticated – saved to Excel/PDF only.' };
      }

      // 3) Always export Excel (now includes BRAND)
      setBanner({ kind: 'info', text: 'Creating Excel…' });
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

      // 3b) PDF export setup
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
        // 👉 Web: show a user-gesture button to avoid multiple auto-downloads being blocked.
        setPdfReady(pdfPayload);
        setBanner((b) =>
          b?.kind === 'error'
            ? b
            : { kind: 'info', text: 'Excel downloaded. Tap "Download PDF" below to save the PDF.' }
        );
      } else {
        // 👉 Native: keep auto-export via dynamic import
        try {
          const mod = await import('../../src/lib/exportPdf');
          if (mod?.downloadSubmissionPdf) {
            await mod.downloadSubmissionPdf(pdfPayload);
          }
        } catch {}
      }

      if (insertError) {
        setBanner({ kind: 'error', text: insertError.message ?? 'Row not saved (RLS). Files exported.' });
        return;
      }

      // 4) Clean reset after success (pdfReady is intentionally preserved)
      resetForm(true);
      setBanner({ kind: 'success', text: 'Submission Successful' });
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Submit failed' });
    } finally {
      setBusy(false);
    }
  };

  // ---------------- Fields ----------------
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
          onBlur={() => {
            setTouched((t) => ({ ...t, [name]: true } as any));
            scheduleAutosave();
          }}
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
          onBlur={() => {
            setTouched((t) => ({ ...t, [name]: true } as any));
            scheduleAutosave();
          }}
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
      {/* NEW: inline error for web field */}
      {touched[name] && (errors as any)[name] ? (
        <Text style={{ color: '#b91c1c', marginTop: 4 }}>{(errors as any)[name]}</Text>
      ) : null}
    </View>
  );

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
          onBlur={() => setTouched((t) => ({ ...t, [prop]: true } as any))}
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
        {/* NEW: inline error for native field */}
        {touched[prop] && (errors as any)[prop] ? (
          <Text style={{ color: '#b91c1c', marginTop: 4 }}>{(errors as any)[prop]}</Text>
        ) : null}
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

      {/* NEW: status line for online/offline & queue */}
      <View style={{ marginBottom: 8 }}>
        <Text style={{ textAlign: 'center', fontSize: 12, color: isOnline ? '#16a34a' : '#b45309' }}>
          {isOnline ? 'Online' : 'Offline'} • Queue: {queuedCount} • Last saved draft: {lastSavedAt ?? '—'}
        </Text>
      </View>

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

      {/* NEW: team picker if multiple teams */}
      {uid && teamOptions.length > 1 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '700', marginBottom: 6 }}>TEAM</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' as any }}>
            {teamOptions.map((t) => {
              const active = (selectedTeamId ?? teamId) === t.team_id;
              return (
                <Pressable
                  key={t.team_id}
                  onPress={() => setSelectedTeamId(t.team_id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? '#1d4ed8' : '#d1d5db',
                    backgroundColor: active ? '#e0e7ff' : '#f9fafb',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: '#111827' }}>
                    {t.name || t.team_id.slice(0, 8)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* NEW: offline queue toggle */}
      {isWeb ? (
        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
          <Pressable
            onPress={() => setAutoQueueWhenOffline((x) => !x)}
            style={{
              width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: '#111',
              alignItems: 'center', justifyContent: 'center', backgroundColor: autoQueueWhenOffline ? '#16a34a' : 'white',
            }}
          >
            {autoQueueWhenOffline ? <Text style={{ color: 'white' }}>✓</Text> : null}
          </Pressable>
          <Text>Auto-queue when offline</Text>
        </View>
      ) : null}

      {/* NEW fields at the top, matching the PDF */}
      <Field name="storeSite" label="STORE SITE" />
      <Field name="storeLocation" label="STORE LOCATION" />
      <Field name="location" label="LOCATIONS" />

      <Field name="date" label="DATE" placeholder="YYYY-MM-DD" />
      <Field name="brand" label="BRAND" /> {/* NEW under DATE */}
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

      {/* Web-only: one-tap PDF download (satisfies user gesture) */}
      {isWeb && pdfReady ? (
        <View style={{ marginTop: 12, gap: 8 as any }}>
          <Pressable
            onPress={onDownloadPdf}
            style={{
              backgroundColor: '#2563eb',
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#1d4ed8',
            }}
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
          style={{
            flex: 1,
            backgroundColor: '#f3f4f6',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#d1d5db',
          }}
        >
          <Text style={{ fontWeight: '700' }}>Clear (wipe saved fields & photos)</Text>
        </Pressable>
      </View>

      {/* NEW: tiny debug panel (toggle) */}
      <View style={{ marginTop: 16 }}>
        <Pressable
          onPress={() => setShowDebug((x) => !x)}
          style={{ alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6' }}
        >
          <Text style={{ fontSize: 12, color: '#334155' }}>{showDebug ? 'Hide' : 'Show'} debug</Text>
        </Pressable>
        {showDebug ? (
          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#111827', borderRadius: 8 }}>
            <Text style={{ color: '#93c5fd', fontFamily: 'monospace' as any, fontSize: 12 }}>
              {JSON.stringify(
                {
                  uid,
                  teamId,
                  selectedTeamId,
                  teamOptions,
                  isOnline,
                  queuedCount,
                  values: getValues(),
                },
                null,
                2
              )}
            </Text>
          </View>
        ) : null}
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
