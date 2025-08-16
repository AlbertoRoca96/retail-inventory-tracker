import React, { useState } from 'react';
import { View, Text, TextInput, Image, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { theme } from '../theme';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    await SecureStore.setItemAsync('sb-email', email);
    onLoggedIn();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={styles.card}>
        <Image source={{ uri: 'https://placehold.co/160x60?text=Logo' }} style={{ width: 160, height: 60, marginBottom: 16 }} />
        <TextInput placeholder="Email" autoCapitalize="none" style={styles.input} value={email} onChangeText={setEmail} />
        <TextInput placeholder="Password" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Enter" onPress={signIn} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.white },
  card: { width: '90%', backgroundColor: theme.colors.gray, borderRadius: theme.radius.xl, padding: theme.spacing(3), alignItems: 'center' },
  input: { width: '100%', borderWidth: 1, borderColor: theme.colors.black, borderRadius: theme.radius.lg, padding: theme.spacing(1), marginVertical: 6, backgroundColor: theme.colors.white },
  error: { color: 'red', marginTop: 8 }
});
