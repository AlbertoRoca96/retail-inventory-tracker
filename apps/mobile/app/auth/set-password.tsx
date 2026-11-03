import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Button from '../../src/components/Button';
import LogoHeader from '../../src/components/LogoHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme';

export default function SetPasswordScreen() {
  const { ready, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [verifiedRecovery, setVerifiedRecovery] = useState(false);
  const [linkRejected, setLinkRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const verifyRecoveryLink = async () => {
      if (typeof window === 'undefined') {
        setCheckingLink(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      if (!tokenHash) {
        setCheckingLink(false);
        return;
      }
      if (type !== 'recovery') {
        setLinkRejected(true);
        setError('This is not a valid password recovery link.');
        setCheckingLink(false);
        return;
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (cancelled) return;

      if (verifyError || !data.session) {
        setLinkRejected(true);
        setError(verifyError?.message || 'This recovery link is invalid or expired.');
      } else {
        setVerifiedRecovery(true);
        window.history.replaceState({}, '', window.location.pathname);
      }
      setCheckingLink(false);
    };

    void verifyRecoveryLink();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setError(null);
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace('/menu');
    } catch (cause: any) {
      setError(cause?.message || 'Unable to set your password.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready || checkingLink) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Checking your recovery session…</Text>
      </View>
    );
  }

  if (linkRejected || (!session?.user && !verifiedRecovery)) {
    return (
      <SafeAreaView style={styles.safe}>
        <LogoHeader title="Set Password" />
        <View style={styles.center}>
          <Text style={styles.title}>This link is invalid or expired</Text>
          <Text style={styles.body}>
            Return to login and request a new password reset email.
          </Text>
          <Button title="Back to Login" onPress={() => router.replace('/login')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LogoHeader title="Set Password" />
      <View style={styles.form}>
        <Text style={styles.title}>Choose your password</Text>
        <Text style={styles.body}>
          Use at least 12 characters. This password will work in both the RWS app and website.
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          style={styles.input}
        />
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder="Confirm new password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          onSubmitEditing={submit}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title={busy ? 'Saving Password…' : 'Save Password'}
          onPress={submit}
          disabled={busy || !password || !confirmation}
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  form: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.accentGold,
    borderRadius: 16,
    borderWidth: 2,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: '#dc2626',
    fontSize: 16,
  },
});
