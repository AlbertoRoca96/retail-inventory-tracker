// apps/mobile/src/screens/LoginScreen.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView, ScrollView, SafeAreaView, StyleSheet, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { colors, theme } from '../theme';
import Button from '../components/Button';
import LogoHeader from '../components/LogoHeader';

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
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: colors.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  logo: {
    width: '90%',
    height: '90%',
  },
  logoFallback: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
  },
  welcome: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 2,
    borderColor: colors.accentGold,
    borderRadius: 28,
    padding: 24,
    gap: 20,
    backgroundColor: colors.white,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 18,
    backgroundColor: colors.surface,
  },
  passwordWrapper: {
    position: 'relative',
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 18,
    backgroundColor: colors.surface,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
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

  const togglePasswordVisibility = () => {
    Haptics.selectionAsync().catch(() => {});
    setShowPw((s) => !s);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader showBack showSettings settingsColor={colors.text} backColor={colors.text} />
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
              <View style={styles.logoCircle}>
                <Image
                  source={logoPng}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityLabel="RWS globe"
                  onError={() => setLogoOk(false)}
                />
              </View>
            ) : (
              <Text style={styles.logoFallback}>RWS</Text>
            )}
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in with your store email and password</Text>
          </View>

          <View style={styles.formCard}>
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
              style={styles.input}
            />

            <View style={styles.passwordWrapper}>
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
                title={busy ? 'Logging in…' : 'Login'}
                onPress={onSignIn}
                disabled={busy}
                fullWidth
                size="lg"
                variant="primary"
                accessibilityLabel="Login"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
