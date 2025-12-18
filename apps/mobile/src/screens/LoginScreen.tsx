// apps/mobile/src/screens/LoginScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView, ScrollView, SafeAreaView, StyleSheet, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme';
import { adminUserExists, hasSupabaseAdmin } from '../lib/supabaseAdmin';
import Button from '../components/Button';

// Statically reference your logo at apps/mobile/assets/logo.png.
// If the file is missing, Metro will error at build time.
import logoPng from '../../assets/logo.png';

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  logoWrap: {
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  logoSquare: {
    width: 200,
    height: 200,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '92%',
    height: '92%',
  },
  logoFallback: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
  },
  form: {
    width: '100%',
    maxWidth: 420,
    gap: 20,
  },
  input: {
    borderWidth: 3,
    borderColor: colors.accentGold,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    backgroundColor: colors.white,
    color: colors.text,
  },
  passwordWrapper: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 3,
    borderColor: colors.accentGold,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingRight: 56,
    fontSize: 18,
    backgroundColor: colors.white,
    color: colors.text,
  },
  eyeButton: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    color: colors.accentBlue,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 16,
  },
  infoText: {
    color: colors.accentGreen,
    fontSize: 16,
  },
  demoText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  primaryButtonWrapper: {
    width: '75%',
    alignSelf: 'center',
  },
});

/**
 * Full-featured login screen:
 * - Same auth actions you already had (password, sign-up, magic link, reset)
 * - Keeps your show/hide password, busy state and messaging
 * - NEW: Logo fills the banner (no white halo) by using resizeMode="cover" and absolute fill.
 *   If your PNG was exported with extra transparent/white padding, the container crops it.
 *   If you ever *still* see a halo, the remaining white is baked inside the PNG—trim and re-export.
 */
export default function LoginScreen() {
  const { signIn, signUp, resetPassword, demo } = useAuth();

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
    <T extends (...a: any[]) => Promise<string | void>>(fn: T) =>
    async (...a: Parameters<T>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const message = await fn(...a);
        if (message) setInfo(message);
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong');
      } finally {
        setBusy(false);
      }
    };

  const onSignIn = wrap(async () => {
    if (!emailTrim || !passwordTrim) throw new Error('Email & password required');

    let userExists: boolean | null = null;
    if (hasSupabaseAdmin) {
      try {
        userExists = await adminUserExists(emailTrim);
      } catch (err) {
        console.warn('Account lookup failed', err);
      }
    }

    if (userExists === false) {
      try {
        await signUp(emailTrim, passwordTrim);
      } catch (err: any) {
        if (typeof err?.message === 'string' && err.message.toLowerCase().includes('already registered')) {
          await signIn(emailTrim, passwordTrim);
          return;
        }
        throw err;
      }
      return 'Account created! Check your email to confirm, then log in.';
    }

    await signIn(emailTrim, passwordTrim);
  });

  const onForgot = wrap(async () => {
    if (!emailTrim) throw new Error('Email required');
    await resetPassword(emailTrim);
    return 'Password reset link sent. Check your inbox.';
  });

  // Enter-to-submit ergonomics on web:
  const onEmailSubmit = () => {
    // On web, behave like native “next”: move focus to password
    // @ts-expect-error web-only focus
    pwRef.current?.focus?.();
  };
  const onPasswordSubmit = () => onSignIn();

  // Slightly taller banner so the logo reads nicely when cropped to the edges.

  const togglePasswordVisibility = () => {
    Haptics.selectionAsync().catch(() => {});
    setShowPw((s) => !s);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            {logoOk ? (
              <View style={styles.logoSquare}>
                <Image
                  source={logoPng}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityRole="image"
                  accessibilityLabel="RWS logo"
                  onError={() => setLogoOk(false)}
                />
              </View>
            ) : (
              <Text style={styles.logoFallback}>RWS</Text>
            )}
          </View>

          <View style={styles.form}>
            <TextInput
              ref={emailRef}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
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
              style={styles.input}
            />

            <View style={styles.passwordWrapper}>
              <TextInput
                ref={pwRef}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                // RN web nicety for autofill
                // @ts-expect-error RN web prop
                autoComplete={isWeb ? 'current-password' : undefined}
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onPasswordSubmit}
                style={styles.passwordInput}
              />
              <Pressable
                onPress={togglePasswordVisibility}
                accessibilityRole="button"
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPw ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={colors.accentBlue}
                />
              </Pressable>
            </View>

            <Pressable
              onPress={onForgot}
              accessibilityRole="button"
              style={styles.forgotButton}
            >
              <Text style={styles.forgotText}>Forgot Password</Text>
            </Pressable>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {!!info && <Text style={styles.infoText}>{info}</Text>}
            {demo && <Text style={styles.demoText}>Demo bypass is enabled</Text>}

            <View style={styles.primaryButtonWrapper}>
              <Button
                title={busy ? 'Logging in…' : 'Log In'}
                onPress={onSignIn}
                disabled={busy}
                fullWidth
                size="lg"
                variant="primary"
                accessibilityLabel="Log In"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
