import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../src/theme';

const BYPASS = String(process.env.EXPO_PUBLIC_DEV_BYPASS_LOGIN || '').toLowerCase() === 'true';

export default function LoginScreen() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  useEffect(() => { if (BYPASS) router.replace('/menu'); }, []);
  const canSubmit = useMemo(() => true, []);

  const go = () => router.replace('/menu');

  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 16, justifyContent: 'center' }}>
      <View style={{ width: 360, backgroundColor: 'rgba(221,221,221,0.6)', borderRadius: 12, padding: 16, gap: 12 }}>
        <View style={{ height: 60, backgroundColor: 'rgba(200,200,200,0.6)', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 28, color: '#374151' }}>Logo</Text>
        </View>

        <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none"
          keyboardType="email-address" returnKeyType="next"
          onSubmitEditing={() => (document.getElementById('password') as HTMLInputElement|undefined)?.focus?.()}
          style={{ backgroundColor: colors.white, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.black }}
        />
        <TextInput id="password" placeholder="Password" value={password} onChangeText={setPassword}
          secureTextEntry returnKeyType="go" onSubmitEditing={go} blurOnSubmit
          style={{ backgroundColor: colors.white, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.black }}
        />

        <Pressable onPress={go} disabled={!canSubmit} accessibilityRole="button"
          style={{ marginTop: 8, backgroundColor: colors.gold, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ color: colors.black, fontSize: 16, fontWeight: '700' }}>Enter</Text>
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
