// apps/mobile/src/screens/LoginScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, Platform } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';

// Statically reference your logo at apps/mobile/assets/logo.png.
// If the file is missing, Metro will error at build time.
import logoPng from '../../assets/logo.png';

const isWeb = Platform.OS === 'web';

export default function LoginScreen() {
  const { signIn, signUp, signInWithOtp, resetPassword, demo } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // NEW: avoid double-submits across actions
  const [busy, setBusy] = useState(false);

  // Fallback if the logo fails to load (keeps banner from looking odd)
  const [logoOk, setLogoOk] = useState(true);

  // Refs (used to move focus on Enter on web)
  const emailRef = useRef<TextInput | null>(null);
  const pwRef = useRef<TextInput | null>(null);

  const emailTrim = useMemo(() => email.trim(), [email]);
  const passwordTrim = useMemo(() => password, [password]);

  const wrap =
    <T extends (...a: any[]) => Promise<any>>(fn: T) =>
    async (...a: Parameters<T>) => {
      if (busy) return; // prevent spamming buttons
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

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <View
        style={{
          width: 320,
          backgroundColor: '#eee',
          padding: 20,
          borderRadius: 12,
          boxShadow: isWeb ? ('0 4px 24px rgba(0,0,0,0.08)' as any) : undefined,
        } as any}
      >
        {/* Logo block: now scales the image to fill the banner height cleanly */}
        <View
          style={{
            height: 64,                // slightly taller banner so logos breathe
            backgroundColor: '#ddd',
            borderRadius: 8,
            marginBottom: 16,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',        // ensures no spillover on odd ratios
            paddingHorizontal: 12,     // keeps edges tidy
          }}
        >
          {logoOk ? (
            <Image
              source={logoPng}
              // Fill the banner's height while maintaining aspect ratio
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
              accessibilityLabel="Company logo"
              onError={() => setLogoOk(false)}
            />
          ) : (
            // Fallback if the image fails to resolve: keeps layout looking intentional
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
          // Web-only nicety to help browsers autofill
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
