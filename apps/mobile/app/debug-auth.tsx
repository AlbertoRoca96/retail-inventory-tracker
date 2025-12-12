// apps/mobile/app/debug-auth.tsx
import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { supabase } from '../src/lib/supabase';

export default function DebugAuth() {
  const nukeAuth = async () => {
    try {
      await supabase.auth.signOut();
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        // Supabase stores under keys like "sb-<project-ref>-auth-token"
        Object.keys(window.localStorage ?? {})
          .filter((k) => k.startsWith('sb-'))
          .forEach((k) => window.localStorage?.removeItem(k));
      }
      Alert.alert('Done', 'Signed out and cleared local storage.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed clearing auth');
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
        Debug Auth
      </Text>
      <Pressable
        onPress={nukeAuth}
        style={{
          backgroundColor: '#ef4444',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontWeight: '700' }}>
          Sign out & Clear local storage
        </Text>
      </Pressable>
    </View>
  );
}
