// apps/mobile/src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';

export default function LoginScreen() {
  const { signIn, signUp, signInWithOtp, resetPassword, demo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const wrap = <T extends (...a: any[]) => Promise<any>>(fn: T) => async (...a: Parameters<T>) => {
    setError(null); setInfo(null);
    try { await fn(...a); setInfo('Check your inbox if applicable.'); } 
    catch (e: any) { setError(e?.message ?? 'Something went wrong'); }
  };

  const onSignIn = wrap(async () => {
    if (!email || !password) throw new Error('Email & password required');
    await signIn(email.trim(), password);
  });

  const onSignUp = wrap(async () => {
    if (!email || !password) throw new Error('Email & password required');
    await signUp(email.trim(), password);
  });

  const onMagic = wrap(async () => {
    if (!email) throw new Error('Email required');
    await signInWithOtp(email.trim()); // magic link
  });

  const onForgot = wrap(async () => {
    if (!email) throw new Error('Email required');
    await resetPassword(email.trim());
  });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <View style={{ width: 320, backgroundColor: '#eee', padding: 20, borderRadius: 12 }}>
        <View style={{ height: 60, backgroundColor: '#ddd', borderRadius: 8, marginBottom: 16, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 28, color: '#777' }}>Logo</Text>
        </View>

        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={theme.input}
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={[theme.input, { marginTop: 12 }]}
        />

        {!!error && <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>}
        {!!info && <Text style={{ color: '#0a7', marginTop: 8 }}>{info}</Text>}
        {demo && <Text style={{ color: '#555', marginTop: 8 }}>Demo bypass is enabled</Text>}

        <Pressable onPress={onSignIn} style={[theme.button, { marginTop: 16 }]}>
          <Text style={theme.buttonText}>Sign in</Text>
        </Pressable>

        <Pressable onPress={onSignUp} style={[theme.button, { marginTop: 8, backgroundColor: '#475569' }]}>
          <Text style={theme.buttonText}>Create account</Text>
        </Pressable>

        <Pressable onPress={onMagic} style={[theme.button, { marginTop: 8, backgroundColor: '#334155' }]}>
          <Text style={theme.buttonText}>Send magic link</Text>
        </Pressable>

        <Pressable onPress={onForgot} style={[theme.button, { marginTop: 8, backgroundColor: '#64748b' }]}>
          <Text style={theme.buttonText}>Forgot password</Text>
        </Pressable>
      </View>
    </View>
  );
}
