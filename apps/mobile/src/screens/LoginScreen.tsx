// apps/mobile/src/screens/LoginScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';

// Statically reference your logo at apps/mobile/assets/logo.png.
// If the file is missing, Metro will error at build time.
import logoPng from '../../assets/logo.png';

const isWeb = Platform.OS === 'web';

/**
 * Full-featured login screen:
 * - Same auth actions you already had (password, sign-up, magic link, reset)
 * - Keeps your show/hide password, busy state and messaging
 * - NEW: Logo fills the banner (no white halo) by using resizeMode="cover" and absolute fill.
 *   If your PNG was exported with extra transparent/white padding, the container crops it.
 *   If you ever *still* see a halo, the remaining white is baked inside the PNG—trim and re-export.
 */
export default function LoginScreen() {
  const { signIn, signUp, signInWithOtp, resetPassword, demo } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Prevent double taps
  const [busy, setBusy] = useState(false);

  // Fallback if logo fails to load (keeps layout steady)
  const [logoOk, setLogoOk] = useState(true);

  // Refs (used to move focus on Enter on web)
  const emailRef = useRef<TextInput | null>(null);
  const pwRef = useRef<TextInput | null>(null);

  const emailTrim = useMemo(() => email.trim(), [email]);
  const passwordTrim = useMemo(() => password, [password]);

  const wrap =
    <T extends (...a: any[]) => Promise<any>>(fn: T) =>
    async (...a: Parameters<T>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        await fn(...a);
        setInfo('Check your inbox if applicable.');
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong');
      } finally {
        setBusy(false);
      }
    };

  const onSignIn = wrap(async () => {
    if (!emailTrim || !passwordTrim) throw new Error('Email & password required');
    await signIn(emailTrim, passwordTrim);
  });

  const onSignUp = wrap(async () => {
    if (!emailTrim || !passwordTrim) throw new Error('Email & password required');
    await signUp(emailTrim, passwordTrim);
  });

  const onMagic = wrap(async () => {
    if (!emailTrim) throw new Error('Email required');
    await signInWithOtp(emailTrim); // magic link
  });

  const onForgot = wrap(async () => {
    if (!emailTrim) throw new Error('Email required');
    await resetPassword(emailTrim);
  });

  // Enter-to-submit ergonomics on web:
  const onEmailSubmit = () => {
    // On web, behave like native “next”: move focus to password
    // @ts-expect-error web-only focus
    pwRef.current?.focus?.();
  };
  const onPasswordSubmit = () => onSignIn();

  // Slightly taller banner so the logo reads nicely when cropped to the edges.
  const LOGO_BANNER_HEIGHT = 64;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <View
        style={{
          width: 320,
          backgroundColor: '#eee',
          padding: 20,
          borderRadius: 12,
          // RN Web accepts string shadows; native ignores it safely
          boxShadow: (isWeb ? '0 4px 24px rgba(0,0,0,0.08)' : undefined) as any,
        }}
      >
        {/* Logo banner — now *touches* the edges (no white halo) */}
        <View
          style={{
            height: LOGO_BANNER_HEIGHT,
            backgroundColor: '#ddd',
            borderRadius: 8,
            marginBottom: 16,
            overflow: 'hidden',      // crops any outer whitespace baked into the PNG
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {logoOk ? (
            <Image
              source={logoPng}
              // Absolute fill + cover => image touches top/bottom/left/right of the banner
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                width: '100%',
                height: '100%',
              }}
              resizeMode="cover"
              accessibilityLabel="Company logo"
              onError={() => setLogoOk(false)}
            />
          ) : (
            // Fallback keeps a clean look if the asset fails to load for any reason
            <Text style={{ fontSize: 20, color: '#777', fontWeight: '700' }}>Logo</Text>
          )}
        </View>

        {/* Email */}
        <TextInput
          ref={emailRef}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          // RN web nicety for autofill
          // @ts-expect-error RN web prop
          autoComplete={isWeb ? 'email' : undefined}
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={onEmailSubmit}
          style={theme.input}
        />

        {/* Password + show/hide toggle */}
        <View style={{ marginTop: 12 }}>
          <TextInput
            ref={pwRef}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            // RN web nicety for autofill
            // @ts-expect-error RN web prop
            autoComplete={isWeb ? 'current-password' : undefined}
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onPasswordSubmit}
            style={theme.input}
          />
          <Pressable
            onPress={() => setShowPw((s) => !s)}
            style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 6 }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#2563eb', fontWeight: '600' }}>
              {showPw ? 'Hide password' : 'Show password'}
            </Text>
          </Pressable>
        </View>

        {!!error && <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>}
        {!!info && <Text style={{ color: '#0a7', marginTop: 8 }}>{info}</Text>}
        {demo && <Text style={{ color: '#555', marginTop: 8 }}>Demo bypass is enabled</Text>}

        {/* Primary actions */}
        <Pressable
          onPress={onSignIn}
          disabled={busy}
          style={[
            theme.button,
            { marginTop: 8, opacity: busy ? 0.8 : 1 },
          ]}
        >
          <Text style={theme.buttonText}>{busy ? 'Working…' : 'Sign in'}</Text>
        </Pressable>

        <Pressable
          onPress={onSignUp}
          disabled={busy}
          style={[
            theme.button,
            { marginTop: 8, backgroundColor: '#475569', opacity: busy ? 0.8 : 1 },
          ]}
        >
          <Text style={theme.buttonText}>Create account</Text>
        </Pressable>

        <Pressable
          onPress={onMagic}
          disabled={busy}
          style={[
            theme.button,
            { marginTop: 8, backgroundColor: '#334155', opacity: busy ? 0.8 : 1 },
          ]}
        >
          <Text style={theme.buttonText}>Send magic link</Text>
        </Pressable>

        <Pressable
          onPress={onForgot}
          disabled={busy}
          style={[
            theme.button,
            { marginTop: 8, backgroundColor: '#64748b', opacity: busy ? 0.8 : 1 },
          ]}
        >
          <Text style={theme.buttonText}>Forgot password</Text>
        </Pressable>
      </View>
    </View>
  );
}
