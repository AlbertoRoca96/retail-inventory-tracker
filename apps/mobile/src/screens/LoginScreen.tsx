// apps/mobile/src/screens/LoginScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';
import Button from '../components/Button';

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
  const { signIn, resetPassword, demo } = useAuth();

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
  const LOGO_BANNER_HEIGHT = 80;

  const togglePasswordVisibility = () => {
    Haptics.selectionAsync().catch(() => {});
    setShowPw((s) => !s);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          backgroundColor: '#f5f6fb',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#ffffff',
            padding: 24,
            borderRadius: 24,
            gap: 16,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 4,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View
              style={{
                height: LOGO_BANNER_HEIGHT,
                width: LOGO_BANNER_HEIGHT * 2,
                borderRadius: LOGO_BANNER_HEIGHT,
                overflow: 'hidden',
                backgroundColor: '#dbeafe',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {logoOk ? (
                <Image
                  source={logoPng}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                  accessibilityLabel="RWS globe"
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <Text style={{ fontSize: 28, fontWeight: '800', color: '#111827' }}>RWS</Text>
              )}
            </View>
            <Text style={{ fontSize: 26, fontWeight: '800', marginTop: 12 }}>Welcome back</Text>
            <Text style={{ fontSize: 16, color: '#475569', textAlign: 'center' }}>
              Sign in with your store email and password
            </Text>
          </View>

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
            style={[theme.input, { fontSize: 18 }]}
          />

          <View>
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
              style={[theme.input, { fontSize: 18 }]}
            />
            <Pressable
              onPress={togglePasswordVisibility}
              style={{ alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 6 }}
              accessibilityRole="button"
            >
              <Text style={{ color: '#2563eb', fontWeight: '600' }}>
                {showPw ? 'Hide password' : 'Show password'}
              </Text>
            </Pressable>
          </View>

          {!!error && <Text style={{ color: '#dc2626', fontSize: 16 }}>{error}</Text>}
          {!!info && <Text style={{ color: '#0f766e', fontSize: 16 }}>{info}</Text>}
          {demo && <Text style={{ color: '#1e293b', fontSize: 14 }}>Demo bypass is enabled</Text>}

          <Button
            title={busy ? 'Signing in…' : 'Sign in'}
            onPress={onSignIn}
            disabled={busy}
            fullWidth
            size="lg"
            variant="primary"
            accessibilityLabel="Sign in"
          />

          <Button
            title="Forgot password"
            onPress={onForgot}
            disabled={busy}
            fullWidth
            size="md"
            variant="secondary"
            accessibilityLabel="Reset password"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
