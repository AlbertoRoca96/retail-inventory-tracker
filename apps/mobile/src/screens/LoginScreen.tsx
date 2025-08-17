import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { theme } from '../theme';

export default function LoginScreen() {
  const { signIn, demo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    try {
      // Empty email/password + bypass flag => demo login
      await signIn(email, password);
    } catch (e: any) {
      setError(e?.message ?? 'Invalid login credentials');
    }
  };

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
        {demo && <Text style={{ color: '#555', marginTop: 8 }}>Demo mode</Text>}

        <Pressable onPress={onSubmit} style={[theme.button, { marginTop: 16 }]}>
          <Text style={theme.buttonText}>Enter</Text>
        </Pressable>
      </View>
    </View>
  );
}
