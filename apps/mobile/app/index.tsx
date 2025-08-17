import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { webBasePath } from '../src/lib/webBasePath';

const BYPASS =
  String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

function goHome() {
  const base = Platform.OS === 'web' ? webBasePath() : '';
  router.replace(`${base}/home`);
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // If bypass is on, skip straight to "home"
  useEffect(() => {
    if (BYPASS) goHome();
  }, []);

  const canSubmit = useMemo(() => true, []); // allow empty submit (your request)

  const go = () => {
    // (In dev, just navigate; later we can swap in real Supabase sign-in)
    goHome();
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 16, justifyContent: 'center' }}>
      <View
        style={{
          width: 320,
          backgroundColor: 'rgba(221,221,221,0.6)',
          borderRadius: 12,
          padding: 16,
          gap: 12,
        }}
      >
        <View
          style={{
            height: 60,
            backgroundColor: 'rgba(200,200,200,0.6)',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 28, color: '#777' }}>Logo</Text>
        </View>

        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => {
            const el = (document?.getElementById?.('password-input') as HTMLInputElement | undefined);
            el?.focus?.();
          }}
          style={{
            backgroundColor: 'white',
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
          }}
        />

        <TextInput
          id="password-input"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={go} // Enter submits here
          blurOnSubmit
          style={{
            backgroundColor: 'white',
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
          }}
        />

        <Pressable
          onPress={go}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={{
            marginTop: 8,
            backgroundColor: canSubmit ? '#2563eb' : '#94a3b8',
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>Enter</Text>
        </Pressable>

        {BYPASS ? (
          <Text style={{ textAlign: 'center', marginTop: 6, color: '#6b7280' }}>
            Dev bypass is ON (EXPO_PUBLIC_DEV_BYPASS_LOGIN=true)
          </Text>
        ) : null}
      </View>
    </View>
  );
}
