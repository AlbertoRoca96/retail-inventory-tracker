import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from '../components/Button';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';

export default function HomeScreen({ onNavigate }: { onNavigate: (r: 'create' | 'view' | 'admin' | 'home') => void }) {
  const logout = async () => { await supabase.auth.signOut(); };
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome</Text>
      <Button title="Create New Form" onPress={() => onNavigate('create')} />
      <Button title="View Submissions" onPress={() => onNavigate('view')} variant="secondary" />
      <Button title="Admin" onPress={() => onNavigate('admin')} variant="success" />
      <Button title="Log Out" onPress={logout} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: theme.spacing(2) }
});
