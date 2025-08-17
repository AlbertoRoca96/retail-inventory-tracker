import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';

// set from Actions env; shows the banner but doesn't auto-redirect
const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

function goToHome() {
  // Prefer client-side routing
  try {
    router.replace('/home'); // Expo Router route (works when baseUrl is set)
    return;
  } catch (_) {
    // no-op, fall back to hard navigation on web
  }

  // Extra safety on web: send the browser to the *correct subpath*.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // e.g. "/retail-inventory-tracker/" -> "/retail-inventory-tracker/home"
    const base = window.location.pathname.endsWith('/')
      ? window.location.pathname
      : window.location.pathname + '/';
    const target = base + 'home';
    window.location.assign(target);
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const pwRef = useRef<TextInput>(null);

  const canSubmit = useMemo(() => true, []); // allow empty submit (your request)
  const submit = () => goToHome();

  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 16, justifyContent: 'center' }}>
      <View
        style={{
          width: 320,
          backgroundColor: 'rgba(221,221,221,0.6)',
          borderRadius: 12,
          padding: 16,
          gap: 12
        }}
      >
        <View
          style={{
            height: 60,
            backgroundColor: 'rgba(200,200,200,0.6)',
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8
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
          onSubmitEditing={() => pwRef.current?.focus?.()}
          style={{
            backgroundColor: 'white',
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd'
          }}
        />

        <TextInput
          ref={pwRef}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={submit} // Enter key submits on web & native
          blurOnSubmit
          style={{
            backgroundColor: 'white',
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd'
          }}
        />

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={{
            marginTop: 8,
            backgroundColor: canSubmit ? '#2563eb' : '#94a3b8',
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: 'center'
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
