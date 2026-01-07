import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
} from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image, Platform, StyleSheet, SafeAreaView, Keyboard, KeyboardAvoidingView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import Head from 'expo-router/head';

import LogoHeader from '../../src/components/LogoHeader';
import { colors } from '../../src/theme';
import { uploadPhotosAndGetPathsAndUrls } from '../../src/lib/supabaseHelpers';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { loadUserDefaults, saveUserDefaults } from '../../src/lib/preferences';
// ✨ NEW: pull UI accessibility toggles
import { useUISettings } from '../../src/lib/uiSettings';

type ValidationErrors = Partial<{
  storeSite: string;
  storeLocation: string;
  location: string;
  date: string;
  brand: string;
  pricePerUnit: string;
  onShelf: string;
  priorityLevel: string;
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

const QUEUE_KEY = 'rit:submission-queue:v1';

type QueuedSubmission = {
  id: string;
  createdAt: string;
  payload: any;
};

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

  // NEW
  priorityLevel: '1' | '2' | '3';
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
  priority_level?: string;
  photo_urls: string[];
};

const DRAFT_KEY = 'rit:new-form-draft:v9';
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
  priorityLevel: '3',
});

const formStyles = StyleSheet.create({
  card: {
    paddingVertical: 8,
    gap: 12,
  },
});

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

type WebFieldProps = {
  name: keyof FormValues;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  inputMode?: 'text' | 'decimal';
  labelAdornment?: React.ReactNode;
  formKey: number;
  formRef: React.MutableRefObject<FormValues>;
  touched: Record<keyof FormValues, boolean>;
  setTouched: React.Dispatch<React.SetStateAction<Record<keyof FormValues, boolean>>>;
  onEdit: () => void;
  typingStart: () => void;
  typingEnd: () => void;
};

const WebField = memo(function WebField({
  name,
  label,
  placeholder,
  multiline,
  inputMode,
  labelAdornment,
  formKey,
  formRef,
  touched,
  setTouched,
  onEdit,
  typingStart,
  typingEnd,
}: WebFieldProps) {
  // ✨ NEW: accessibility-aware sizing/colors
  const {
    simplifiedMode = false,
    largeText = false,
    highContrast = false,
    fontScale = 1,
    targetMinHeight = 48,
  } = useUISettings() || ({} as any);
  const labelFontSize = Math.round(14 * (simplifiedMode || largeText ? 1.15 : 1) * fontScale);
  const bodyFontSize = Math.round(14 * (largeText ? 1.1 : 1) * fontScale);
  const inputHeight = (simplifiedMode || largeText) ? 52 : 40;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontWeight: '700', fontSize: labelFontSize }}>{label}</Text>
        {labelAdornment ? <View style={{ marginLeft: 12 }}>{labelAdornment}</View> : null}
      </View>
      {multiline ? (
        <textarea
          key={`${name}-${formKey}`}
          defaultValue={formRef.current[name] ?? ''}
          onFocus={typingStart}
          onInput={(e) => {
            formRef.current[name] = (e.currentTarget.value as any) ?? '';
            onEdit();
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, [name]: true } as any));
            typingEnd();
            onEdit();
          }}
          placeholder={placeholder}
          style={{
            width: '100%',
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: highContrast ? '#000' : '#111',
            borderStyle: 'solid',
            borderRadius: 8,
            padding: 10,
            minHeight: 80,
            fontSize: bodyFontSize,
          } as any}
        />
      ) : (
        <input
          key={`${name}-${formKey}`}
          defaultValue={formRef.current[name] ?? ''}
          onFocus={typingStart}
          onInput={(e) => {
            formRef.current[name] = (e.currentTarget.value as any) ?? '';
            onEdit();
          }}
          onBlur={() => {
            setTouched((t) => ({ ...t, [name]: true } as any));
            typingEnd();
            onEdit();
          }}
          placeholder={placeholder}
          inputMode={inputMode}
          style={{
            width: '100%',
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: highContrast ? '#000' : '#111',
            borderStyle: 'solid',
            borderRadius: 8,
            padding: 8,
            height: inputHeight,
            fontSize: bodyFontSize,
          } as any}
        />
      )}
      {touched[name] && (touched as any)[name] ? null : null}
      {touched[name] && (false) ? null : null}
    </View>
  );
});

type NativeFieldProps = {
  prop: keyof FormValues;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  labelAdornment?: React.ReactNode;
  value: string;
  setValue: (s: string) => void;
  touched: Record<keyof FormValues, boolean>;
  setTouched: React.Dispatch<React.SetStateAction<Record<keyof FormValues, boolean>>>;
  error?: string | undefined;
  typingStart: () => void;
  typingEnd: () => void;
};

const NativeField = memo(function NativeField({
  prop,
  label,
  placeholder,
  multiline,
  keyboardType,
  labelAdornment,
  value,
  setValue,
  touched,
  setTouched,
  error,
  typingStart,
  typingEnd,
}: NativeFieldProps) {
  // ✨ NEW: accessibility-aware sizing/colors
  const {
    simplifiedMode = false,
    largeText = false,
    highContrast = false,
    fontScale = 1,
  } = useUISettings() || ({} as any);
  const labelFontSize = Math.round(14 * (simplifiedMode || largeText ? 1.15 : 1) * fontScale);
  const bodyFontSize = Math.round(14 * (largeText ? 1.1 : 1) * fontScale);

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontWeight: '700', fontSize: labelFontSize }}>{label}</Text>
        {labelAdornment ? <View style={{ marginLeft: 12 }}>{labelAdornment}</View> : null}
      </View>
      <TextInput
        value={value}
        onFocus={typingStart}
        onChangeText={(s) => {
          setValue(s ?? '');
        }}
        onBlur={() => {
          setTouched((t) => ({ ...t, [prop]: true } as any));
          typingEnd();
        }}
        placeholder={placeholder}
        multiline={!!multiline}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType={keyboardType}
        blurOnSubmit={!multiline}
        returnKeyType={multiline ? 'default' : 'done'}
        onSubmitEditing={!multiline ? () => Keyboard.dismiss() : undefined}
        style={{
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: highContrast ? '#000' : '#111',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 8,
          minHeight: multiline ? 80 : 40,
          textAlignVertical: multiline ? 'top' : 'center',
          fontSize: bodyFontSize,
        }}
      />
      {touched[prop] && error ? (
        <Text style={{ color: '#b91c1c', marginTop: 4 }}>{error}</Text>
      ) : null}
    </View>
  );
});

type FieldProps = {
  name: keyof FormValues;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  inputMode?: 'text' | 'decimal';
  labelAdornment?: React.ReactNode;
  formKey: number;
  formRef: React.MutableRefObject<FormValues>;
  onEdit: () => void;
  nVals: FormValues;
  setNVals: React.Dispatch<React.SetStateAction<FormValues>>;
  errors: ValidationErrors;
  touched: Record<keyof FormValues, boolean>;
  setTouched: React.Dispatch<React.SetStateAction<Record<keyof FormValues, boolean>>>;
  typingStart: () => void;
  typingEnd: () => void;
};

const Field = memo(function Field({
  name,
  label,
  placeholder,
  multiline,
  keyboardType,
  inputMode,
  labelAdornment,
  formKey,
  formRef,
  onEdit,
  nVals,
  setNVals,
  errors,
  touched,
  setTouched,
  typingStart,
  typingEnd,
}: FieldProps) {
  return isWeb ? (
    <WebField
      name={name}
      label={label}
      placeholder={placeholder}
      multiline={multiline}
      inputMode={inputMode}
      formKey={formKey}
      formRef={formRef}
      labelAdornment={labelAdornment}
      touched={touched}
      setTouched={setTouched}
      onEdit={onEdit}
      typingStart={typingStart}
      typingEnd={typingEnd}
    />
  ) : (
    <NativeField
      prop={name}
      label={label}
      placeholder={placeholder}
      multiline={multiline}
      keyboardType={keyboardType}
      labelAdornment={labelAdornment}
      value={nVals[name] ?? ''}
      setValue={(s) => setNVals((prev) => ({ ...prev, [name]: s ?? '' }))}
      touched={touched}
      setTouched={setTouched}
      error={(errors as any)[name]}
      typingStart={typingStart}
      typingEnd={typingEnd}
    />
  );
});

export default function NewFormScreen() {
  const { session } = useAuth();
  const uid = useMemo(() => session?.user?.id ?? '', [session?.user?.id]);

  // ✨ NEW: accessibility toggles & derived sizes
  const {
    simplifiedMode = false,
    largeText = false,
    highContrast = false,
    fontScale = 1,
    targetMinHeight = 48,
  } = useUISettings() || ({} as any);
  const statusFontSize = Math.round(12 * (largeText ? 1.1 : 1) * fontScale);
  const labelFontSize = Math.round(14 * (simplifiedMode || largeText ? 1.15 : 1) * fontScale);
  const bodyFontSize = Math.round(14 * (largeText ? 1.1 : 1) * fontScale);
  const buttonPadV = simplifiedMode ? 14 : 12;
  const btnBlue = highContrast ? '#1743b3' : '#5ba3f8';

  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  const [teamOptions, setTeamOptions] = useState<{ team_id: string; name?: string | null }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState(() => (isWeb && hasWindow ? navigator.onLine : true));
  const [queuedCount, setQueuedCount] = useState<number>(() => readQueue().length);
  const [autoQueueWhenOffline, setAutoQueueWhenOffline] = useState(true);

  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormValues, boolean>>({
    storeSite: false, location: false, date: false, brand: false,
    storeLocation: false, conditions: false, pricePerUnit: false,
    shelfSpace: false, onShelf: false, tags: false, notes: false,
    priorityLevel: false,
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const formRef = useRef<FormValues>(getDefaultValues());
  const [photos, setPhotos] = useState<Photo[]>([]);

  const [nVals, setNVals] = useState<FormValues>(getDefaultValues());

  const [formKey, setFormKey] = useState(0);

  const [pdfReady, setPdfReady] = useState<PdfPayload | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);

  // After-submit: prompt to remember defaults
  const [showRememberPrompt, setShowRememberPrompt] = useState(false);
  const [lastSubmittedVals, setLastSubmittedVals] = useState<FormValues | null>(null);

  const camInputRef = useRef<HTMLInputElement | null>(null);
  const libInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const [keyboardMetrics, setKeyboardMetrics] = useState({ visible: false, height: 0 });

  const isTypingRef = useRef(false);
  const typingStart = useCallback(() => { isTypingRef.current = true; }, []);
  const typingEnd = useCallback(() => {
    isTypingRef.current = false;
    setLastSavedAt(new Date().toLocaleTimeString());
  }, []);

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
    setTimeout(() => scheduleAutosave(), 0);
  }, []);

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
    } else {
      // No draft: try prefill from saved user defaults (per-team)
      (async () => {
        try {
          const defaults = await loadUserDefaults(uid, selectedTeamId || teamId);
          if (defaults && (defaults.storeSite || defaults.storeLocation || defaults.brand)) {
            const base = getDefaultValues();
            const merged: FormValues = {
              ...base,
              storeSite: defaults.storeSite ?? base.storeSite,
              storeLocation: defaults.storeLocation ?? base.storeLocation,
              brand: defaults.brand ?? base.brand,
            } as FormValues;
            formRef.current = merged;
            setNVals(merged);
            setFormKey((k) => k + 1);
            setBanner({ kind: 'info', text: 'Prefilled from your saved defaults.' });
          }
        } catch {}
      })();
    }
  }, [hydrated]);

  // Secondary prefill: in case team selection arrives after mount and no draft exists
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardMetrics({ visible: true, height: e.endCoordinates?.height ?? 0 });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardMetrics({ visible: false, height: 0 });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const cur = getValues();
    // Only prefill if fields are blank-ish (avoid clobbering user's in-progress input)
    const hasAny = !!(cur.storeSite?.trim() || cur.storeLocation?.trim() || cur.brand?.trim());
    if (hasAny) return;
    (async () => {
      try {
        const defaults = await loadUserDefaults(uid, selectedTeamId || teamId);
        if (defaults && (defaults.storeSite || defaults.storeLocation || defaults.brand)) {
          const base = getDefaultValues();
          const merged: FormValues = {
            ...cur,
            storeSite: defaults.storeSite ?? cur.storeSite ?? base.storeSite,
            storeLocation: defaults.storeLocation ?? cur.storeLocation ?? base.storeLocation,
            brand: defaults.brand ?? cur.brand ?? base.brand,
          } as FormValues;
          formRef.current = merged;
          setNVals(merged);
          setFormKey((k) => k + 1);
          setBanner({ kind: 'info', text: 'Prefilled from your saved defaults.' });
        }
      } catch {}
    })();
  }, [uid, teamId, selectedTeamId, hydrated]);

  useEffect(() => {
    let cancelled = false;
    const fetchTeam = async () => {
      if (!uid) { setTeamId(null); setTeamOptions([]); setSelectedTeamId(null); return; }
      setTeamLoading(true);

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

  const updateFieldValue = useCallback((name: keyof FormValues, value: string) => {
    if (isWeb) {
      formRef.current[name] = value;
      setFormKey((k) => k + 1);
    } else {
      setNVals((prev) => ({ ...prev, [name]: value }));
    }
    setTouched((prev) => ({ ...prev, [name]: true }));
    scheduleAutosave();
  }, [isWeb, scheduleAutosave, setNVals, setTouched, setFormKey]);

  const validate = useCallback((v: FormValues): ValidationErrors => {
    const e: ValidationErrors = {};
    if (!v.storeSite?.trim()) e.storeSite = 'Required';
    if (!v.storeLocation?.trim()) e.storeLocation = 'Required';
    if (!looksLikeISODate(v.date)) e.date = 'Use YYYY-MM-DD';
    const p = safeNumber(v.pricePerUnit);
    if (v.pricePerUnit && p === null) e.pricePerUnit = 'Invalid number';
    const s = safeNumber(v.onShelf);
    if (v.onShelf && s === null) e.onShelf = 'Invalid number';
    if (!['1','2','3'].includes(v.priorityLevel)) e.priorityLevel = 'Choose 1, 2, or 3';
    return e;
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const v = getValues();
      saveDraftLocal({ ...v, photos });
      if (!isTypingRef.current) {
        setLastSavedAt(new Date().toLocaleTimeString());
      }
    }, 350);
  }, [getValues, photos]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const tryFlush = async () => {
      if (!isOnline || !uid) return;
      let popped: QueuedSubmission | null;
      let flushed = 0;
      while ((popped = dequeueSubmission())) {
        const { payload } = popped;
        const { error } = await supabase.from('submissions').insert(payload);
        if (error) {
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

  const removePhotoAt = (idx: number) => {
    setPhotos((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
    setTimeout(() => scheduleAutosave(), 0);
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
      setTimeout(() => scheduleAutosave(), 0);
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
      setTimeout(() => scheduleAutosave(), 0);
    }
  };

  const onSave = () => {
    const v = getValues();
    saveDraftLocal({ ...v, photos });
    if (!isTypingRef.current) {
      setBanner({ kind: 'success', text: 'Draft saved locally.' });
      setLastSavedAt(new Date().toLocaleTimeString());
    }
  };

  const resetForm = (clearDraft: boolean) => {
    const fresh = getDefaultValues();
    formRef.current = fresh;
    setNVals(fresh);
    setPhotos([]);
    setFormKey((k) => k + 1);
    if (clearDraft) clearDraftLocal();
  };

  const onDownloadPdf = async () => {
    if (!pdfReady) return;
    try {
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
      setPdfReady(null);
    }
  };

  const buildSubmissionRow = useCallback((
    v: FormValues,
    effectiveTeamId: string,
    uploads: { path: string; publicUrl: string }[]
  ) => {
    return {
      user_id: uid || null,
      created_by: uid || null,
      team_id: effectiveTeamId,
      group_id: null,
      status: 'submitted',
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
      photo1_url: uploads[0]?.publicUrl ?? null,
      photo2_url: uploads[1]?.publicUrl ?? null,
      photo1_path: uploads[0]?.path ?? null,
      photo2_path: uploads[1]?.path ?? null,
      priority_level: Number(v.priorityLevel) || 3,
    };
  }, [uid]);

  const onSubmit = async () => {
    try {
      if (busy) return;
      setBusy(true);

      const v = getValues();

      const e = validate(v);
      setErrors(e);
      if (Object.keys(e).length) {
        setBanner({ kind: 'error', text: 'Please fix the highlighted fields.' });
        return;
      }

      setBanner({ kind: 'info', text: 'Uploading photos…' });

      const uploadedAssets = await uploadPhotosAndGetPathsAndUrls(uid || 'anon', photos);

      const excelPhotoUrls = photos
        .map((p, i) => uploadedAssets[i]?.publicUrl ?? p.uri)
        .filter(Boolean);

      let insertError: any = null;
      let effectiveTeamId: string | null = null;

      if (uid) {
        setBanner({ kind: 'info', text: 'Preparing database insert…' });

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

        const row = buildSubmissionRow(v, effectiveTeamId, uploadedAssets || []);

        if (!isOnline && autoQueueWhenOffline) {
          enqueueSubmission(row);
          setQueuedCount(readQueue().length);
          insertError = null;
        } else {
          setBanner({ kind: 'info', text: 'Saving to database…' });
          const { error } = await supabase.from('submissions').insert(row);
          insertError = error ?? null;

          if (insertError && String(insertError.message || '').toLowerCase().includes('network')) {
            enqueueSubmission(row);
            setQueuedCount(readQueue().length);
            insertError = null;
            setBanner({ kind: 'info', text: 'Offline detected. Submission queued locally.' });
          }
        }
      } else {
        insertError = { message: 'Not authenticated – saved to Excel/PDF only.' };
      }

      if (isWeb) {
        setBanner({ kind: 'info', text: 'Creating Excel…' });
        const { downloadSubmissionExcel } = await import('../../src/lib/exportExcel');
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
          priority_level: v.priorityLevel,
          photo_urls: excelPhotoUrls,
        });
      } else {
        setBanner({ kind: 'info', text: 'Excel export available on the web dashboard. PDF continues below.' });
      }

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
        priority_level: v.priorityLevel,
        photo_urls: excelPhotoUrls,
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
          if (mod?.downloadSubmissionPdf) {
            await mod.downloadSubmissionPdf(pdfPayload);
          }
        } catch {}
      }

      if (insertError) {
        setBanner({ kind: 'error', text: insertError.message ?? 'Row not saved (RLS). Files exported.' });
        return;
      }

      // Stash submitted values for optional defaults prompt
      setLastSubmittedVals(v);

      resetForm(true);
      setBanner({ kind: 'success', text: 'Submission Successful' });
      setShowRememberPrompt(true);
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message ?? 'Submit failed' });
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const setPriority = (val: '1'|'2'|'3') => {
    if (isWeb) {
      formRef.current.priorityLevel = val;
    } else {
      setNVals((prev) => ({ ...prev, priorityLevel: val }));
    }
    setTouched((t) => ({ ...t, priorityLevel: true }));
    scheduleAutosave();
  };

  const fillAddressFromLocation = useCallback(async () => {
    try {
      setGeoBusy(true);
      if (!isWeb) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setBanner({ kind: 'error', text: 'Location permission denied' });
          return;
        }
      }

      const getCoords = async () => {
        if (isWeb && typeof navigator !== 'undefined' && navigator.geolocation) {
          return await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              (err) => reject(err),
              { enableHighAccuracy: true, timeout: 10000 }
            );
          });
        }
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { latitude: position.coords.latitude, longitude: position.coords.longitude };
      };

      const coords = await getCoords();
      const places = await Location.reverseGeocodeAsync(coords);
      const first = places[0];
      const formatted = first
        ? [first.name, first.street, first.city, first.region, first.postalCode]
            .filter(Boolean)
            .join(', ')
        : `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;

      updateFieldValue('storeLocation', formatted);
      setBanner({ kind: 'success', text: 'Address filled from GPS' });
    } catch (err: any) {
      console.warn('geo lookup failed', err);
      setBanner({ kind: 'error', text: err?.message || 'Unable to fetch GPS address' });
    } finally {
      setGeoBusy(false);
    }
  }, [updateFieldValue, isWeb, setBanner]);

  const PriBtn = ({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) => (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1,
        borderColor: active ? (highContrast ? '#000' : '#111') : '#d1d5db',
        backgroundColor: active ? color : '#f9fafb',
        minHeight: targetMinHeight, justifyContent: 'center',
      }}
    >
      <Text style={{ fontWeight: '700', color: active ? '#fff' : '#111', fontSize: bodyFontSize }}>{label}</Text>
    </Pressable>
  );

  const rememberNow = async () => {
    try {
      const v = lastSubmittedVals || getValues();
      const prefs = {
        storeSite: v.storeSite?.trim() || undefined,
        storeLocation: v.storeLocation?.trim() || undefined,
        brand: v.brand?.trim() || undefined,
      } as const;

      await saveUserDefaults(uid, selectedTeamId || teamId, prefs);

      // Immediately apply prefs to current (fresh) form so user sees them
      const cur = getValues();
      const merged: FormValues = {
        ...cur,
        storeSite: prefs.storeSite ?? cur.storeSite,
        storeLocation: prefs.storeLocation ?? cur.storeLocation,
        brand: prefs.brand ?? cur.brand,
      } as FormValues;
      formRef.current = merged;
      setNVals(merged);
      setFormKey((k) => k + 1);
      scheduleAutosave();

      setBanner({ kind: 'success', text: 'Defaults saved and applied.' });
    } catch (e: any) {
      setBanner({ kind: 'error', text: e?.message || 'Failed to save defaults' });
    } finally {
      setShowRememberPrompt(false);
      setLastSubmittedVals(null);
    }
  };
  const rememberLater = () => {
    setShowRememberPrompt(false);
    setLastSubmittedVals(null);
  };

  const currentPri = (isWeb ? formRef.current.priorityLevel : nVals.priorityLevel) || '3';

  const scrollBottomPadding = 32 + (keyboardMetrics.visible ? keyboardMetrics.height + 64 : 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <LogoHeader title="Create Form" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: scrollBottomPadding }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ✨ NEW: proper document <title> for web */}
        <Head><title>Create New Form</title></Head>

        <View style={formStyles.card}>
        <Text style={{ fontSize: Math.round(20 * fontScale), fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>
          Create New Form
        </Text>

      <View style={{ marginBottom: 8 }}>
        <Text style={{ textAlign: 'center', fontSize: statusFontSize, color: isOnline ? '#16a34a' : '#b45309' }}>
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
          <Text style={{ color: 'white', textAlign: 'center', fontSize: bodyFontSize }}>{banner.text}</Text>
        </View>
      ) : null}

      {showRememberPrompt ? (
        <View style={{ backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#f59e0b', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 8, fontSize: labelFontSize }}>
            Save these as your defaults for this store/team?
          </Text>
          <Text style={{ color: '#92400e', marginBottom: 12, fontSize: statusFontSize }}>
            We can remember Store Name, Store Address, and Brand to prefill next time.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={rememberNow} style={{ flex: 1, backgroundColor: '#16a34a', paddingVertical: buttonPadV, borderRadius: 8, alignItems: 'center', minHeight: targetMinHeight, justifyContent: 'center' }}>
              <Text style={{ color: 'white', fontWeight: '700', fontSize: bodyFontSize }}>Save defaults</Text>
            </Pressable>
            <Pressable onPress={rememberLater} style={{ flex: 1, backgroundColor: '#e5e7eb', paddingVertical: buttonPadV, borderRadius: 8, alignItems: 'center', minHeight: targetMinHeight, justifyContent: 'center' }}>
              <Text style={{ fontWeight: '700', fontSize: bodyFontSize }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {uid && teamOptions.length > 1 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '700', marginBottom: 6, fontSize: labelFontSize }}>TEAM</Text>
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
                    minHeight: targetMinHeight, justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: '#111827', fontSize: bodyFontSize }}>
                    {t.name || t.team_id.slice(0, 8)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {isWeb ? (
        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
          <Pressable
            onPress={() => setAutoQueueWhenOffline((x) => !x)}
            style={{
              width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: highContrast ? '#000' : '#111',
              alignItems: 'center', justifyContent: 'center', backgroundColor: autoQueueWhenOffline ? '#16a34a' : 'white',
              minHeight: targetMinHeight, // keeps minimum tap size when spacing is tight
            }}
          >
            {autoQueueWhenOffline ? <Text style={{ color: 'white', fontSize: bodyFontSize }}>✓</Text> : null}
          </Pressable>
          <Text style={{ fontSize: bodyFontSize }}>Auto-queue when offline</Text>
        </View>
      ) : null}

      <Field
        name="storeSite" label="STORE NAME"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="storeLocation" label="STORE ADDRESS"
        labelAdornment={
          <Pressable
            onPress={fillAddressFromLocation}
            disabled={geoBusy}
            style={{
              backgroundColor: geoBusy ? '#cbd5f5' : '#1d4ed8',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
              {geoBusy ? 'Locating…' : 'Use GPS'}
            </Text>
          </Pressable>
        }
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="location" label="ITEM LOCATION IN STORE"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />

      <Field
        name="date" label="DATE" placeholder="YYYY-MM-DD"
        inputMode="text"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="brand" label="BRAND"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="conditions" label="SHELF CONDITIONS"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="pricePerUnit" label="PRICE PER UNIT" placeholder="$" keyboardType="numeric" inputMode="decimal"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="shelfSpace" label="TOTAL SHELF SPACE"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="onShelf" label="ITEMS ON SHELF"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="tags" label="TAGS UP BY ITEM"
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />
      <Field
        name="notes" label="NOTES" multiline
        formKey={formKey}
        formRef={formRef}
        onEdit={scheduleAutosave}
        nVals={nVals}
        setNVals={setNVals}
        errors={errors}
        touched={touched}
        setTouched={setTouched}
        typingStart={typingStart}
        typingEnd={typingEnd}
      />

      {/* NEW: PRIORITY LEVEL */}
      <Text style={{ fontWeight: '700', marginBottom: 6, fontSize: labelFontSize }}>PRIORITY LEVEL</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <PriBtn label="1" active={currentPri === '1'} color="#da291c" onPress={() => setPriority('1')} />
        <PriBtn label="2" active={currentPri === '2'} color="#eeba2b" onPress={() => setPriority('2')} />
        <PriBtn label="3" active={currentPri === '3'} color="#99e169" onPress={() => setPriority('3')} />
      </View>

      <Text style={{ fontWeight: '700', marginBottom: 8, fontSize: labelFontSize }}>PHOTOS</Text>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={{ position: 'relative' }}>
            <Image
              source={{ uri: p.uri }}
              style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: highContrast ? '#000' : '#111' }}
            />
            <Pressable
              onPress={() => removePhotoAt(i)}
              accessibilityRole="button"
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                backgroundColor: '#da291c',
                borderRadius: 12,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderWidth: 1,
                borderColor: 'white',
                minHeight: targetMinHeight, justifyContent: 'center',
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
          style={{ flex: 1, backgroundColor: btnBlue, paddingVertical: buttonPadV, borderRadius: 10, alignItems: 'center', minHeight: targetMinHeight, justifyContent: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700', fontSize: bodyFontSize }}>Take Photo</Text>
        </Pressable>
        <Pressable
          onPress={addFromLibrary}
          style={{ flex: 1, backgroundColor: btnBlue, paddingVertical: buttonPadV, borderRadius: 10, alignItems: 'center', minHeight: targetMinHeight, justifyContent: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700', fontSize: bodyFontSize }}>Add from Library</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={{
            flex: 1,
            backgroundColor: busy ? '#94a3b8' : btnBlue,
            paddingVertical: buttonPadV,
            borderRadius: 10,
            alignItems: 'center',
            minHeight: targetMinHeight,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700', fontSize: bodyFontSize }}>
            {busy ? 'Submitting…' : 'Submit'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          style={{
            flex: 1,
            backgroundColor: '#e5e7eb',
            paddingVertical: buttonPadV,
            borderRadius: 10,
            alignItems: 'center',
            minHeight: targetMinHeight,
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontWeight: '700', fontSize: bodyFontSize }}>Save</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{
            flex: 1,
            backgroundColor: '#da291c',
            paddingVertical: buttonPadV,
            borderRadius: 10,
            alignItems: 'center',
            minHeight: targetMinHeight,
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontWeight: '700', fontSize: bodyFontSize, color: '#ffffff' }}>Exit</Text>
        </Pressable>
      </View>

      {isWeb && pdfReady ? (
        <View style={{ marginTop: 12, gap: 8 as any }}>
          <Pressable
            onPress={onDownloadPdf}
            style={{
              backgroundColor: btnBlue,
              paddingVertical: buttonPadV,
              borderRadius: 10,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: highContrast ? '#000' : '#1d4ed8',
              minHeight: targetMinHeight, justifyContent: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '700', fontSize: bodyFontSize }}>Download PDF</Text>
          </Pressable>
          <Text style={{ fontSize: statusFontSize, color: '#334155', textAlign: 'center' }}>
            Some mobile browsers only allow one automatic download per tap. If the PDF didn’t auto-download, tap this button.
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Pressable
          onPress={() => setShowDebug((x) => !x)}
          style={{ alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6', minHeight: targetMinHeight, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: statusFontSize, color: '#334155' }}>{showDebug ? 'Hide' : 'Show'} debug</Text>
        </Pressable>
        {showDebug ? (
          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#111827', borderRadius: 8 }}>
            <Text style={{ color: '#93c5fd', fontFamily: 'monospace' as any, fontSize: statusFontSize }}>
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

      </View>

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
      {keyboardMetrics.visible ? (
        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: Math.max(keyboardMetrics.height + 16, 24),
            backgroundColor: '#111827',
            borderRadius: 999,
            alignItems: 'center',
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Done</Text>
        </Pressable>
      ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
