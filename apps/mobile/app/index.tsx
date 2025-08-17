import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import { Link, router } from 'expo-router';

const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);

  // Compute a safe web href (/retail-inventory-tracker/home on Pages; /home elsewhere)
  const webBase =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.pathname.replace(/\/[^/]*$/, '') // strip trailing segment
      : '';
  const homeHref = Platform.OS === 'web' ? `${webBase}/home` : '/home';

  const go = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Hard navigation that always works on Pages
      window.location.assign(homeHref);
    } else {
      router.replace('/home');
    }
  };

  // If bypass flag is on, auto-continue straight to “home”
  useEffect(() => {
    if (BYPASS) go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => true, []); // allow empty fields for now

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
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={{
            backgroundColor: 'white',
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
          }}
        />

        <TextInput
          ref={passwordRef}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={go}   // Enter key submits
          blurOnSubmit
          style={{
            backgroundColor: 'white',
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#ddd',
          }}
        />

        {/* Link ensures proper web navigation, Pressable handles native press. */}
        <Link href={homeHref} asChild>
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
        </Link>

        {BYPASS ? (
          <Text style={{ textAlign: 'center', marginTop: 6, color: '#6b7280' }}>
            Dev bypass is ON (EXPO_PUBLIC_DEV_BYPASS_LOGIN=true)
          </Text>
        ) : null}
      </View>
    </View>
  );
}
