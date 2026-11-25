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

import { isCalendarDate, serializeProducts, validateProducts, type ReportProduct } from '../../src/lib/reportProducts';
import { saveDraftLocal, loadDraftLocal, clearDraftLocal, readQueue, enqueueSubmission, flushReportQueue, submitReport } from '../../src/lib/reportPersistence';
import LogoHeader from '../../src/components/LogoHeader';
import BrandPicker, { FALLBACK_REPORT_BRANDS } from '../../src/components/BrandPicker';
import ProductRowsEditor, { type ProductDraft } from '../../src/components/ProductRowsEditor';
import { colors } from '../../src/theme';
import { uploadFileToStorage, getSignedStorageUrl } from '../../src/lib/supabaseHelpers';
import { MAX_REPORT_PHOTOS, REPORT_PHOTO_SLOTS, reportPhotoFields } from '../../src/lib/reportPhotos';
import { generateUuid } from '../../src/lib/uuid';
import { assertRetryMatches, canonicalReport, isRetryableReportError, requestSignature, type ReportSaveRequest } from '../../src/lib/reportRequest';
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
const sanitizeFileBase = (input: string) =>
  (input || '')
    .trim()
    .replace(/[^a-z0-9_.-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'submission';
const buildFileBase = (storeName?: string, date?: string, userName?: string) => {
  const primary = (storeName || '').trim() || 'submission';
  const name = (userName || '').trim();
  return [primary, date, name].filter(Boolean).join(' - ');
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
  assetId?: string | null;
};

type FormValues = {
  storeSite: string;
  storeNumber: string;
  storeChain: string;
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

type PendingFormSaveRequest = ReportSaveRequest & {
  draft: { values: FormValues; productDrafts: ProductDraft[]; photos: Photo[] };
};

type PdfPayload = {
  store_site: string;
  store_number?: string;
  store_chain?: string;
  products?: ReportProduct[];
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

const todayISO = () => new Date().toISOString().slice(0, 10);

const getDefaultValues = (): FormValues => ({
  storeSite: '',
  storeNumber: '',
  storeChain: '',
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
  // Account changes cannot reuse another user's in-memory draft or outbox.
  return <ReportForm key={session?.user?.id || 'signed-out'} />;
}

function ReportForm() {
  const { session } = useAuth();
  const uid = useMemo(() => session?.user?.id ?? '', [session?.user?.id]);
  const submitterName = useMemo(() => {
    const md = session?.user?.user_metadata as any;
    return (md?.display_name || session?.user?.email?.split('@')[0] || '').trim();
  }, [session?.user?.user_metadata, session?.user?.email]);

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
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [autoQueueWhenOffline, setAutoQueueWhenOffline] = useState(true);

  const [hydrated, setHydrated] = useState(!isWeb);
  useEffect(() => {
    if (isWeb) setHydrated(true);
  }, []);

  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<keyof FormValues, boolean>>({
    storeSite: false, storeNumber: false, storeChain: false,
    location: false, date: false, brand: false,
    storeLocation: false, conditions: false, pricePerUnit: false,
    shelfSpace: false, onShelf: false, tags: false, notes: false,
    priorityLevel: false,
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  const formRef = useRef<FormValues>(getDefaultValues());
  const submissionIdRef = useRef(generateUuid());
  const pendingRequestRef = useRef<PendingFormSaveRequest | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [productErrors, setProductErrors] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([
    ...FALLBACK_REPORT_BRANDS,
  ]);

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
  }, []);

  const handleWebFile = useCallback((file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotos((p) => p.length >= MAX_REPORT_PHOTOS ? p : [
      ...p,
      {
        uri: url,
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        width: null,
        height: null,
        assetId: null,
      },
    ]);

  }, []);

  useEffect(() => {
    if (!isWeb) return;
    const handler = (e: BeforeUnloadEvent) => {
      const hasDraft = !!formRef.current.storeSite || photos.length > 0 || products.length > 0;
      if (hasDraft) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    if (hasWindow) window.addEventListener('beforeunload', handler);
    return () => { if (hasWindow) window.removeEventListener('beforeunload', handler); };
  }, [photos, products]);

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
  const hadDraft = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const skipNextAutosave = useRef(false);
  useEffect(() => {
    if (!hydrated || !uid || loaded.current) return;
    loaded.current = true;
    void (async () => {
    const draft = await loadDraftLocal<Partial<FormValues> & {
      photos?: Photo[];
      products?: ProductDraft[];
      submissionId?: string;
      pendingRequest?: PendingFormSaveRequest | null;
    }>(uid);
    if (draft) {
      hadDraft.current = true;
      submissionIdRef.current = draft.submissionId || generateUuid();
      if (draft.pendingRequest && draft.pendingRequest.ownerId === uid) {
        pendingRequestRef.current = draft.pendingRequest;
        setSelectedTeamId(String(draft.pendingRequest.payload.team_id));
      }
      const merged: FormValues = { ...getDefaultValues(), ...draft };
      formRef.current = merged;
      setNVals(merged);
      setPhotos(draft.photos ?? []);
      setProducts(draft.products ?? []);
      setFormKey((k) => k + 1);
      setBanner({ kind: 'info', text: draft.photos?.some((p) => p.uri.startsWith('blob:')) ? 'Draft loaded. Browser photos may need reattaching after reload.' : 'Draft loaded. Local photos are not backed up.' });
    } else {
      // No draft: try prefill from saved user defaults (per-team)
      (async () => {
        try {
          const defaults = await loadUserDefaults(uid, selectedTeamId || teamId);
          if (!formRef.current.storeSite && defaults && (defaults.storeSite || defaults.storeLocation || defaults.brand)) {
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
    })().then(() => setDraftReady(true)).catch((error) => setBanner({ kind: 'error', text: `Draft could not be loaded; stored data left untouched: ${error.message}` }));
  }, [hydrated, uid]);

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
    if (!hydrated || !draftReady || hadDraft.current) return;
    const cur = getValues();
    // Only prefill if fields are blank-ish (avoid clobbering user's in-progress input)
    const hasAny = !!(cur.storeSite?.trim() || cur.storeLocation?.trim() || cur.brand?.trim());
    if (hasAny) return;
    (async () => {
      try {
        const defaults = await loadUserDefaults(uid, selectedTeamId || teamId);
        if (!formRef.current.storeSite && defaults && (defaults.storeSite || defaults.storeLocation || defaults.brand)) {
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
  }, [uid, teamId, selectedTeamId, hydrated, draftReady]);

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
          setSelectedTeamId(previous => previous && opts.some(option => option.team_id === previous) ? previous : one);
        }
        setTeamLoading(false);
      }
    };
    fetchTeam();
    return () => { cancelled = true; };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    const loadBrands = async () => {
      const { data, error } = await supabase
        .from('report_brands')
        .select('name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (!cancelled && !error && data?.length) {
        setBrandOptions(data.map((row) => row.name));
      }
    };
    void loadBrands().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const getValues = useCallback((): FormValues => {
    return Object.fromEntries(Object.keys(getDefaultValues()).map(key => [key, formRef.current[key as keyof FormValues]])) as FormValues;
  }, []);
  if (!isWeb) formRef.current = nVals;

  const validate = useCallback((v: FormValues): ValidationErrors => {
    const e: ValidationErrors = {};
    if (!v.storeSite?.trim()) e.storeSite = 'Required';
    if (!v.brand?.trim() || !brandOptions.includes(v.brand)) e.brand = 'Choose an active brand';
    if (!v.storeLocation?.trim()) e.storeLocation = 'Required';
    if (!isCalendarDate(v.date)) e.date = 'Use YYYY-MM-DD';
    const p = safeNumber(v.pricePerUnit);
    if (v.pricePerUnit && p === null) e.pricePerUnit = 'Invalid number';
    const s = safeNumber(v.onShelf);
    if (v.onShelf && s === null) e.onShelf = 'Invalid number';
    if (!['1','2','3'].includes(v.priorityLevel)) e.priorityLevel = 'Choose 1, 2, or 3';
    return e;
  }, [brandOptions]);

  const latestDraft = useRef({ photos, products });
  latestDraft.current = { photos, products };
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutosave = useCallback(() => {
    if (!draftReady || !uid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const v = getValues();
        await saveDraftLocal({ ...v, ...latestDraft.current, submissionId: submissionIdRef.current, pendingRequest: pendingRequestRef.current }, uid);
        setLastSavedAt(new Date().toLocaleTimeString());
      } catch (error: any) {
        setBanner({ kind: 'error', text: `Draft save failed: ${error.message}` });
      }
    }, 350);
  }, [getValues, draftReady, uid]);

  useEffect(() => {
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    if (draftReady) scheduleAutosave();
  }, [draftReady, nVals, photos, products, scheduleAutosave]);

  const updateFieldValue = useCallback((name: Exclude<keyof FormValues, 'priorityLevel'>, value: string) => {
    if (isWeb) {
      formRef.current[name] = value;
      setFormKey((k) => k + 1);
    } else {
      setNVals((prev) => ({ ...prev, [name]: value }));
    }
    setTouched((prev) => ({ ...prev, [name]: true }));
    scheduleAutosave();
  }, [scheduleAutosave]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const tryFlush = async () => {
      try {
        setQueuedCount((await readQueue()).length);
        if (!isOnline || !uid) return;
        const flushed = await flushReportQueue(uid);
        setQueuedCount((await readQueue()).length);
        if (flushed) setBanner({ kind: 'success', text: `Synced ${flushed} queued reports.` });
      } catch (error: any) {
        setBanner({ kind: 'error', text: `Queued report retained: ${error.message}` });
      }
    };
    void tryFlush();
    const timer = setInterval(() => { void tryFlush(); }, 30000);
    return () => clearInterval(timer);
  }, [isOnline, uid]);

  const removePhotoAt = (idx: number) => {
    setPhotos((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });

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
      setPhotos((p) => p.length >= MAX_REPORT_PHOTOS ? p : [
        ...p,
        {
          uri: a.uri,
          fileName: a.fileName,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          assetId: a.assetId ?? null,
        },
      ]);

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
      setPhotos((p) => p.length >= MAX_REPORT_PHOTOS ? p : [
        ...p,
        {
          uri: a.uri,
          fileName: a.fileName,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          assetId: a.assetId ?? null,
        },
      ]);

    }
  };

  const onSave = async () => {
    try {
    if (!draftReady) throw new Error('Stored draft is not ready; nothing has been overwritten.');
    const v = getValues();
    await saveDraftLocal({ ...v, photos, products, submissionId: submissionIdRef.current, pendingRequest: pendingRequestRef.current }, uid);
    if (!isTypingRef.current) {
      setBanner({ kind: 'success', text: photos.length ? 'Draft saved locally. Photos are not backed up; browser photos may need reattaching after reload.' : 'Draft saved locally.' });
      setLastSavedAt(new Date().toLocaleTimeString());
    }
    } catch (error: any) { setBanner({ kind: 'error', text: `Draft save failed: ${error.message}` }); }
  };

  const restoreFrozenDraft = () => {
    const pending = pendingRequestRef.current;
    if (!pending || busy) return;
    const original = pending.draft;
    formRef.current = { ...original.values };
    setNVals({ ...original.values });
    setPhotos(original.photos.map(photo => ({ ...photo })));
    setProducts(original.productDrafts.map(product => ({ ...product })));
    setSelectedTeamId(String(pending.payload.team_id));
    setFormKey(key => key + 1);
    setErrors({});
    setProductErrors({});
    setBanner({ kind: 'info', text: pending.confirmed ? 'Saved request restored. Retry to generate the exports; no new report will be created.' : 'Original frozen request restored. Retry sends the same report ID and payload.' });
  };

  const resetForm = async (clearDraft: boolean) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    skipNextAutosave.current = true;
    submissionIdRef.current = generateUuid();
    const fresh = getDefaultValues();
    formRef.current = fresh;
    setNVals(fresh);
    setPhotos([]);
    setProducts([]);
    setFormKey((k) => k + 1);
    setErrors({});
    setProductErrors({});
    pendingRequestRef.current = null;
    if (clearDraft) await clearDraftLocal(uid);
  };

  const onDownloadPdf = async () => {
    if (!pdfReady) return;
    try {
      const mod = await import('../../src/lib/exportPdf.web');
      const fn = (mod as any)?.downloadSubmissionPdf ?? (mod as any)?.default?.downloadSubmissionPdf;
      if (typeof fn !== 'function') {
        throw new Error('PDF export function not found.');
      }
      const baseName = sanitizeFileBase(
        buildFileBase(pdfReady.store_site || pdfReady.store_location, pdfReady.date, submitterName)
      );
      await fn(pdfReady, { fileNamePrefix: baseName });
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
    submissionId: string,
    uploads: ({ path: string; publicUrl: string | null } | null)[]
  ) => {
    return {
      id: submissionId,
      user_id: uid || null,
      created_by: uid || null,
      team_id: effectiveTeamId,
      group_id: null,
      status: 'submitted',
      store_site: v.storeSite || null,
      store_number: v.storeNumber.trim() || null,
      store_chain: v.storeChain.trim() || null,
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
      ...reportPhotoFields(uploads),
      priority_level: Number(v.priorityLevel) || 3,
    };
  }, [uid]);

  const uploadSubmissionPhotos = useCallback(
    async (team: string, submissionId: string, photoList: Photo[]) => {
      const maxPhotos = MAX_REPORT_PHOTOS;
      if (photoList.length > maxPhotos) {
        throw new Error(`This release supports ${maxPhotos} photos per report. Remove the extra photos before submitting; your draft is retained.`);
      }
      const uploads: ({ path: string; publicUrl: string | null } | null)[] = Array.from(
        { length: maxPhotos },
        () => null
      );
      const failures: { index: number; message: string }[] = [];

      for (let i = 0; i < Math.min(photoList.length, maxPhotos); i++) {
        const photo = photoList[i];
        if (!photo?.uri) continue;

        const rawExt =
          photo.fileName?.split('.').pop() ||
          photo.uri.split('?')[0].split('.').pop() ||
          'jpg';
        const ext = rawExt.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';

        const path = `teams/${team}/submissions/${submissionId}/photo${i + 1}-${generateUuid()}.${ext}`;

        try {
          uploads[i] = await uploadFileToStorage({
            bucket: 'submissions',
            path,
            photo,
            upsert: false,
          });
        } catch (err: any) {
          const msg = err?.message ? String(err.message) : String(err);
          console.warn('photo upload failed for index', i, { uri: photo.uri, error: msg });
          failures.push({ index: i, message: msg });
        }
      }

      if (failures.length) {
        const which = failures.map((f) => `#${f.index + 1}`).join(', ');
        throw new Error(`Failed to upload photo(s): ${which}. Draft retained. Photos cannot be queued offline; reconnect and retry.`);
      }

      return uploads;
    },
    []
  );

  const onSubmit = async () => {
    let databaseSaved = false;
    try {
      if (busy) return;
      if (!draftReady) throw new Error('Wait for your saved draft to finish loading.');
      setBusy(true);

      const v = getValues();

      const e = validate(v);
      setErrors(e);
      const rowErrors = validateProducts(products);
      setProductErrors(rowErrors);
      if (Object.keys(e).length || Object.keys(rowErrors).length) {
        setBanner({ kind: 'error', text: 'Please fix the highlighted fields.' });
        return;
      }

      setPdfReady(null);
      const submissionId = submissionIdRef.current;
      // Persist the retry identity before touching the network.
      const signature = requestSignature(v, products, photos.map(photo => photo.uri));
      if (pendingRequestRef.current) assertRetryMatches(pendingRequestRef.current, uid, signature);
      await saveDraftLocal({ ...v, photos, products, submissionId, pendingRequest: pendingRequestRef.current }, uid);
      let excelPhotoUrls: string[] = photos.map((p) => p.uri).filter(Boolean);
      const productRows = serializeProducts(products);
      let queued = false;
      let effectiveTeamId: string | null = null;

      if (uid) {
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

        if (pendingRequestRef.current && pendingRequestRef.current.payload.team_id !== effectiveTeamId) {
          throw new Error('This frozen request belongs to its original team. Restore the frozen draft before retrying.');
        }
        if (!isOnline && photos.length) throw new Error('Offline reports with photos cannot be queued safely. Keep this draft and submit online; browser photos may need reattaching after reload.');
        if (!isOnline && !autoQueueWhenOffline) throw new Error('Offline. Save a draft or enable the offline queue.');

        let uploadedAssets: ({ path: string; publicUrl: string | null } | null)[] = [];
        if (photos.length && !pendingRequestRef.current) {
          setBanner({ kind: 'info', text: 'Uploading photos…' });
          uploadedAssets = await uploadSubmissionPhotos(effectiveTeamId, submissionId, photos);
        }
        excelPhotoUrls = photos
          .map((p, i) => uploadedAssets[i]?.publicUrl ?? p.uri)
          .filter(Boolean);

        setBanner({ kind: 'info', text: 'Preparing database insert…' });
        const row = pendingRequestRef.current?.payload ?? canonicalReport(buildSubmissionRow(v, effectiveTeamId, submissionId, uploadedAssets || []));
        if (!pendingRequestRef.current) {
          pendingRequestRef.current = { ownerId: uid, signature, payload: row, products: productRows, confirmed: false,
            draft: { values: { ...v }, productDrafts: products.map(product => ({ ...product })), photos: photos.map(photo => ({ ...photo })) } };
        }
        // Freeze the exact request before the first RPC. Never reupload/rebuild on retry.
        await saveDraftLocal({ ...v, photos, products, submissionId, pendingRequest: pendingRequestRef.current }, uid);

        if (pendingRequestRef.current.confirmed) {
          databaseSaved = true;
        } else if (!isOnline && autoQueueWhenOffline) {
          await enqueueSubmission(row, productRows);
          queued = true;
        } else {
          setBanner({ kind: 'info', text: 'Saving report and products…' });
          try {
            await submitReport(row, pendingRequestRef.current.products);
            databaseSaved = true;
            pendingRequestRef.current.confirmed = true;
            await saveDraftLocal({ ...v, photos, products, submissionId, pendingRequest: pendingRequestRef.current }, uid);
          } catch (error: any) {
            // Uploaded photo paths are durable; raw local photo URIs are never queued.
            if (!databaseSaved && autoQueueWhenOffline && isRetryableReportError(error)) {
              await enqueueSubmission(row, productRows);
              queued = true;
            } else throw error;
          }
        }
        setQueuedCount((await readQueue()).length);
        if (databaseSaved) {
          // Delivery links may expire; refresh for exports without changing the RPC payload.
          excelPhotoUrls = (await Promise.all(REPORT_PHOTO_SLOTS.map(async (slot) => {
            const path = row[`photo${slot}_path`];
            return path ? getSignedStorageUrl('submissions', String(path)) : null;
          }))).filter((url): url is string => !!url);
        }
      } else {
        throw new Error('Sign in before submitting. Your draft has not been cleared.');
      }
      if (queued) {
        await resetForm(true);
        setBanner({ kind: 'info', text: 'Report and products queued locally, not yet saved to the database. They will retry while this screen is open online.' });
        return;
      }

      if (isWeb) {
        setBanner({ kind: 'info', text: 'Creating Excel…' });
        const { downloadSubmissionExcel } = await import('../../src/lib/exportExcel');
        await downloadSubmissionExcel({
          store_site: v.storeSite || '',
          store_number: v.storeNumber, store_chain: v.storeChain, products: productRows,
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
        store_number: v.storeNumber, store_chain: v.storeChain, products: productRows,
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
          const mod = await import('../../src/lib/exportPdf.native');
          if (mod?.downloadSubmissionPdf) {
            const baseName = sanitizeFileBase(
              buildFileBase(v.storeSite || v.storeLocation, v.date, submitterName)
            );
            await mod.downloadSubmissionPdf(pdfPayload, { fileNamePrefix: baseName });
          }
        } catch (error: any) { throw new Error(`PDF export failed: ${error.message}`); }
      }

      // Stash submitted values for optional defaults prompt
      setLastSubmittedVals(v);

      await resetForm(true);
      setBanner({ kind: 'success', text: 'Submission Successful' });
      setShowRememberPrompt(true);
    } catch (e: any) {
      setBanner({ kind: 'error', text: `${databaseSaved ? 'Report saved, but export failed. ' : 'Report not confirmed saved. '}${e?.message || 'Submit failed'}. Draft retained.` });
    } finally {
      setBusy(false);
    }
  };

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

  // All hooks run before the hydration guard on every render.
  if (!hydrated || (uid && !draftReady)) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}><Text>{banner?.kind === 'error' ? banner.text : 'Loading your draft…'}</Text></View>;
  }

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
          {isWeb ? (isOnline ? 'Online' : 'Offline') : 'Network checked on save'} • Queue: {queuedCount} • Last saved draft: {lastSavedAt ?? '—'}
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

      {pendingRequestRef.current ? (
        <Pressable disabled={busy} onPress={restoreFrozenDraft} style={{ padding: 12, backgroundColor: '#dbeafe', borderRadius: 8, marginBottom: 12 }}>
          <Text style={{ textAlign: 'center', color: '#1e40af', fontWeight: '700' }}>Restore frozen save request</Text>
        </Pressable>
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

      {(
        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 as any }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Auto-queue when offline"
            accessibilityState={{ checked: autoQueueWhenOffline }}
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
      )}

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
      {(['storeNumber', 'storeChain'] as const).map((name) => (
        <Field key={name} name={name} label={name === 'storeNumber' ? 'STORE NUMBER' : 'STORE CHAIN'}
          formKey={formKey} formRef={formRef} onEdit={scheduleAutosave}
          nVals={nVals} setNVals={setNVals} errors={errors} touched={touched}
          setTouched={setTouched} typingStart={typingStart} typingEnd={typingEnd} />
      ))}
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
      <BrandPicker options={brandOptions} value={getValues().brand || ''}
        error={errors.brand} onChange={(value) => updateFieldValue('brand', value)} />
      <ProductRowsEditor rows={products} onChange={setProducts} errors={productErrors} />
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
        name="onShelf" label="FACES ON SHELF"
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

      <Text style={{ fontWeight: '700', marginBottom: 8, fontSize: labelFontSize }}>PHOTOS ({photos.length}/{MAX_REPORT_PHOTOS})</Text>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={{ position: 'relative' }}>
            <Image
              source={{ uri: p.uri }}
              style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: highContrast ? '#000' : '#111' }}
            />
            <Pressable
              accessibilityLabel={`Remove photo ${i + 1}`}
              disabled={busy}
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
          accessibilityRole="button"
          disabled={busy || photos.length >= MAX_REPORT_PHOTOS}
          onPress={takePhoto}
          style={{ flex: 1, backgroundColor: btnBlue, paddingVertical: buttonPadV, borderRadius: 10, alignItems: 'center', minHeight: targetMinHeight, justifyContent: 'center' }}
        >
          <Text style={{ color: 'white', fontWeight: '700', fontSize: bodyFontSize }}>Take Photo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy || photos.length >= MAX_REPORT_PHOTOS}
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
