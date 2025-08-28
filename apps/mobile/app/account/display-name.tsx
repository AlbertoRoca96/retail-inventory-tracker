import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { supabase } from '../../src/lib/supabase';

export default function DisplayNamePrompt() {
  const { session } = useAuth();
  const user = session?.user || null;

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const md = (user?.user_metadata || {}) as any;
    setName(md.display_name || user?.email?.split('@')[0] || '');
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true); setErr(null);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name || null },
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // Back to app once set
    router.replace('/menu');
  };

  return (
    <View style={{ flex:1, padding:16, justifyContent:'center', gap:12 }}>
      <Text style={{ fontSize:22, fontWeight:'800', textAlign:'center' }}>
        What should we call you?
      </Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your display name"
        autoCorrect={false}
        autoCapitalize="words"
        style={{
          backgroundColor: 'white',
          borderWidth: 1, borderColor: '#111', borderRadius: 8,
          paddingHorizontal: 12, paddingVertical: 8, height: 44,
        }}
      />

      <Pressable
        onPress={save}
        disabled={saving || !name.trim()}
        style={{
          backgroundColor: !name.trim() ? '#94a3b8' : '#2563eb',
          padding: 12, borderRadius: 10, alignItems: 'center'
        }}
      >
        <Text style={{ color:'#fff', fontWeight:'700' }}>
          {saving ? 'Saving…' : 'Continue'}
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/account/settings')}
        style={{ alignSelf:'center', marginTop: 8 }}>
        <Text>More account settings</Text>
      </Pressable>

      {err ? <Text style={{ color:'#ef4444', textAlign:'center' }}>{err}</Text> : null}
    </View>
  );
}
